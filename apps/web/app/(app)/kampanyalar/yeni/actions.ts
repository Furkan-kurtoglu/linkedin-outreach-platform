"use server";
import { generateTemplates, validateAnswers, type Goal, type ProofKind, type Salutation, type Tone, type WizardAnswers } from "@hfo/core";
import { prisma, Prisma } from "@hfo/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { audit, requireContext } from "@/lib/context";
import { createStepsAndDrafts } from "@/lib/campaign";
import type { TargetingJson } from "@/lib/convert";
import { companyBrands } from "@/lib/company";
import { PRESETS } from "./presets";

export interface WizardState {
  errors?: Record<string, string>;
  values?: Record<string, string>;
}

const lines = (v: string) =>
  v
    .split(/\n|·/)
    .map((x) => x.trim())
    .filter(Boolean);

function targetingOf(g: (k: string) => string): TargetingJson {
  return {
    titles: lines(g("titles")),
    excludedTitles: lines(g("excludedTitles")),
    locations: lines(g("locations")),
    industries: lines(g("industries")),
    requiredCompanyKeywords: lines(g("requiredCompanyKeywords")),
    excludedCompanyKeywords: lines(g("excludedCompanyKeywords")),
    geoUrns: [],
    industryIds: [],
    engagementPostUrls: [],
    institutionKinds: [],
  };
}

type Ctx = Awaited<ReturnType<typeof requireContext>>;

/** Sihirbaz ve hazır temsilci kurulumu aynı yolu kullanır; başarıda kampanya, hatada alan hataları döner. */
async function makeCampaign(ctx: Ctx, v: Record<string, string>): Promise<{ state: WizardState } | { agent: { id: string; name: string } }> {
  const g = (k: string) => (v[k] ?? "").trim();

  const answers: WizardAnswers = {
    productPhrase: g("productPhrase"),
    companyName: g("companyName"),
    senderRole: g("senderRole"),
    audience: g("audience"),
    problem: g("problem"),
    benefits: lines(g("benefits")),
    proofs: lines(g("proofs")),
    proofKind: (["sektor", "kendi", "yok"].includes(g("proofKind")) ? g("proofKind") : "yok") as ProofKind,
    figures: lines(g("figures")),
    goal: (["gorusme", "demo", "pilot"].includes(g("goal")) ? g("goal") : "gorusme") as Goal,
    tone: (g("tone") === "samimi" ? "samimi" : "resmi") as Tone,
    salutation: (g("salutation") === "bey_hanim" ? "bey_hanim" : "ad_soyad") as Salutation,
    bannedPhrases: lines(g("bannedPhrases")),
    excludedCompanies: lines(g("excludedCompanies")),
    link: g("link") || undefined,
    tractionLine: g("tractionLine") || undefined,
  };
  const errors: Record<string, string> = {};
  for (const i of validateAnswers(answers)) errors[i.field] ??= i.message;
  if (!g("name")) errors.name = "Kampanyaya bir ad verin.";
  const titles = lines(g("titles"));
  if (!titles.length) errors.titles = "En az bir unvan yazın.";
  const company = await prisma.company.findFirst({ where: { id: g("companyId"), workspaceId: ctx.workspace.id } });
  if (!company) errors.companyId = "Önce Şirketler sayfasından bir şirket ekleyin.";
  const account = await prisma.linkedinAccount.findFirst({ where: { id: g("accountId"), workspaceId: ctx.workspace.id } });
  if (!account) errors.accountId = "Önce LinkedIn hesapları sayfasından bir hesap ekleyin.";
  if (Object.keys(errors).length || !account || !company) return { state: { errors, values: v } };

  const targeting = targetingOf(g);
  const set = generateTemplates(answers, { premium: account.premium });

  const agent = await prisma.$transaction(async (tx) => {
    const a = await tx.agent.create({
      data: {
        workspaceId: ctx.workspace.id,
        linkedinAccountId: account.id,
        companyId: company.id,
        name: g("name"),
        goal: answers.goal,
        offerContext: answers.productPhrase,
        tone: answers.tone,
        status: "DRAFT",
        mode: g("mode") === "FIND_ONLY" ? "FIND_ONLY" : "FIND_AND_OUTREACH",
        reviewMode: "REVIEW_ALL",
        budgetSharePct: Math.min(100, Math.max(5, Math.round(+g("share") || 100))),
        targeting: targeting as unknown as Prisma.InputJsonValue,
        fitRule: g("fitRule") || null,
        bannedPhrases: answers.bannedPhrases,
        requiredLink: answers.link ?? null,
        answers: answers as unknown as Prisma.InputJsonValue,
      },
    });
    await createStepsAndDrafts(tx, a.id, answers, set);
    for (const name of lines(g("targetAccounts")).slice(0, 500)) {
      await tx.targetAccount.upsert({ where: { agentId_name: { agentId: a.id, name } }, update: {}, create: { agentId: a.id, name, origin: "web" } });
    }
    // Hariç tutulan kurumlar tüm çalışma alanında geçerlidir
    for (const c of answers.excludedCompanies) {
      await tx.suppression.upsert({
        where: { workspaceId_kind_value: { workspaceId: ctx.workspace.id, kind: "company", value: c } },
        update: {},
        create: { workspaceId: ctx.workspace.id, kind: "company", value: c, reason: `${g("name")} kampanyası kurulurken eklendi` },
      });
    }
    return a;
  });
  await audit(ctx, "campaign.create", { agentId: agent.id, name: agent.name });
  return { agent };
}

export async function createCampaign(_: WizardState, form: FormData): Promise<WizardState> {
  const ctx = await requireContext();
  const v = Object.fromEntries([...form.entries()].map(([k, x]) => [k, String(x)])) as Record<string, string>;
  const r = await makeCampaign(ctx, v);
  if ("state" in r) return r.state;
  redirect(`/kampanyalar/${r.agent.id}?sekme=mesajlar`);
}

/**
 * Üç hazır temsilciyi (özel hastaneler, özel sağlık sigortası şirketleri, butik klinikler) taslak olarak kurar.
 * Şirket yoksa "HeAlthFintel" eklenir. Aynı adlı kampanya varsa atlanır; hiçbiri etkinleştirilmez.
 */
export async function createPresetAgents(): Promise<void> {
  const ctx = await requireContext();
  const account = await prisma.linkedinAccount.findFirst({ where: { workspaceId: ctx.workspace.id }, orderBy: { createdAt: "asc" } });
  if (!account) redirect("/kampanyalar/yeni?uyari=hesap");
  const company =
    (await prisma.company.findFirst({ where: { workspaceId: ctx.workspace.id, id: (await companyBrands(ctx.workspace.id)).active?.id } })) ??
    (await prisma.company.findFirst({ where: { workspaceId: ctx.workspace.id }, orderBy: { createdAt: "asc" } })) ??
    (await prisma.company.create({
      data: { workspaceId: ctx.workspace.id, name: "HeAlthFintel", website: "https://www.healthfintel.com.tr/", description: "Sağlık ve sigorta arasındaki dijital ve şeffaf köprü" },
    }));
  const existing = new Set((await prisma.agent.findMany({ where: { workspaceId: ctx.workspace.id }, select: { name: true } })).map((a) => a.name));
  let created = 0;
  let updated = 0;
  for (const p of PRESETS) {
    if (existing.has(p.values.name ?? "")) {
      // Aynı adlı taslak varsa hedefleme, uygunluk kuralı ve hedef kurumlar şablonla eşitlenir (mesajlara dokunulmaz)
      const agent = await prisma.agent.findFirst({ where: { workspaceId: ctx.workspace.id, name: p.values.name } });
      if (agent && agent.status === "DRAFT") {
        const g = (k: string) => (p.values[k] ?? "").trim();
        await prisma.agent.update({
          where: { id: agent.id },
          data: { targeting: targetingOf(g) as unknown as Prisma.InputJsonValue, fitRule: g("fitRule") || null, mode: g("mode") === "FIND_ONLY" ? "FIND_ONLY" : "FIND_AND_OUTREACH" },
        });
        for (const name of lines(g("targetAccounts")).slice(0, 500)) {
          await prisma.targetAccount.upsert({ where: { agentId_name: { agentId: agent.id, name } }, update: {}, create: { agentId: agent.id, name, origin: "web" } });
        }
        updated++;
      }
      continue;
    }
    const r = await makeCampaign(ctx, { ...p.values, companyId: company.id, companyName: company.name, accountId: account.id });
    if ("agent" in r) created++;
  }
  revalidatePath("/kampanyalar");
  redirect(`/kampanyalar?hazir=${created}&guncel=${updated}`);
}
