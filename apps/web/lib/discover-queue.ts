import "server-only";
import { planDiscovery, profileViewBudget, type JobPayload } from "@hfo/core";
import { prisma, Prisma } from "@hfo/db";
import { readTargeting } from "./convert";

/** Temsilcinin hedef kurumlarındaki unvanları taramak için kişi bulma işi kuyruğa alır (açık iş varsa atlar). */
export async function enqueueDiscover(agentId: string): Promise<boolean> {
  const a = await prisma.agent.findUnique({ where: { id: agentId }, include: { linkedinAccount: true, targetAccounts: true } });
  if (!a) return false;
  const open = await prisma.job.count({ where: { linkedinAccountId: a.linkedinAccountId, type: "DISCOVER", status: { in: ["PENDING", "RUNNING"] }, payload: { path: ["agentId"], equals: a.id } } });
  if (open) return false;
  const t = readTargeting(a.targeting);
  const steps = planDiscovery({ titles: t.titles, geoUrns: t.geoUrns, industryIds: t.industryIds, targetAccounts: a.targetAccounts.map((x) => x.name), includeConnections: a.includeConnections, engagementPostUrls: t.engagementPostUrls }).filter((s): s is typeof s & { url: string } => !!s.url);
  if (!steps.length) return false;
  const payload: JobPayload = { type: "DISCOVER", agentId: a.id, steps, viewBudget: profileViewBudget(a.linkedinAccount.premium) };
  await prisma.job.create({ data: { linkedinAccountId: a.linkedinAccountId, type: "DISCOVER", priority: 40, runAfter: new Date(), payload: payload as unknown as Prisma.InputJsonValue } });
  return true;
}
