import "server-only";
import { matchesExcludedCompany } from "@hfo/core";
import { prisma } from "@hfo/db";

/**
 * Ayarlar'daki "hariç tutulan kurum" kuralları kurum havuzuna da uygulanır: eşleşen kurumlar
 * "Hariç" durumuna alınır (listede görünür ama kampanyaya eklenmez, ayrıntısı okunmaz).
 * Tekrar çağrılması zararsızdır; dönen değer yeni hariç tutulan kurum sayısıdır.
 */
export async function applyCompanyExclusions(workspaceId: string): Promise<number> {
  const rules = (await prisma.suppression.findMany({ where: { workspaceId, kind: "company" }, select: { value: true } })).map((s) => s.value).filter((v) => v.trim().length >= 3);
  if (!rules.length) return 0;
  const rows = await prisma.institution.findMany({ where: { workspaceId, status: { not: "EXCLUDED" } }, select: { id: true, name: true } });
  const hit = rows.filter((r) => rules.some((rule) => matchesExcludedCompany(r.name, rule))).map((r) => r.id);
  let n = 0;
  for (let i = 0; i < hit.length; i += 1000) {
    n += (await prisma.institution.updateMany({ where: { workspaceId, id: { in: hit.slice(i, i + 1000) } }, data: { status: "EXCLUDED" } })).count;
  }
  return n;
}
