/**
 * Kişi bulma: hangi kaynaklardan, hangi sırayla, kimlerle başlanacağı.
 *
 * Yaklaşım "önce kurum, sonra kişi"dir: hedef kurumlar belirlenir, her kurumda doğru
 * unvandaki kişiler aranır. Bu, yalnızca unvanla aramaktan çok daha isabetlidir
 * (ör. "Hastane Müdürü" araması kamu hastanelerini de getirir; kurum listesi getirmez).
 *
 * Kaynaklar, en isabetliden en genişe:
 *  1. Mevcut bağlantılarım   — davet gerekmez, doğrudan mesaj gider
 *  2. Hedef kurum listesi    — kurum adına göre o kurumdaki doğru unvanlar
 *  3. LinkedIn kişi araması  — unvan + konum + sektör, önce 2. derece
 *  4. Gönderi etkileşimleri  — sektör gönderilerini beğenen/yorumlayan kişiler
 *  5. CSV / elle ekleme
 */
import { fold } from "./text";

export type Degree = 1 | 2 | 3;

export type SourceKind = "connections" | "accounts" | "search" | "engagers" | "import";

export interface Candidate {
  profileUrl: string;
  fullName: string;
  headline?: string;
  title?: string;
  company?: string;
  location?: string;
  industry?: string;
  degree?: Degree;
  mutualConnections?: number;
  /** Son 30 günde LinkedIn'de paylaşım/yorum yaptı mı */
  recentlyActive?: boolean;
  source: SourceKind;
}

/* ---------- Profil linkini tekilleştirme ---------- */

/**
 * LinkedIn profil linkini tek biçime indirger:
 * "https://tr.linkedin.com/in/Ali-Okyay-810202343/?originalSubdomain=tr" -> "https://www.linkedin.com/in/ali-okyay-810202343"
 */
export function canonicalProfileUrl(url: string): string | null {
  const m = url.trim().match(/linkedin\.com\/(in|sales\/lead|sales\/people)\/([^/?#,]+)/i);
  if (!m) return null;
  let slug = m[2]!;
  try {
    slug = decodeURIComponent(slug);
  } catch {
    /* olduğu gibi bırak */
  }
  return `https://www.linkedin.com/in/${slug.toLocaleLowerCase("tr-TR")}`;
}

/** Aynı kişiyi bir kez tutar; birden fazla kaynaktan geldiyse en bilgili kaydı ve en yakın dereceyi korur. */
export function dedupeCandidates(list: Candidate[]): Candidate[] {
  const byUrl = new Map<string, Candidate>();
  for (const c of list) {
    const key = canonicalProfileUrl(c.profileUrl);
    if (!key) continue;
    const prev = byUrl.get(key);
    if (!prev) {
      byUrl.set(key, { ...c, profileUrl: key });
      continue;
    }
    byUrl.set(key, {
      ...prev,
      ...Object.fromEntries(Object.entries(c).filter(([, v]) => v !== undefined && v !== "")),
      profileUrl: key,
      degree: Math.min(prev.degree ?? 3, c.degree ?? 3) as Degree,
      source: prev.source === "connections" ? prev.source : c.source,
    });
  }
  return [...byUrl.values()];
}

/* ---------- LinkedIn arama linki ---------- */

export interface PeopleSearch {
  /** Serbest anahtar kelime (Boole: "Hastane Müdürü" OR "Hasta Hizmetleri") */
  keywords?: string;
  /** Unvan alanında aranacak metin */
  title?: string;
  /** Şu anki şirket adı (hedef kurum listesi için) */
  company?: string;
  /** LinkedIn konum kimlikleri (çalışan, ilk kurulumda arama kutusundan çözer) */
  geoUrns?: string[];
  /** LinkedIn sektör kimlikleri */
  industryIds?: string[];
  /** Bağlantı derecesi filtresi */
  network?: Degree[];
  page?: number;
}

const NETWORK_CODE: Record<Degree, string> = { 1: "F", 2: "S", 3: "O" };

const listParam = (values: string[]) => JSON.stringify(values);

/** LinkedIn kişi araması linkini kurar (normal LinkedIn araması; Sales Navigator gerektirmez). */
export function buildPeopleSearchUrl(q: PeopleSearch): string {
  const p = new URLSearchParams();
  if (q.keywords) p.set("keywords", q.keywords);
  if (q.title) p.set("titleFreeText", q.title);
  if (q.company) p.set("company", q.company);
  if (q.geoUrns?.length) p.set("geoUrn", listParam(q.geoUrns));
  if (q.industryIds?.length) p.set("industry", listParam(q.industryIds));
  if (q.network?.length) p.set("network", listParam(q.network.map((d) => NETWORK_CODE[d])));
  if (q.page && q.page > 1) p.set("page", String(q.page));
  p.set("origin", "FACETED_SEARCH");
  return `https://www.linkedin.com/search/results/people/?${p.toString()}`;
}

/**
 * Hedef kurum listesini oluşturmak için LinkedIn şirket araması linki
 * (ör. "özel hastane" + İstanbul + sağlık sektörü). Sonuçlar kullanıcıya liste olarak
 * sunulur; kullanıcı işaretlediği kurumları hedef listeye ekler.
 */
export function buildCompanySearchUrl(q: { keywords: string; geoUrns?: string[]; industryIds?: string[]; page?: number }): string {
  const p = new URLSearchParams();
  p.set("keywords", q.keywords);
  if (q.geoUrns?.length) p.set("companyHqGeo", listParam(q.geoUrns));
  if (q.industryIds?.length) p.set("industryCompanyVertical", listParam(q.industryIds));
  if (q.page && q.page > 1) p.set("page", String(q.page));
  p.set("origin", "FACETED_SEARCH");
  return `https://www.linkedin.com/search/results/companies/?${p.toString()}`;
}

/** Unvanları LinkedIn'in Boole aramasına uygun gruplara böler: "A" OR "B" OR "C". */
export function titleQueries(titles: string[], perQuery = 4): string[] {
  const clean = [...new Set(titles.map((t) => t.trim()).filter(Boolean))];
  const out: string[] = [];
  for (let i = 0; i < clean.length; i += perQuery) {
    out.push(clean.slice(i, i + perQuery).map((t) => `"${t.replace(/"/g, "")}"`).join(" OR "));
  }
  return out;
}

export interface DiscoveryPlanInput {
  titles: string[];
  geoUrns: string[];
  industryIds: string[];
  /** Hedef kurum listesi; boşsa kurum bazlı arama yapılmaz */
  targetAccounts: string[];
  /** Mevcut bağlantılar taransın mı */
  includeConnections: boolean;
  /** Sektör gönderileri (etkileşim kaynağı) */
  engagementPostUrls: string[];
}

export interface DiscoveryStep {
  source: SourceKind;
  label: string;
  url?: string;
  /** Bu adımdan beklenen en fazla sayfa (profil görüntüleme bütçesini korur) */
  maxPages: number;
}

/**
 * Arama planı: önce bağlantılar, sonra hedef kurumlar, sonra 2. ve 3. derece geniş arama,
 * en son gönderi etkileşimleri. Çalışan bu sırayla, günlük görüntüleme bütçesi bitene kadar ilerler.
 */
export function planDiscovery(input: DiscoveryPlanInput): DiscoveryStep[] {
  const steps: DiscoveryStep[] = [];
  const tq = titleQueries(input.titles);

  if (input.includeConnections) {
    for (const keywords of tq) {
      steps.push({
        source: "connections",
        label: `Bağlantılarım · ${keywords}`,
        url: buildPeopleSearchUrl({ keywords, network: [1], geoUrns: input.geoUrns }),
        maxPages: 10,
      });
    }
  }
  // Kurum içi arama: LinkedIn'in metin alanında "unvanlar VE kurum adı" aranır. (Serbest metinli
  // `company=` parametresi LinkedIn'de süzgeç değildir ve sonucu sıfırlar; uzun VEYA listeleri de.)
  const topTitles = input.titles.map((t) => t.trim()).filter(Boolean).slice(0, 10);
  const titleGroup = topTitles.length ? `(${topTitles.map((t) => `"${t.replace(/"/g, "")}"`).join(" OR ")})` : "";
  for (const company of input.targetAccounts) {
    const name = company.replace(/"/g, "").trim();
    if (!name) continue;
    steps.push({
      source: "accounts",
      label: `Hedef kurum · ${name}`,
      url: buildPeopleSearchUrl({ keywords: titleGroup ? `${titleGroup} AND "${name}"` : `"${name}"`, geoUrns: input.geoUrns }),
      maxPages: 2,
    });
  }
  for (const degree of [2, 3] as Degree[]) {
    for (const keywords of tq) {
      steps.push({
        source: "search",
        label: `${degree}. derece · ${keywords}`,
        url: buildPeopleSearchUrl({ keywords, geoUrns: input.geoUrns, industryIds: input.industryIds, network: [degree] }),
        maxPages: degree === 2 ? 10 : 5,
      });
    }
  }
  for (const url of input.engagementPostUrls) {
    steps.push({ source: "engagers", label: "Gönderi etkileşimleri", url, maxPages: 3 });
  }
  return steps;
}

/* ---------- Önceliklendirme ---------- */

export interface PriorityInput {
  candidate: Candidate;
  /** scoring.ts'den gelen uygunluk puanı (0-100) */
  fitScore: number;
  /** learning.ts'den gelen öğrenilmiş katkı (-15..+15) */
  learnedBoost?: number;
}

/**
 * Sıralama puanı: uygunluk esas alınır; mevcut bağlantı, ortak bağlantı ve son aktiflik öne çeker.
 * Mevcut bağlantılar davet gerektirmediği ve doğrudan mesaj alabildiği için en öne gelir.
 */
export function priorityScore({ candidate: c, fitScore, learnedBoost = 0 }: PriorityInput): number {
  let s = fitScore;
  if (c.degree === 1) s += 25;
  else if (c.degree === 2) s += 8;
  if (c.mutualConnections) s += Math.min(10, c.mutualConnections * 2);
  if (c.recentlyActive) s += 6;
  if (c.source === "accounts") s += 5;
  s += Math.max(-15, Math.min(15, learnedBoost));
  return Math.round(s);
}

/**
 * Aynı kurumdan aynı anda çok kişiye yazılmasını engeller: her kurumdan en fazla `maxPerCompany`
 * kişi seçilir, kalanlar sonraki turlara kalır. Sıra korunur (liste önceden sıralanmış olmalı).
 */
export function throttleByCompany<T extends { company?: string }>(sorted: T[], maxPerCompany: number, activePerCompany: Map<string, number> = new Map()): { selected: T[]; deferred: T[] } {
  const used = new Map(activePerCompany);
  const selected: T[] = [];
  const deferred: T[] = [];
  for (const item of sorted) {
    const key = item.company ? fold(item.company) : "";
    if (!key) {
      selected.push(item);
      continue;
    }
    const n = used.get(key) ?? 0;
    if (n < maxPerCompany) {
      selected.push(item);
      used.set(key, n + 1);
    } else deferred.push(item);
  }
  return { selected, deferred };
}

/** Günlük profil görüntüleme bütçesi: aramada ve profil açmada LinkedIn'i yormamak için. */
export function profileViewBudget(premium: boolean): number {
  return premium ? 150 : 80;
}
