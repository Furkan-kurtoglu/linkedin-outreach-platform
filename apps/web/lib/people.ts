import "server-only";
import { prisma, type Prisma, type ProspectStage } from "@hfo/db";
import type { PersonRow } from "@/components/PeopleTable";

export const FILTERS = [
  ["tumu", "Tümü", undefined],
  ["birinci", "1. derece", undefined],
  ["belirsiz", "Belirsiz", ["NEEDS_REVIEW"]],
  ["sirada", "Sırada", ["QUEUED"]],
  ["davet", "Davet gitti", ["INVITE_SENT"]],
  ["baglandi", "Bağlandı", ["CONNECTED", "MESSAGED", "INMAIL_SENT"]],
  ["cevap", "Cevap verdi", ["REPLIED"]],
  ["bitti", "Biten", ["FINISHED", "WITHDRAWN"]],
  ["dogrulanacak", "Doğrulanacak", ["SKIPPED"]],
  ["elenen", "Elenenler", ["SKIPPED"]],
] as const satisfies readonly (readonly [string, string, readonly ProspectStage[] | undefined])[];

export function filterWhere(agentId: string | undefined, filtre: string | undefined, workspaceId: string, q?: string): Prisma.AgentProspectWhereInput {
  const where = baseWhere(agentId, filtre, workspaceId);
  const term = q?.trim().slice(0, 80);
  if (!term) return where;
  const has = { contains: term, mode: "insensitive" as const };
  return { AND: [where, { prospect: { OR: [{ fullName: has }, { company: has }, { title: has }] } }] };
}

function baseWhere(agentId: string | undefined, filtre: string | undefined, workspaceId: string): Prisma.AgentProspectWhereInput {
  const f = FILTERS.find(([k]) => k === filtre) ?? FILTERS[0];
  const base: Prisma.AgentProspectWhereInput = agentId ? { agentId } : { agent: { workspaceId } };
  // Elenen/atlanan kişiler ana listeleri kirletmesin; yalnızca "Elenenler" sekmesinde görünür
  // Doğrulanacaklar: kartta anlaşılamayıp profil ziyaretini bekleyenler; "Elenenler"den ayrı tutulur
  if (f[0] === "dogrulanacak") return { ...base, stage: "SKIPPED", skipReason: { startsWith: "Doğrulama bekliyor" } };
  if (f[0] === "elenen") return { AND: [base, { stage: "SKIPPED" }, { NOT: { skipReason: { startsWith: "Doğrulama bekliyor" } } }] };
  if (f[0] === "birinci") return { AND: [base, { stage: { not: "SKIPPED" } }, { OR: [{ branch: "CONNECTED" }, { prospect: { degree: 1 } }] }] };
  return f[2] ? { ...base, stage: { in: [...f[2]] } } : { ...base, stage: { not: "SKIPPED" } };
}

const fmt = (d: Date) => d.toLocaleString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });

const JOB_TEXT: Record<string, string> = {
  VISIT_PROFILE: "Profil ziyareti",
  SEND_INVITE: "Davet",
  SEND_MESSAGE: "Mesaj",
  SEND_INMAIL: "InMail",
  WITHDRAW_INVITE: "Daveti geri çekme",
};

export async function personRows(where: Prisma.AgentProspectWhereInput, take: number, skip = 0, sort: "puan" | "yeni" = "puan"): Promise<PersonRow[]> {
  const aps = await prisma.agentProspect.findMany({
    where,
    include: { prospect: true, agent: { select: { withdrawAfterDays: true, segments: { select: { id: true, name: true } } } } },
    orderBy: sort === "yeni" ? [{ createdAt: "desc" }] : [{ fitScore: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    take,
    skip,
  });
  const jobs = await prisma.job.findMany({
    where: { agentProspectId: { in: aps.map((a) => a.id) }, status: { in: ["PENDING", "AWAITING_APPROVAL", "RUNNING"] } },
    orderBy: { runAfter: "asc" },
  });
  const nextJob = new Map<string, (typeof jobs)[number]>();
  for (const j of jobs) if (j.agentProspectId && !nextJob.has(j.agentProspectId)) nextJob.set(j.agentProspectId, j);

  return aps.map((a) => {
    const j = nextJob.get(a.id);
    let next = "—";
    if (j) next = j.status === "AWAITING_APPROVAL" ? `${JOB_TEXT[j.type] ?? "İş"} onayınızda` : `${JOB_TEXT[j.type] ?? "İş"} · ${fmt(j.runAfter)}`;
    else if (a.stage === "NEEDS_REVIEW") next = "Kararınızı bekliyor";
    else if (a.stage === "QUEUED") next = "Sırada; bütçeye göre planlanacak";
    else if (a.stage === "INVITE_SENT" && a.inviteSentAt) {
      const left = a.agent.withdrawAfterDays - Math.floor((Date.now() - a.inviteSentAt.getTime()) / 86_400_000);
      next = `Kabul bekleniyor · ${Math.max(0, left)} gün sonra geri çekilir`;
    } else if (a.stage === "REPLIED") next = "Gelen kutusunda";
    return {
      apId: a.id,
      prospectId: a.prospectId,
      fullName: a.prospect.fullName,
      title: a.prospect.title,
      company: a.prospect.company,
      segment: a.agent.segments.find((s) => s.id === a.segmentId)?.name ?? null,
      degree: a.branch === "CONNECTED" ? 1 : a.prospect.degree,
      mutual: a.prospect.mutualConnections,
      score: a.fitScore,
      stage: a.stage,
      next,
      reason: a.stage === "SKIPPED" ? a.skipReason : a.fitReason,
    };
  });
}
