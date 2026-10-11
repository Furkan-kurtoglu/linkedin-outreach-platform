import "server-only";
import { prisma } from "@hfo/db";

/**
 * KVKK saklama süresi: süresi dolan ve hiç cevap vermemiş, süreci de bitmiş kişiler silinir.
 * Cevap verenler ve fırsata dönüşenler silinmez (iş ilişkisi kayıtları).
 */
export async function purgeExpired(workspaceId: string, now = new Date()): Promise<number> {
  const expired = await prisma.prospect.findMany({
    where: {
      workspaceId,
      retainUntil: { lt: now },
      messages: { none: { direction: "INBOUND" } },
      opportunities: { none: {} },
      agents: { none: { stage: { in: ["QUEUED", "INVITE_SENT", "CONNECTED", "MESSAGED", "INMAIL_SENT", "REPLIED"] } } },
    },
    select: { id: true },
    take: 500,
  });
  if (!expired.length) return 0;
  await prisma.prospect.deleteMany({ where: { id: { in: expired.map((p) => p.id) } } });
  await prisma.auditLog.create({ data: { workspaceId, actor: "system", action: "retention.purge", details: { count: expired.length } } });
  return expired.length;
}

/** Kişiyle her iletişimde saklama süresi son iletişimden itibaren yeniden başlar. */
export async function extendRetention(prospectId: string, workspaceId: string, now = new Date()) {
  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { retentionMonths: true } });
  if (!ws) return;
  await prisma.prospect.update({ where: { id: prospectId }, data: { retainUntil: new Date(now.getTime() + ws.retentionMonths * 30 * 86_400_000) } });
}
