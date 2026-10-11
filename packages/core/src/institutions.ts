/**
 * Kurum Ar-Ge: kurum listelerini (Sağlık Bakanlığı, OpenStreetMap, yapıştırma) tek biçime getirir.
 * Ağ erişimi yoktur; yalnızca metin ayrıştırır, bu yüzden test edilebilir.
 */
import { fold } from "./text";

export type InstitutionKind = "HOSPITAL" | "MEDICAL_CENTER" | "CLINIC" | "DENTAL" | "INSURER" | "OTHER";
export type InstitutionSize = "SMALL" | "MEDIUM" | "LARGE";

export interface InstitutionDraft {
  name: string;
  rawName: string;
  kind: InstitutionKind;
  city?: string;
  district?: string;
  orgType?: string;
  size?: InstitutionSize;
  website?: string;
  source: "moh" | "osm" | "paste" | "seed" | "linkedin";
}

const trLower = (s: string) => s.toLocaleLowerCase("tr-TR");

/** Türkçe kuralla küçültünce bozulan yabancı marka sözcükleri (MEMORIAL -> memorıal olmasın) */
const FOREIGN = new Set(["memorial", "hospital", "liv", "medicana", "medical", "medipol", "international", "british", "intercontinental", "medistate", "florence", "nightingale", "avicenna", "group", "health", "healthcare", "clinic", "center", "centre", "park", "vm", "mlp", "care", "city", "american", "german", "estethica", "mega", "plus", "dental", "doctors", "metropol", "emsey", "kolan", "ethica", "hisar", "tema"]);

const capWord = (w: string) => w.charAt(0).toLocaleUpperCase("tr-TR") + w.slice(1);
const trTitle = (s: string) =>
  s
    .split(/(\s+|-|\/|\()/)
    .map((w) => {
      if (!/^[\p{L}]/u.test(w)) return w;
      const plain = w.toLocaleLowerCase("en-US");
      return FOREIGN.has(plain) ? capWord(plain) : capWord(trLower(w));
    })
    .join("");

/** "ÖZEL ACIBADEM ADANA HASTANESİ" -> "Acıbadem Adana Hastanesi" */
export function cleanInstitutionName(raw: string): string {
  let s = raw.replace(/\s+/g, " ").trim();
  s = s.replace(/^(T\.?C\.?\s+)?(ÖZEL|Özel|özel)\s+/u, "");
  s = s.replace(/\s+(ÖZEL|Özel)\s+/u, " ");
  const allCaps = s === s.toLocaleUpperCase("tr-TR");
  return allCaps ? trTitle(s) : s;
}

/** Kurumun aynı olup olmadığını anlamak için anahtar: katlanmış ad + il */
export function institutionKey(name: string, city?: string): string {
  return `${fold(cleanInstitutionName(name)).replace(/[^a-z0-9]+/g, " ").trim()}|${fold(city ?? "")}`;
}

export function kindFromText(text: string): InstitutionKind {
  const t = fold(text);
  if (/sigorta|emeklilik|insurance/.test(t)) return "INSURER";
  if (/\bdis\b|agiz ve dis|dental|dentist/.test(t)) return "DENTAL";
  if (/hastane|hospital/.test(t)) return "HOSPITAL";
  if (/tip merkezi|medical center|medical centre|saglik merkezi/.test(t)) return "MEDICAL_CENTER";
  if (/klinik|klinig|clinic|poliklinik|estetik|goz merkezi|tup bebek|check-?up/.test(t)) return "CLINIC";
  return "OTHER";
}

/** Kamu kurumu gibi görünenleri ayıklar (kampanya yalnızca özel kurumlara gider). */
export function looksPublic(name: string): boolean {
  return /devlet hastanesi|egitim ve arastirma|sehir hastanesi|universite|aile sagligi|toplum sagligi|\basm\b|saglik bakanligi|belediye|kamu|il sagligi|ilce devlet|vakif universitesi/.test(fold(name));
}

const decode = (s: string) =>
  s
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/\s+/g, " ")
    .trim();

/** Sağlık Bakanlığı "Özel Hastane Listesi (Faal)" tablosu: İl, İlçe, Ad/Tanım, Kuruluş Tipi */
export function parseMohHtml(html: string): InstitutionDraft[] {
  const out: InstitutionDraft[] = [];
  for (const row of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row[1]!.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((m) => decode(m[1]!));
    if (cells.length < 4) continue;
    const [il, ilce, ad, tip] = cells as [string, string, string, string];
    if (!ad || /^(il|ad\/tanım|ad)$/i.test(ad) || /^il$/i.test(il)) continue;
    out.push({
      name: cleanInstitutionName(ad),
      rawName: ad,
      kind: kindFromText(`${tip} ${ad}`),
      city: trTitle(il),
      district: trTitle(ilce),
      orgType: tip,
      source: "moh",
    });
  }
  return out;
}

interface OsmElement {
  tags?: Record<string, string>;
}

/** Overpass JSON çıktısı: hastane, klinik ve (isteğe bağlı) diş klinikleri */
export function parseOverpass(json: { elements?: OsmElement[] }, city: string, opts: { dental: boolean }): InstitutionDraft[] {
  const out: InstitutionDraft[] = [];
  for (const el of json.elements ?? []) {
    const t = el.tags ?? {};
    const name = t.name?.trim();
    if (!name) continue;
    if (["public", "government"].includes(t["operator:type"] ?? "")) continue;
    if (looksPublic(name)) continue;
    const amenity = t.amenity ?? t.healthcare ?? "";
    let kind: InstitutionKind = amenity === "hospital" ? "HOSPITAL" : amenity === "dentist" ? "DENTAL" : "CLINIC";
    kind = kindFromText(name) === "OTHER" ? kind : kindFromText(name) === "INSURER" ? "OTHER" : kindFromText(name);
    if (kind === "OTHER") continue;
    if (kind === "DENTAL" && !opts.dental) continue;
    const beds = Number(t.beds);
    out.push({
      name: cleanInstitutionName(name),
      rawName: name,
      kind,
      city,
      district: t["addr:district"] ?? t["addr:suburb"],
      orgType: amenity,
      size: kind === "HOSPITAL" && beds > 0 ? (beds >= 200 ? "LARGE" : beds >= 50 ? "MEDIUM" : "SMALL") : undefined,
      website: t.website ?? t["contact:website"],
      source: "osm",
    });
  }
  return out;
}

/** Yapıştırılan liste: her satır "Ad; İlçe; Tür" (Excel'den sekmeli de olur). Yalnızca ad da yeterli. */
export function parsePaste(text: string, defaults: { city?: string; kind?: InstitutionKind } = {}): InstitutionDraft[] {
  const out: InstitutionDraft[] = [];
  for (const line of text.split(/\r?\n/)) {
    const [ad, ilce, tip] = line.split(/\t|;/).map((x) => x.trim());
    if (!ad || ad.length < 3) continue;
    out.push({
      name: cleanInstitutionName(ad),
      rawName: ad,
      kind: tip ? kindFromText(`${tip} ${ad}`) : defaults.kind ?? kindFromText(ad),
      city: defaults.city,
      district: ilce || undefined,
      orgType: tip || undefined,
      source: "paste",
    });
  }
  return out;
}
