import type { PollResponse, RunnerJob, JobPayload } from "@hfo/core";
import { prisma } from "@hfo/db";
import { planAccount } from "@/lib/planner";
import { purgeExpired } from "@/lib/retention";
import { runnerAccount, unauthorized } from "@/lib/runner-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const LOCK_MS = 10 * 60_000;

/**
 * Çalışan dakikada bir sorar: önce planlama yapılır (en fazla 2 dakikada bir), sonra zamanı
 * gelmiş en öncelikli iş kilitlenip verilir. Aynı iş iki kez verilmez.
 */
export async function POST(req: Request) {
  let account = await runnerAccount(req);
  if (!account) return unauthorized();
  const now = new Date();

  // Süresi dolan duraklatma kalkar
  if (account.status === "PAUSED" && account.pausedUntil && account.pausedUntil <= now) {
    account = await prisma.linkedinAccount.update({ where: { id: account.id }, data: { status: "CONNECTED", pausedUntil: null } });
  } else {
    await prisma.linkedinAccount.update({ where: { id: account.id }, data: { runnerLastSeenAt: now } });
  }
  const accountInfo = { status: account.status, pausedUntil: account.pausedUntil?.toISOString() ?? null };
  if (account.status !== "CONNECTED") return Response.json({ job: null, sleepSec: 120, account: accountInfo } satisfies PollResponse);

  // Çalışan çöktüyse kilidi süresi geçen işler geri döner
  await prisma.job.updateMany({
    where: { linkedinAccountId: account.id, status: "RUNNING", lockedUntil: { lt: now } },
    data: { status: "PENDING", lockedUntil: null },
  });

  try {
    await planAccount(account.id, { now });
    // Saklama süresi dolanların silinmesi: ortalama saatte bir kez yeter
    if (Math.random() < 1 / 60) await purgeExpired(account.workspaceId, now);
  } catch (e) {
    console.error("Planlama hatası", e);
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    const next = await prisma.job.findFirst({
      where: { linkedinAccountId: account.id, status: "PENDING", runAfter: { lte: now } },
      orderBy: [{ priority: "asc" }, { runAfter: "asc" }],
    });
    if (!next) break;
    const claimed = await prisma.job.updateMany({
      where: { id: next.id, status: "PENDING" },
      data: { status: "RUNNING", lockedUntil: new Date(now.getTime() + LOCK_MS) },
    });
    if (claimed.count === 1) {
      const job: RunnerJob = { id: next.id, payload: next.payload as unknown as JobPayload };
      return Response.json({ job, sleepSec: 0, account: accountInfo } satisfies PollResponse);
    }
  }

  const upcoming = await prisma.job.findFirst({
    where: { linkedinAccountId: account.id, status: "PENDING" },
    orderBy: { runAfter: "asc" },
    select: { runAfter: true },
  });
  const wait = upcoming ? Math.ceil((upcoming.runAfter.getTime() - now.getTime()) / 1000) : 60;
  return Response.json({ job: null, sleepSec: Math.max(20, Math.min(60, wait)), account: accountInfo } satisfies PollResponse);
}
