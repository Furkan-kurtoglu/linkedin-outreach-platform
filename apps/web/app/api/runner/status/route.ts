import { prisma } from "@hfo/db";
import { runnerAccount, unauthorized } from "@/lib/runner-auth";

/**
 * Çalışan, LinkedIn oturumunun durumunu ve okuyabildiği hesap bilgilerini bildirir.
 * Oturum açıksa hesap "bağlı" olur; kapandıysa gönderimler durur.
 */
export async function POST(req: Request) {
  const account = await runnerAccount(req);
  if (!account) return unauthorized();
  const body = (await req.json().catch(() => ({}))) as {
    loggedIn?: boolean;
    profileUrl?: string;
    displayName?: string;
    premium?: boolean;
    inmailCredits?: number;
  };
  const now = new Date();
  const paused = account.status === "PAUSED" && account.pausedUntil && account.pausedUntil > now;
  await prisma.linkedinAccount.update({
    where: { id: account.id },
    data: {
      runnerLastSeenAt: now,
      status: body.loggedIn ? (paused ? "PAUSED" : "CONNECTED") : "NEEDS_LOGIN",
      connectedAt: body.loggedIn && !account.connectedAt ? now : undefined,
      profileUrl: body.profileUrl ?? undefined,
      premium: typeof body.premium === "boolean" ? body.premium : undefined,
      inmailCredits: typeof body.inmailCredits === "number" ? body.inmailCredits : undefined,
    },
  });
  return Response.json({ ok: true });
}
