/**
 * LinkedIn şirket araması: kartın ham metninden sektör, konum, takipçi ve çalışan sayısını
 * ayıklar. Ağ erişimi yoktur; yalnızca metin ayrıştırır, bu yüzden test edilebilir.
 */
import { institutionKey, kindFromText, looksPublic, type InstitutionDraft, type InstitutionKind, type InstitutionSize } from "./institutions";
import type { CompanyDetail, CompanyDiscoverData, FoundCompany } from "./protocol";
import { fold } from "./text";
import { TR_PROVINCES } from "./provinces";

/** Türkiye'nin LinkedIn konum kimliği (şirket merkezi süzgeci) */
export const TURKEY_GEO_URN = "102105699";

export interface ParsedCompany {
  name: string;
  linkedinUrl: string;
  industry?: string;
  city?: string;
  followers?: number;
  employees?: number;
  size?: InstitutionSize;
}

const num = (s: string): number => {
  const t = s.trim().toLowerCase().replace(/\s+/g, "");
  const m = t.match(/^([\d.,]+)(b|k|mn|m|bin)?$/);
  if (!m) return NaN;
  const raw = m[1]!;
  // "1,2" ondalık, "12.345" binlik ayracı
  const n = /^\d{1,3}(\.\d{3})+$/.test(raw) ? Number(raw.replace(/\./g, "")) : Number(raw.replace(",", "."));
  const mult = m[2] === "m" || m[2] === "mn" ? 1_000_000 : m[2] ? 1000 : 1;
  return Math.round(n * mult);
};

/** Çalışan sayısından boyut: ≤50 küçük, 51–500 orta, >500 büyük */
export function sizeFromEmployees(n: number | undefined): InstitutionSize | undefined {
  if (!n || n <= 0) return undefined;
  return n <= 50 ? "SMALL" : n <= 500 ? "MEDIUM" : "LARGE";
}

export function canonicalCompanyUrl(href: string): string | null {
  const m = href.match(/linkedin\.com\/company\/([^/?#]+)/i);
  return m ? `https://www.linkedin.com/company/${m[1]!.toLowerCase()}/` : null;
}

/** "Hastane ve Sağlık Hizmetleri • İstanbul, Türkiye" gibi satırdan sektör ve il */
function industryAndCity(line: string): { industry?: string; city?: string } {
  const parts = line.split(/\s+[•·|]\s+/).map((x) => x.trim()).filter(Boolean);
  if (parts.length < 2) return { industry: parts[0] };
  return { industry: parts[0], city: parts[1]!.split(",")[0]!.trim() };
}

export function parseCompanyCard(c: FoundCompany): ParsedCompany | null {
  const url = canonicalCompanyUrl(c.linkedinUrl);
  const name = c.name.replace(/\s+/g, " ").replace(/^©\s*\d{4}\s*/, "").trim();
  if (!url || name.length < 2) return null;
  const lines = c.text.split("\n").map((l) => l.trim()).filter((l) => l && l !== name);
  const out: ParsedCompany = { name, linkedinUrl: url };
  for (const l of lines) {
    const f = l.match(/([\d.,]+\s*(?:B|K|Mn|M|bin)?)\s*(?:takipçi|followers?)/i);
    if (f) {
      const n = num(f[1]!);
      if (n) out.followers = n;
      continue;
    }
    const range = l.match(/(\d[\d.]*)\s*[-–]\s*(\d[\d.]*)\s*(?:çalışan|employees)/i);
    const one = l.match(/(\d[\d.,]*)\s*\+?\s*(?:çalışan|employees)/i);
    if (range) out.employees = Math.round((num(range[1]!) + num(range[2]!)) / 2);
    else if (one) out.employees = num(one[1]!);
    else if (!out.industry && /[•·|]/.test(l)) Object.assign(out, industryAndCity(l));
  }
  if (!out.city) {
    // Yeni kart düzeni: ad, sektör, konum ("Güzeloba, Antalya" / "Kırklareli/Merkez") ayrı satırlarda
    const loc = lines.find((l) => /^[^\d•·|:;!?]{2,50}$/.test(l) && /,|\//.test(l) && !/takip|follow/i.test(l) && l.split(/\s+/).length <= 6);
    if (loc) {
      const parts = loc.split(",").map((x) => x.trim()).filter((x) => x && !/^(türkiye|turkey)$/i.test(x));
      const last = parts[parts.length - 1];
      if (last) out.city = last.split("/")[0]!.trim();
    }
  }
  if (!out.industry && lines[0] && !/[•·|,\/]/.test(lines[0]) && lines[0].length < 60 && !/takip|follow|çalışan|employees/i.test(lines[0])) out.industry = lines[0];
  if (out.city) out.city = TR_PROVINCES.find((p) => fold(p) === fold(out.city!)) ?? out.city;
  out.size = sizeFromEmployees(out.employees);
  return out;
}

/** Karttan kurum taslağı. Kamu kuruluşları ve tür çıkarılamayanlar elenir. */
export function companyToDraft(p: ParsedCompany, fallbackKind?: InstitutionKind): InstitutionDraft | null {
  if (looksPublic(p.name)) return null;
  const kindText = kindFromText(`${p.name} ${p.industry ?? ""}`);
  const kind = kindText !== "OTHER" ? kindText : fallbackKind ?? "OTHER";
  return {
    name: p.name,
    rawName: p.name,
    kind,
    city: p.city,
    orgType: p.industry,
    size: p.size,
    source: "linkedin",
  };
}

export interface CompanyIngestRow extends InstitutionDraft {
  key: string;
  linkedinUrl: string;
}

/** Çalışanın bildirdiği sonuçtan tekilleştirilmiş kurum satırları */
export function companiesFromResult(data: CompanyDiscoverData, fallbackKind?: InstitutionKind): CompanyIngestRow[] {
  const seen = new Set<string>();
  const out: CompanyIngestRow[] = [];
  // Aramada il adı geçtiyse başka ilin şirketleri alınmaz (LinkedIn il sözcüğünü süzgeç olarak kullanmaz)
  const labels = data.queries.map((q) => fold(q.label)).join(" ");
  const wanted = new Set(TR_PROVINCES.filter((p) => labels.includes(fold(p))).map((p) => fold(p)));
  for (const c of data.companies) {
    const parsed = parseCompanyCard(c);
    if (!parsed) continue;
    if (wanted.size && parsed.city && !wanted.has(fold(parsed.city))) continue;
    if (/psikolog|meslek hizmet birimi/i.test(parsed.name)) continue;
    const draft = companyToDraft(parsed, fallbackKind);
    if (!draft) continue;
    const key = institutionKey(draft.name, draft.city);
    if (seen.has(parsed.linkedinUrl) || key.startsWith("|")) continue;
    seen.add(parsed.linkedinUrl);
    out.push({ ...draft, key, linkedinUrl: parsed.linkedinUrl });
  }
  return out;
}

/** Aranacak anahtar kelimelerden LinkedIn şirket arama bağlantıları (en çok 6) */
export function companyQueryUrls(keywords: string[], opts: { geoUrn?: string; maxPages?: number; limit?: number } = {}): { label: string; url: string; maxPages: number }[] {
  const seen = new Set<string>();
  const out: { label: string; url: string; maxPages: number }[] = [];
  for (const k of keywords) {
    const kw = k.trim().replace(/\s+/g, " ");
    if (!kw || seen.has(fold(kw))) continue;
    seen.add(fold(kw));
    const p = new URLSearchParams({ keywords: kw, companyHqGeo: `["${opts.geoUrn ?? TURKEY_GEO_URN}"]`, origin: "FACETED_SEARCH" });
    out.push({ label: kw, url: `https://www.linkedin.com/search/results/companies/?${p.toString()}`, maxPages: Math.min(Math.max(opts.maxPages ?? 3, 1), 5) });
  }
  return out.slice(0, opts.limit ?? 6);
}

/** Anahtar kelimeleri illerle çarpar: "özel klinik" x ["Ankara","İzmir"] -> "özel klinik Ankara", "özel klinik İzmir". */
export function expandByCity(keywords: string[], cities: string[]): string[] {
  const kws = keywords.map((k) => k.trim()).filter(Boolean);
  if (!cities.length) return kws;
  return kws.flatMap((k) => cities.map((c) => `${k} ${c}`));
}

const ABOUT_LABELS: [keyof Omit<CompanyDetail, "id" | "empty">, RegExp][] = [
  ["website", /^(web ?sitesi|website)$/i],
  ["industry", /^(sektör|industry)$/i],
  ["sizeText", /^(şirket büyüklüğü|company size)$/i],
  ["hq", /^(genel merkez|headquarters|merkez)$/i],
  ["founded", /^(kuruluş|founded|kuruluş yılı)$/i],
  ["specialties", /^(uzmanlık alanları|specialties|uzmanlıklar)$/i],
];

/** Hakkında sayfasındaki "etiket - değer" çiftlerinden ayrıntı çıkarır. */
export function parseAboutPairs(id: string, pairs: { label: string; value: string }[]): CompanyDetail {
  const out: CompanyDetail = { id };
  for (const { label, value } of pairs) {
    const l = label.replace(/\s+/g, " ").trim();
    const v = value.replace(/\s+/g, " ").trim();
    if (!v) continue;
    const hit = ABOUT_LABELS.find(([, re]) => re.test(l));
    if (hit) out[hit[0]] = hit[0] === "website" ? v.replace(/[)\].,;]+$/, "") : v.slice(0, 300);
  }
  if (!out.website && !out.industry && !out.sizeText && !out.hq && !out.founded && !out.specialties) out.empty = true;
  return out;
}

/** "11-50 çalışan" / "201-500 employees" / "10.001+ çalışan" -> orta nokta (yaklaşık) */
export function employeesFromText(t: string | undefined): number | undefined {
  if (!t) return undefined;
  const r = t.match(/(\d[\d.,]*)\s*[-–]\s*(\d[\d.,]*)/);
  const clean = (x: string) => Number(x.replace(/[.,]/g, ""));
  if (r) return Math.round((clean(r[1]!) + clean(r[2]!)) / 2);
  const p = t.match(/(\d[\d.,]*)\s*\+/);
  if (p) return clean(p[1]!);
  const one = t.match(/(\d[\d.,]*)/);
  return one ? clean(one[1]!) : undefined;
}
