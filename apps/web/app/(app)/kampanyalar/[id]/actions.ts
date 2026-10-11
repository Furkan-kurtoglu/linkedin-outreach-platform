"use server";
import { GeminiProvider, assist, canUndo, checkMessage, type AssistAction, type AssistResult } from "@hfo/core";
import { prisma, Prisma } from "@hfo/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { audit, requireContext, type Ctx } from "@/lib/context";
import { readTargeting, toRules, type TargetingJson } from "@/lib/convert";
import { env } from "@/lib/env";
import { applyBulk, type Snapshot } from "@/lib/bulk";

const lines = (v: FormDataEntryValue | null) =>
  String(v ?? "")
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);

async function own(id: string) {
  const ctx = await requireContext();
  const agent = await prisma.agent.findFirst({ where: { id, workspaceId: ctx.workspace.id }, include: { linkedinAccount: true } });
  if (!agent) throw new Error("Kampanya bulunamadı.");
  return { ctx, agent };
}

const back = (id: string, tab: string, extra = "") => redirect(`/kampanyalar/${id}?sekme=${tab}${extra}`);

/* ---------- Durum ---------- */

export async function setStatus(form: FormData) {
  const { ctx, agent } = await own(String(form.get("id")));
  const to = form.get("to") === "ACTIVE" ? "ACTIVE" : "PAUSED";
  if (to === "ACTIVE") {
    // En az davet notu ya da bağlantıya ilk mesaj onaylı olmalı
    const approved = await prisma.template.count({ where: { status: "APPROVED", step: { agentId: agent.id, type: { in: ["INVITE", "ACCEPTED_MESSAGE", "CONNECTED_MESSAGE"] } } } });
    if (approved === 0) back(agent.id, "mesajlar", "&uyari=onay");
  }
  await prisma.agent.update({ where: { id: agent.id }, data: { status: to } });
  if (to === "PAUSED") {
    // Duraklatılınca bekleyen gönderimler iptal edilir; devam edince yeniden planlanır
    const apIds = (await prisma.agentProspect.findMany({ where: { agentId: agent.id }, select: { id: true } })).map((a) => a.id);
    await prisma.job.updateMany({
      where: { status: { in: ["PENDING", "AWAITING_APPROVAL"] }, agentProspectId: { in: apIds } },
      data: { status: "CANCELLED", lastError: "Kampanya duraklatıldı." },
    });
  }
  await prisma.linkedinAccount.update({ where: { id: agent.linkedinAccountId }, data: { lastPlannedAt: null } });
  await audit(ctx, to === "ACTIVE" ? "campaign.start" : "campaign.pause", { agentId: agent.id });
  revalidatePath("/", "layout");
}

export async function deleteCampaign(form: FormData) {
  const { ctx, agent } = await own(String(form.get("id")));
  if (String(form.get("confirm")).trim() !== agent.name) back(agent.id, "akis", "&uyari=silme");
  await prisma.agent.delete({ where: { id: agent.id } });
  await audit(ctx, "campaign.delete", { name: agent.name });
  redirect("/kampanyalar");
}

/* ---------- Akış ---------- */

export async function saveFlow(form: FormData) {
  const { ctx, agent } = await own(String(form.get("id")));
  const steps = await prisma.sequenceStep.findMany({ where: { agentId: agent.id } });
  const files = new Set((await prisma.fileAsset.findMany({ where: { workspaceId: ctx.workspace.id }, select: { id: true } })).map((f) => f.id));
  for (const s of steps) {
    const days = form.get(`delay-${s.id}`);
    const file = form.get(`file-${s.id}`);
    const data: Prisma.SequenceStepUpdateInput = {};
    if (days !== null && s.type === "FOLLOW_UP") data.delayHours = Math.min(60, Math.max(1, Math.round(+String(days) || 1))) * 24;
    if (file !== null && s.type !== "INVITE" && s.type !== "INMAIL") {
      const f = String(file);
      data.attachment = f && files.has(f) ? { connect: { id: f } } : { disconnect: true };
    }
    if (Object.keys(data).length) await prisma.sequenceStep.update({ where: { id: s.id }, data });
  }
  await prisma.agent.update({
    where: { id: agent.id },
    data: {
      visitBeforeInvite: form.get("visitBeforeInvite") === "on",
      includeConnections: form.get("includeConnections") === "on",
      withdrawAfterDays: Math.min(30, Math.max(14, Math.round(+String(form.get("withdrawAfterDays")) || 21))),
      maxPerCompany: Math.min(10, Math.max(1, Math.round(+String(form.get("maxPerCompany")) || 2))),
    },
  });
  await audit(ctx, "campaign.flow", { agentId: agent.id });
  back(agent.id, "akis", "&kaydedildi=1");
}

/* ---------- Hedefleme ---------- */

export async function saveTargeting(form: FormData) {
  const { ctx, agent } = await own(String(form.get("id")));
  const prev = readTargeting(agent.targeting);
  const t: TargetingJson = {
    ...prev,
    titles: lines(form.get("titles")),
    excludedTitles: lines(form.get("excludedTitles")),
    locations: lines(form.get("locations")),
    industries: lines(form.get("industries")),
    requiredCompanyKeywords: lines(form.get("requiredCompanyKeywords")),
    excludedCompanyKeywords: lines(form.get("excludedCompanyKeywords")),
    geoUrns: lines(form.get("geoUrns")).filter((x) => /^\d+$/.test(x)),
    engagementPostUrls: lines(form.get("engagementPostUrls")).filter((x) => /^https:\/\/www\.linkedin\.com\//.test(x)),
  };
  const review = String(form.get("reviewMode"));
  await prisma.agent.update({
    where: { id: agent.id },
    data: {
      targeting: t as unknown as Prisma.InputJsonValue,
      fitRule: String(form.get("fitRule") ?? "").trim() || null,
      budgetSharePct: Math.min(100, Math.max(5, Math.round(+String(form.get("share")) || 100))),
      reviewMode: review === "REVIEW_FIRST" || review === "AUTONOMOUS" ? review : "REVIEW_ALL",
      requiredLink: String(form.get("requiredLink") ?? "").trim() || null,
      bannedPhrases: lines(form.get("bannedPhrases")),
    },
  });
  await audit(ctx, "campaign.targeting", { agentId: agent.id });
  back(agent.id, "hedefleme", "&kaydedildi=1");
}

export async function addSegment(form: FormData) {
  const { agent } = await own(String(form.get("id")));
  const name = String(form.get("name") ?? "").trim();
  const keywords = String(form.get("keywords") ?? "").trim();
  if (name) await prisma.segment.create({ data: { agentId: agent.id, name, matchRule: keywords || null } });
  back(agent.id, "hedefleme");
}

export async function removeSegment(form: FormData) {
  const { agent } = await own(String(form.get("id")));
  await prisma.segment.deleteMany({ where: { id: String(form.get("segmentId")), agentId: agent.id } });
  back(agent.id, "hedefleme");
}

export async function addTargetAccounts(form: FormData) {
  const { agent } = await own(String(form.get("id")));
  for (const name of lines(form.get("names")).slice(0, 500)) {
    await prisma.targetAccount.upsert({ where: { agentId_name: { agentId: agent.id, name } }, update: {}, create: { agentId: agent.id, name } });
  }
  back(agent.id, "hedefleme");
}

export async function removeTargetAccount(form: FormData) {
  const { agent } = await own(String(form.get("id")));
  await prisma.targetAccount.deleteMany({ where: { id: String(form.get("accountId")), agentId: agent.id } });
  back(agent.id, "hedefleme");
}

/* ---------- Seçenekler ---------- */

export async function saveOptions(form: FormData) {
  const { ctx, agent } = await own(String(form.get("id")));
  const sources = ["mutual", "post", "school", "city"].filter((s) => form.get(`src-${s}`) === "on");
  const cal = String(form.get("calendarUrl") ?? "").trim();
  await prisma.agent.update({
    where: { id: agent.id },
    data: {
      firstLineEnabled: form.get("firstLineEnabled") === "on",
      firstLineSources: sources.length ? sources : ["mutual"],
      calendarEnabled: form.get("calendarEnabled") === "on",
      calendarUrl: /^https:\/\/\S+$/.test(cal) ? cal : null,
      englishEnabled: form.get("englishEnabled") === "on",
      openProfileEnabled: form.get("openProfileEnabled") === "on",
      inmailEnabled: form.get("inmailEnabled") === "on",
      inmailMinFitScore: Math.min(100, Math.max(50, Math.round(+String(form.get("inmailMinFitScore")) || 80))),
      inmailWeeklyMax: Math.min(30, Math.max(1, Math.round(+String(form.get("inmailWeeklyMax")) || 5))),
    },
  });
  await audit(ctx, "campaign.options", { agentId: agent.id });
  back(agent.id, "secenekler", "&kaydedildi=1");
}

/**
 * Seçeneğin değişkenini ({ilk_cumle?} / {takvim_linki?}) onaylı metinlere ekleyip yeni taslak
 * sürümler oluşturur. Onaylanana kadar gönderimde eski metin kullanılır.
 */
export async function addSlots(form: FormData) {
  const { ctx, agent } = await own(String(form.get("id")));
  const kind = form.get("kind") === "calendar" ? "calendar" : "firstLine";
  const types = kind === "firstLine" ? (["INVITE", "CONNECTED_MESSAGE", "OPEN_MESSAGE"] as const) : (["ACCEPTED_MESSAGE", "CONNECTED_MESSAGE", "FOLLOW_UP"] as const);
  const tpls = await prisma.template.findMany({ where: { status: "APPROVED", step: { agentId: agent.id, type: { in: [...types] } } }, include: { step: true } });
  let n = 0;
  for (const t of tpls) {
    let body = t.body;
    if (kind === "firstLine" && !body.includes("{ilk_cumle?}")) {
      body = /^(Merhaba|Hi) \{hitap\},/.test(body) ? body.replace(/^(Merhaba|Hi) \{hitap\},/, "$1 {hitap}, {ilk_cumle?}") : `{ilk_cumle?} ${body}`;
    } else if (kind === "calendar" && !body.includes("{takvim_linki?}")) {
      if (t.step.type === "FOLLOW_UP" && t.step.order > 3) continue; // son takibe randevu linki eklenmez
      body = `${body.trimEnd()} {takvim_linki?}`;
    } else continue;
    await newVersion(t.stepId, t.segmentId, t.lang, t.variant, body, false, ctx);
    n++;
  }
  back(agent.id, "mesajlar", `&eklendi=${n}`);
}

/* ---------- Mesajlar ---------- */

async function newVersion(stepId: string, segmentId: string | null, lang: string, variant: string, body: string, approve: boolean, ctx: Ctx) {
  const last = await prisma.template.findFirst({ where: { stepId, segmentId, lang, variant }, orderBy: { version: "desc" } });
  return prisma.$transaction(async (tx) => {
    if (approve) {
      await tx.template.updateMany({ where: { stepId, segmentId, lang, variant, status: "APPROVED" }, data: { status: "ARCHIVED" } });
    }
    // Aynı anahtardaki eski taslaklar yerine yenisi geçer
    await tx.template.updateMany({ where: { stepId, segmentId, lang, variant, status: "DRAFT" }, data: { status: "ARCHIVED" } });
    return tx.template.create({
      data: {
        stepId,
        segmentId,
        lang,
        variant,
        body,
        version: (last?.version ?? 0) + 1,
        status: approve ? "APPROVED" : "DRAFT",
        approvedAt: approve ? new Date() : null,
        approvedBy: approve ? ctx.user.id : null,
      },
    });
  });
}

export interface SaveTemplateState {
  ok?: string;
  error?: string;
}

export async function saveTemplate(_: SaveTemplateState, form: FormData): Promise<SaveTemplateState> {
  const { ctx, agent } = await own(String(form.get("id")));
  const step = await prisma.sequenceStep.findFirst({ where: { id: String(form.get("stepId")), agentId: agent.id } });
  if (!step) return { error: "Adım bulunamadı." };
  const segmentId = String(form.get("segmentId") ?? "") || null;
  if (segmentId && !(await prisma.segment.findFirst({ where: { id: segmentId, agentId: agent.id } }))) return { error: "Segment bulunamadı." };
  const lang = form.get("lang") === "en" ? "en" : "tr";
  const variant = /^[A-C]$/.test(String(form.get("variant"))) ? String(form.get("variant")) : "A";
  const body = String(form.get("body") ?? "").replace(/\r\n/g, "\n").trim();
  const approve = form.get("approve") === "1";
  if (!body) return { error: "Metin boş olamaz." };

  if (approve) {
    const excluded = (await prisma.suppression.findMany({ where: { workspaceId: ctx.workspace.id, kind: "company" }, select: { value: true } })).map((s) => s.value);
    const rules = toRules(agent, ctx.workspace, agent.linkedinAccount, excluded);
    const sample = body.replace(/\{hitap\}/g, "Ayşe Nur Karabudak").replace(/\{kurum\}/g, "Örnek Kurum").replace(/\{[a-z_]+\?\}/g, "");
    const issues = checkMessage(sample, step.type === "INVITE" ? "invite_note" : "message", step.type === "FOLLOW_UP" || step.type === "INMAIL" ? { ...rules, requiredLink: undefined } : rules);
    const bad = [...body.matchAll(/\{([a-z_]+)(\?)?\}/g)].filter((m) => !["hitap", "kurum", "ilk_cumle", "takvim_linki"].includes(m[1]!));
    if (bad.length) return { error: `Tanımsız değişken: ${bad[0]![0]}` };
    if (issues.length) return { error: `Onaylanamaz: ${issues.map((i) => i.message).join(" ")}` };
  }
  const t = await newVersion(step.id, segmentId, lang, variant, body, approve, ctx);
  await audit(ctx, approve ? "template.approve" : "template.draft", { agentId: agent.id, stepId: step.id, version: t.version, lang, variant });
  revalidatePath(`/kampanyalar/${agent.id}`);
  revalidatePath("/", "layout");
  return { ok: approve ? `Sürüm ${t.version} onaylandı; bundan sonraki gönderimlerde kullanılır.` : `Sürüm ${t.version} taslak olarak kaydedildi.` };
}

export async function archiveVariant(form: FormData) {
  const { agent } = await own(String(form.get("id")));
  await prisma.template.updateMany({
    where: { id: String(form.get("templateId")), step: { agentId: agent.id }, variant: { not: "A" } },
    data: { status: "ARCHIVED" },
  });
  revalidatePath(`/kampanyalar/${agent.id}`);
}

export async function assistTemplate(input: { id: string; stepId: string; body: string; action: AssistAction; instruction?: string }): Promise<AssistResult> {
  const { ctx, agent } = await own(input.id);
  const step = await prisma.sequenceStep.findFirst({ where: { id: input.stepId, agentId: agent.id } });
  if (!step) return { ok: false, reason: "unavailable", message: "Adım bulunamadı." };
  const key = env.geminiKey();
  const excluded = (await prisma.suppression.findMany({ where: { workspaceId: ctx.workspace.id, kind: "company" }, select: { value: true } })).map((s) => s.value);
  const a = (agent.answers ?? {}) as { productPhrase?: string; audience?: string; proofs?: string[]; companyName?: string };
  return assist(
    {
      action: input.action,
      template: input.body.slice(0, 4000),
      kind: step.type === "INVITE" ? "invite_note" : "message",
      instruction: input.instruction?.slice(0, 300),
      businessContext: [a.companyName, a.productPhrase, a.audience, ...(a.proofs ?? [])].filter(Boolean).join(". "),
      rules: { ...toRules(agent, ctx.workspace, agent.linkedinAccount, excluded), requiredLink: step.type === "FOLLOW_UP" || step.type === "INMAIL" ? undefined : agent.requiredLink ?? undefined },
    },
    key ? new GeminiProvider(key) : null,
  );
}

/* ---------- Kişiler: toplu işlem ve geri alma ---------- */

export async function bulkPeople(form: FormData) {
  const { ctx, agent } = await own(String(form.get("id")));
  const tab = `kisiler${form.get("filtre") ? `&filtre=${encodeURIComponent(String(form.get("filtre")))}` : ""}`;
  const logId = await applyBulk(ctx, String(form.get("op")), form.getAll("ap").map(String), agent.id);
  revalidatePath("/", "layout");
  back(agent.id, tab, logId ? `&geri=${logId}` : "");
}

export async function undoAction(form: FormData) {
  const ctx = await requireContext();
  const log = await prisma.auditLog.findFirst({ where: { id: String(form.get("auditId")), workspaceId: ctx.workspace.id } });
  const redirectTo = String(form.get("back") ?? "/");
  if (log && canUndo(log, new Date())) {
    const u = log.undoData as { snap?: Snapshot; addedCompanies?: string[]; addedPeople?: string[] };
    for (const s of u.snap ?? []) {
      await prisma.agentProspect.updateMany({ where: { id: s.id, agent: { workspaceId: ctx.workspace.id } }, data: { stage: s.stage, skipReason: s.skipReason } });
    }
    if (u.addedCompanies?.length) await prisma.suppression.deleteMany({ where: { workspaceId: ctx.workspace.id, kind: "company", value: { in: u.addedCompanies } } });
    if (u.addedPeople?.length) await prisma.suppression.deleteMany({ where: { workspaceId: ctx.workspace.id, kind: "person", value: { in: u.addedPeople } } });
    await prisma.auditLog.update({ where: { id: log.id }, data: { undoneAt: new Date() } });
    // İptal edilen işler yeniden planlanır
    await prisma.linkedinAccount.updateMany({ where: { workspaceId: ctx.workspace.id }, data: { lastPlannedAt: null } });
  }
  revalidatePath("/", "layout");
  redirect(redirectTo.startsWith("/") ? redirectTo.replace(/[?&]geri=[^&]*/, "") : "/");
}
