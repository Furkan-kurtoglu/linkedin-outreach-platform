import "server-only";
import { featuresOf, learn, pooledOutcomes, titleGroupOf, type Model, type Outcome } from "@hfo/core";
import { prisma } from "@hfo/db";

/**
 * Çalışma alanındaki tüm temsilcilerin sonuçlarından ortak model kurar. Hangi sektörde olursa olsun
 * "genel müdür kabul eder mi, 2. derece mi daha çok yanıt verir" gibi kalıplar paylaşılır.
 * Kendi temsilcinin sonuçları iki kat ağırlıklıdır. Yapay zekâ modeli değil, sayıma dayalı istatistiktir;
 * kişi verisi dışarı çıkmaz.
 */
export async function pooledModel(workspaceId: string, agentId?: string): Promise<{ model: Model; own: number; others: number }> {
  const rows = await prisma.agentProspect.findMany({
    where: { agent: { workspaceId }, OR: [{ inviteSentAt: { not: null } }, { branch: "CONNECTED", stage: { notIn: ["QUEUED", "SKIPPED", "NEEDS_REVIEW"] } }] },
    select: { agentId: true, branch: true, connectedAt: true, repliedAt: true, prospect: { select: { title: true, degree: true, source: true } } },
    orderBy: { createdAt: "desc" },
    take: 5000,
  });
  const own: Outcome[] = [];
  const others: Outcome[] = [];
  for (const a of rows) {
    const o: Outcome = {
      features: featuresOf({ titleGroup: titleGroupOf(a.prospect.title), degree: a.prospect.degree ?? undefined, source: a.prospect.source.toLowerCase() }),
      success: a.branch === "CONNECTED" ? !!a.repliedAt : !!a.connectedAt,
    };
    (a.agentId === agentId ? own : others).push(o);
  }
  return { model: learn(pooledOutcomes(own, others)), own: own.length, others: others.length };
}
