import "server-only";
import { prisma, type ProspectStage } from "@hfo/db";
import { audit, type Ctx } from "./context";
import { urlHash } from "./results";

export type Snapshot = { id: string; stage: ProspectStage; skipReason: string | null }[];

/**
 * Kişiler üzerinde toplu işlem: uygun say, atla, kurumunu hariç tut, bir daha yazma.
 * Önceki durum kaydedilir; 10 dakika içinde geri alınabilir. Geri alma kaydının kimliğini döner.
 */
export async function applyBulk(ctx: Ctx, op: string, rawIds: string[], agentId?: string): Promise<string | null> {
  const ids = rawIds.slice(0, 500);
  if (!ids.length || !["ok", "skip", "exclude", "never"].includes(op)) return null;
  const aps = await prisma.agentProspect.findMany({
    where: { id: { in: ids }, agent: { workspaceId: ctx.workspace.id }, ...(agentId ? { agentId } : {}) },
    include: { prospect: true },
  });
  if (!aps.length) return null;
  const snap: Snapshot = aps.map((a) => ({ id: a.id, stage: a.stage, skipReason: a.skipReason }));
  const addedCompanies: string[] = [];
  const addedPeople: string[] = [];
  const cancelJobs = (apIds: string[], why: string) =>
    prisma.job.updateMany({ where: { agentProspectId: { in: apIds }, status: { in: ["PENDING", "AWAITING_APPROVAL"] } }, data: { status: "CANCELLED", lastError: why } });

  if (op === "ok") {
    await prisma.agentProspect.updateMany({ where: { id: { in: aps.filter((a) => a.stage === "NEEDS_REVIEW" || a.stage === "SKIPPED").map((a) => a.id) } }, data: { stage: "QUEUED", skipReason: null } });
  } else if (op === "skip") {
    const list = aps.filter((a) => ["QUEUED", "NEEDS_REVIEW", "INVITE_SENT", "CONNECTED", "MESSAGED"].includes(a.stage)).map((a) => a.id);
    await prisma.agentProspect.updateMany({ where: { id: { in: list } }, data: { stage: "SKIPPED", skipReason: "Elle atlandı." } });
    await cancelJobs(list, "Kişi atlandı.");
  } else if (op === "exclude") {
    const companies = [...new Set(aps.map((a) => a.prospect.company).filter((c): c is string => !!c))];
    for (const c of companies) {
      const key = { workspaceId_kind_value: { workspaceId: ctx.workspace.id, kind: "company", value: c } };
      if (await prisma.suppression.findUnique({ where: key })) continue;
      await prisma.suppression.create({ data: { workspaceId: ctx.workspace.id, kind: "company", value: c, reason: "Kişiler listesinden hariç tutuldu." } });
      addedCompanies.push(c);
    }
    const affected = await prisma.agentProspect.findMany({ where: { agent: { workspaceId: ctx.workspace.id }, prospect: { company: { in: companies } }, stage: { in: ["QUEUED", "NEEDS_REVIEW"] } } });
    for (const a of affected) if (!snap.some((s) => s.id === a.id)) snap.push({ id: a.id, stage: a.stage, skipReason: a.skipReason });
    await prisma.agentProspect.updateMany({ where: { id: { in: affected.map((a) => a.id) } }, data: { stage: "SKIPPED", skipReason: "Kurum hariç tutuldu." } });
    await cancelJobs(affected.map((a) => a.id), "Kurum hariç tutuldu.");
  } else if (op === "never") {
    for (const a of aps) {
      const value = urlHash(a.prospect.linkedinUrl);
      const key = { workspaceId_kind_value: { workspaceId: ctx.workspace.id, kind: "person", value } };
      if (await prisma.suppression.findUnique({ where: key })) continue;
      await prisma.suppression.create({ data: { workspaceId: ctx.workspace.id, kind: "person", value, reason: "Elle listeden çıkarıldı." } });
      addedPeople.push(value);
    }
    await prisma.agentProspect.updateMany({ where: { id: { in: aps.map((a) => a.id) } }, data: { stage: "SKIPPED", skipReason: "Kalıcı olarak listeden çıkarıldı." } });
    await cancelJobs(aps.map((a) => a.id), "Kişi listeden çıkarıldı.");
  }
  const log = await audit(ctx, `people.${op}`, { agentId, count: aps.length }, { snap, addedCompanies, addedPeople });
  return log.id;
}
