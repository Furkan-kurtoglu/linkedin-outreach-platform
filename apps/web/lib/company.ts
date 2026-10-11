import "server-only";
import { prisma } from "@hfo/db";
import { cookies } from "next/headers";

export const COMPANY_COOKIE = "hfo_company";

export interface CompanyBrand {
  id: string;
  name: string;
  /** Logo varsa önbellek anahtarı (adres değişsin diye); yoksa 0 */
  logoV: number;
}

/** Çalışma alanındaki şirketler ve çerezle seçilmiş aktif şirket (yoksa ilk şirket). */
export async function companyBrands(workspaceId: string): Promise<{ list: CompanyBrand[]; active: CompanyBrand | null }> {
  const rows = await prisma.company.findMany({ where: { workspaceId }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, logo: true } });
  const list = rows.map((c) => ({ id: c.id, name: c.name, logoV: c.logo ? c.logo.length : 0 }));
  const wanted = (await cookies()).get(COMPANY_COOKIE)?.value;
  return { list, active: list.find((c) => c.id === wanted) ?? list[0] ?? null };
}
