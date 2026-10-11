import { prisma } from "@hfo/db";
import { runnerAccount, unauthorized } from "@/lib/runner-auth";

/** Çalışan açılışta kendini tanıtır; panel hesap bilgisini döner. */
export async function POST(req: Request) {
  const account = await runnerAccount(req);
  if (!account) return unauthorized();
  const body = (await req.json().catch(() => ({}))) as { version?: string; platform?: string };
  await prisma.linkedinAccount.update({
    where: { id: account.id },
    data: { runnerLastSeenAt: new Date(), runnerVersion: body.version?.slice(0, 20), runnerPlatform: body.platform?.slice(0, 20) },
  });
  return Response.json({ accountId: account.id, displayName: account.displayName, premium: account.premium, status: account.status });
}
