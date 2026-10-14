import "server-only";
import { planDiscovery, profileViewBudget, type JobPayload } from "@hfo/core";
import { prisma, Prisma } from "@hfo/db";
import { readTargeting } from "./convert";

/** Temsilcinin hedef kurumlarındaki unvanları taramak için kişi bulma işi kuyruğa alır (açık iş varsa atlar). */
export async function enqueueDiscover(agentId: string, onlyAccounts?: string[]): Promise<boolean> {
  const a = await prisma.agent.findUnique({ where: { id: agentId }, include: { linkedinAccount: true, targetAccounts: true } });
  if (!a) return false;
  // Tüm tarama bir kez sıraya alınır; yalnızca yeni eklenen kurumlar için (onlyAccounts) açık tarama varken de eklenir
  if (!onlyAccounts) {
    const open = await prisma.job.count({ where: { linkedinAccountId: a.linkedinAccountId, type: "DISCOVER", status: { in: ["PENDING", "RUNNING"] }, payload: { path: ["agentId"], equals: a.id } } });
    if (open) return false;
  }
  const t = readTargeting(a.targeting);
  const steps = planDiscovery({ titles: t.titles, geoUrns: t.geoUrns, industryIds: t.industryIds, targetAccounts: onlyAccounts ?? a.targetAccounts.map((x) => x.name), includeConnections: onlyAccounts ? false : a.includeConnections, engagementPostUrls: onlyAccounts ? [] : t.engagementPostUrls }).filter((s): s is typeof s & { url: string } => !!s.url);
  if (!steps.length) return false;
  // Tek işte yüzlerce adım sekiz dakikalık sınıra takılır; adımlar küçük işlere bölünür
  // (kurum adımları 4'er, geniş aramalar 2'şer) ve sırayla çalışır.
  const accounts = steps.filter((s) => s.source === "accounts");
  const others = onlyAccounts ? [] : steps.filter((s) => s.source !== "accounts");
  const chunks: (typeof steps)[] = [];
  for (let i = 0; i < accounts.length; i += 4) chunks.push(accounts.slice(i, i + 4));
  for (let i = 0; i < others.length; i += 2) chunks.push(others.slice(i, i + 2));
  const budget = profileViewBudget(a.linkedinAccount.premium);
  for (const chunk of chunks) {
    const payload: JobPayload = { type: "DISCOVER", agentId: a.id, steps: chunk, viewBudget: budget };
    await prisma.job.create({ data: { linkedinAccountId: a.linkedinAccountId, type: "DISCOVER", priority: 40, runAfter: new Date(), payload: payload as unknown as Prisma.InputJsonValue } });
  }
  return true;
}

/**
 * Ayrıntısı okunmamış LinkedIn şirketleri için "Hakkında" okuma işleri kuyruğa alır
 * (iş başına en çok 15 şirket; açık iş varsa atlar).
 */
export async function enqueueEnrichment(workspaceId: string, max = 45): Promise<number> {
  const acc = await prisma.linkedinAccount.findFirst({ where: { workspaceId, status: { not: "DISCONNECTED" } }, orderBy: { createdAt: "asc" }, select: { id: true } });
  if (!acc) return 0;
  const open = await prisma.job.count({ where: { linkedinAccountId: acc.id, type: "ENRICH_COMPANIES", status: { in: ["PENDING", "RUNNING"] } } });
  if (open > 0) return 0;
  const rows = await prisma.institution.findMany({ where: { workspaceId, linkedinUrl: { not: null }, enrichedAt: null, status: { not: "EXCLUDED" } }, select: { id: true, linkedinUrl: true }, take: max });
  let n = 0;
  for (let i = 0; i < rows.length; i += 15) {
    const companies = rows.slice(i, i + 15).map((r) => ({ id: r.id, url: r.linkedinUrl! }));
    const payload: JobPayload = { type: "ENRICH_COMPANIES", companies };
    await prisma.job.create({ data: { linkedinAccountId: acc.id, type: "ENRICH_COMPANIES", priority: 50, runAfter: new Date(), payload: payload as unknown as Prisma.InputJsonValue } });
    n++;
  }
  return n;
}
