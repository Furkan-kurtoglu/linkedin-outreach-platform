"use server";
import { canonicalProfileUrl } from "@hfo/core";
import { prisma } from "@hfo/db";
import { redirect } from "next/navigation";
import { audit, requireContext } from "@/lib/context";
import { enqueueDiscover } from "@/lib/discover-queue";
import { urlHash } from "@/lib/results";

/** Aktif kampanyalar için hemen tarama başlatır (günlük otomatik taramayı beklemeden). */
export async function discoverNow() {
  const ctx = await requireContext();
  const agents = await prisma.agent.findMany({ where: { workspaceId: ctx.workspace.id, status: { in: ["ACTIVE", "DRAFT"] } }, select: { id: true } });
  let n = 0;
  for (const a of agents) if (await enqueueDiscover(a.id, undefined, { replace: true })) n++;
  await audit(ctx, "discover.now", { campaigns: n });
  redirect(`/kisi-bulma?baslatildi=${n}`);
}

/** Profil linkleri yapıştırılarak kişi ekleme (fuar, etkinlik listeleri). */
export async function importProfiles(form: FormData) {
  const ctx = await requireContext();
  const agent = await prisma.agent.findFirst({ where: { id: String(form.get("agentId")), workspaceId: ctx.workspace.id } });
  if (!agent) redirect("/kisi-bulma?sekme=ice&hata=kampanya");
  const urls = [...new Set(String(form.get("urls") ?? "").split(/[\s,;]+/).map((u) => canonicalProfileUrl(u)).filter((u): u is string => !!u))].slice(0, 500);
  const blocked = new Set((await prisma.suppression.findMany({ where: { workspaceId: ctx.workspace.id, kind: "person" }, select: { value: true } })).map((s) => s.value));
  const retainUntil = new Date(Date.now() + ctx.workspace.retentionMonths * 30 * 86_400_000);
  let added = 0;
  for (const url of urls) {
    if (blocked.has(urlHash(url))) continue;
    const slug = decodeURIComponent(url.split("/in/")[1] ?? "").replace(/-[0-9a-z]{6,}$/i, "");
    const name = slug.split("-").filter(Boolean).map((w) => w.charAt(0).toLocaleUpperCase("tr-TR") + w.slice(1)).join(" ") || "İsimsiz";
    const p = await prisma.prospect.upsert({
      where: { workspaceId_linkedinUrl: { workspaceId: ctx.workspace.id, linkedinUrl: url } },
      update: {},
      create: { workspaceId: ctx.workspace.id, linkedinUrl: url, fullName: name, source: "IMPORT", retainUntil },
      include: { agents: true },
    });
    if (p.agents.some((a) => ["QUEUED", "NEEDS_REVIEW", "INVITE_SENT", "CONNECTED", "MESSAGED", "INMAIL_SENT"].includes(a.stage) || a.agentId === agent.id)) continue;
    // Ad, unvan ve kurum profil ziyaretinde tamamlanır; içe aktarılan kişi kararınızı bekler
    await prisma.agentProspect.create({ data: { agentId: agent.id, prospectId: p.id, stage: "NEEDS_REVIEW", fitReason: "İçe aktarıldı; bilgileri profil ziyaretinde tamamlanacak.", priority: 60 } });
    added++;
  }
  await audit(ctx, "people.import", { agentId: agent.id, count: added });
  redirect(`/kisi-bulma?sekme=karar&eklendi=${added}`);
}
