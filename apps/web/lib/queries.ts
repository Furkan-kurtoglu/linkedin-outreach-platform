import "server-only";
import { deriveAlerts, nextOpenSlot, type DerivedAlert } from "@hfo/core";
import { prisma } from "@hfo/db";
import { toScheduleConfig } from "./convert";

/** Son mesajı karşı taraftan gelen (yanıt bekleyen) konuşmaların kişi kimlikleri */
export async function awaitingReplyIds(workspaceId: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ prospectId: string; direction: string }[]>`
    SELECT DISTINCT ON (m."prospectId") m."prospectId", m."direction"::text AS direction
    FROM "Message" m JOIN "Prospect" p ON p.id = m."prospectId"
    WHERE p."workspaceId" = ${workspaceId}
    ORDER BY m."prospectId", m."sentAt" DESC`;
  return rows.filter((r) => r.direction === "INBOUND").map((r) => r.prospectId);
}

export async function navCounts(workspaceId: string) {
  const [queue, inbox] = await Promise.all([
    prisma.job.count({ where: { status: "AWAITING_APPROVAL", linkedinAccount: { workspaceId } } }),
    awaitingReplyIds(workspaceId).then((x) => x.length),
  ]);
  return { queue, inbox };
}

export interface AccountAlert extends DerivedAlert {
  accountName: string;
}

/** Hesapların durumundan üretilen uyarılar (panelin üstündeki bant) */
export async function workspaceAlerts(workspaceId: string, now = new Date()): Promise<AccountAlert[]> {
  const accounts = await prisma.linkedinAccount.findMany({ where: { workspaceId } });
  const out: AccountAlert[] = [];
  for (const a of accounts) {
    if (!a.runnerTokenHash) continue; // henüz kurulmamış hesap için uyarı yerine kurulum listesi gösterilir
    const config = toScheduleConfig(a);
    const inWindow = nextOpenSlot(now, config, [])?.getTime() === now.getTime();
    const [pendingInvites, invitesWeek] = await Promise.all([
      prisma.job.count({ where: { linkedinAccountId: a.id, type: "SEND_INVITE", status: { in: ["PENDING", "AWAITING_APPROVAL"] } } }),
      prisma.job.count({ where: { linkedinAccountId: a.id, type: "SEND_INVITE", status: "DONE", finishedAt: { gte: new Date(now.getTime() - 7 * 86_400_000) } } }),
    ]);
    for (const al of deriveAlerts(
      {
        status: a.status,
        runnerLastSeenAt: a.runnerLastSeenAt ?? undefined,
        pausedUntil: a.pausedUntil ?? undefined,
        inSendingWindow: inWindow,
        invitesLeftThisWeek: a.weeklyInvites - invitesWeek - a.externalInvites7d,
        pendingInvites,
      },
      now,
    )) {
      out.push({ ...al, message: a.lastWarning && al.kind === "LINKEDIN_WARNING" ? `${al.message} (${a.lastWarning})` : al.message, accountName: a.displayName });
    }
  }
  return out;
}
