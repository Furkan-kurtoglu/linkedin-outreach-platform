import type { JobResult } from "@hfo/core";
import { prisma } from "@hfo/db";
import { handleResult } from "@/lib/results";
import { runnerAccount, unauthorized } from "@/lib/runner-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ERRORS = new Set(["session_expired", "linkedin_warning", "invite_limit", "not_found", "cannot_message", "transient"]);

/** Çalışan işin sonucunu bildirir. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const account = await runnerAccount(req);
  if (!account) return unauthorized();
  const { id } = await params;
  const job = await prisma.job.findFirst({ where: { id, linkedinAccountId: account.id } });
  if (!job) return Response.json({ error: "İş bulunamadı." }, { status: 404 });
  if (job.status !== "RUNNING") return Response.json({ ok: true, ignored: true });

  const raw = (await req.json().catch(() => null)) as Partial<JobResult> | null;
  let result: JobResult;
  if (raw && raw.ok === true) result = { ok: true, data: (raw as { data?: never }).data };
  else if (raw && raw.ok === false && typeof raw.error === "string" && ERRORS.has(raw.error)) result = raw as JobResult;
  else result = { ok: false, error: "transient", message: "Çalışandan anlaşılmayan sonuç geldi." };

  await handleResult(account, job, result);
  return Response.json({ ok: true });
}
