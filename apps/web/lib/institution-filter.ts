import type { Prisma } from "@hfo/db";

export interface InstSearch {
  q?: string;
  tur?: string;
  ilce?: string;
  durum?: string;
  kaynak?: string;
  il?: string;
  boyut?: string;
  sektor?: string;
}

export const KIND_LABEL: Record<string, string> = { HOSPITAL: "Hastane", MEDICAL_CENTER: "Tıp merkezi", CLINIC: "Klinik", DENTAL: "Diş", INSURER: "Sigorta", OTHER: "Diğer" };
export const SIZE_LABEL: Record<string, string> = { SMALL: "Küçük", MEDIUM: "Orta", LARGE: "Büyük" };
export const STATUS_LABEL: Record<string, string> = { NEW: "Yeni", SELECTED: "Seçili", EXCLUDED: "Hariç" };

export function institutionWhere(workspaceId: string, sp: InstSearch): Prisma.InstitutionWhereInput {
  const w: Prisma.InstitutionWhereInput = { workspaceId };
  if (sp.q) w.name = { contains: sp.q, mode: "insensitive" };
  const kinds = (sp.tur ?? "").split(",").filter((k) => KIND_LABEL[k]);
  if (kinds.length) w.kind = { in: kinds };
  if (sp.ilce) w.district = { contains: sp.ilce, mode: "insensitive" };
  if (sp.il) w.city = { equals: sp.il, mode: "insensitive" };
  if (sp.durum && STATUS_LABEL[sp.durum]) w.status = sp.durum;
  if (sp.kaynak) w.source = sp.kaynak;
  if (sp.boyut && SIZE_LABEL[sp.boyut]) w.size = sp.boyut;
  if (sp.sektor) w.orgType = { equals: sp.sektor, mode: "insensitive" };
  return w;
}
