/**
 * Sonuçlardan öğrenme: hangi tür kişiler daha çok kabul ediyor ve cevap veriyor?
 *
 * Her kişi birkaç özellikle temsil edilir (unvan grubu, segment, derece, kaynak).
 * Her özellik için kabul oranı, genel orana göre karşılaştırılır; az veriyle aşırı
 * sonuç çıkmasın diye Laplace düzeltmesi yapılır. Sonuç, kişi önceliğine eklenen
 * -15..+15 arası bir katkıdır ve panelde açıklamasıyla gösterilir.
 */

export interface Outcome {
  features: string[];
  /** Davet kabul edildi mi (mevcut bağlantılar için: mesaja cevap verdi mi) */
  success: boolean;
}

export interface FeatureStat {
  feature: string;
  n: number;
  rate: number;
  /** Genel orana göre puan farkı */
  liftPts: number;
}

export interface Model {
  baseRate: number;
  stats: Map<string, FeatureStat>;
  total: number;
}

const PRIOR = 4; // Düzeltme gücü: az örnekli özellik genel orana yakın kalır

export function learn(outcomes: Outcome[]): Model {
  const total = outcomes.length;
  const wins = outcomes.filter((o) => o.success).length;
  const baseRate = total ? wins / total : 0;
  const acc = new Map<string, { n: number; w: number }>();
  for (const o of outcomes) {
    for (const f of new Set(o.features)) {
      const a = acc.get(f) ?? { n: 0, w: 0 };
      a.n++;
      if (o.success) a.w++;
      acc.set(f, a);
    }
  }
  const stats = new Map<string, FeatureStat>();
  for (const [feature, { n, w }] of acc) {
    const rate = (w + PRIOR * baseRate) / (n + PRIOR);
    stats.set(feature, { feature, n, rate, liftPts: Math.round((rate - baseRate) * 1000) / 10 });
  }
  return { baseRate, stats, total };
}

/** Kişinin özelliklerine göre öğrenilmiş katkı; en az 30 sonuç birikmeden 0 döner. */
export function learnedBoost(model: Model, features: string[]): number {
  if (model.total < 30) return 0;
  let sum = 0;
  for (const f of features) {
    const s = model.stats.get(f);
    if (s && s.n >= 5) sum += s.liftPts;
  }
  return Math.max(-15, Math.min(15, Math.round(sum / 2)));
}

/** Panelde gösterilecek en güçlü bulgular. */
export function insights(model: Model, minN = 8): FeatureStat[] {
  return [...model.stats.values()]
    .filter((s) => s.n >= minN && Math.abs(s.liftPts) >= 5)
    .sort((a, b) => Math.abs(b.liftPts) - Math.abs(a.liftPts))
    .slice(0, 5);
}

/** Unvanın ilk iki sözcüğü, küçük harfle: "Genel Müdür Yardımcısı" -> "genel müdür". Temsilciler arası ortak anahtar. */
export function titleGroupOf(title: string | null | undefined): string | undefined {
  const low = (w: string) => (/^[A-Z0-9]+$/.test(w) ? w.toLowerCase() : w.toLocaleLowerCase("tr-TR"));
  const g = (title ?? "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(low)
    .join(" ");
  return g || undefined;
}

/**
 * Temsilciler arası ortak öğrenme: kendi sonuçları iki kat ağırlıkla, diğer temsilcilerin sonuçları
 * tek ağırlıkla sayılır. Yalnızca kişisel olmayan özellikler (unvan grubu, derece, kaynak) taşınır.
 */
export function pooledOutcomes(own: Outcome[], others: Outcome[]): Outcome[] {
  return [...own, ...own, ...others];
}

/** Kişiden öğrenme özellikleri çıkarır. */
export function featuresOf(p: { titleGroup?: string; segment?: string; degree?: number; source?: string }): string[] {
  return [
    p.titleGroup && `unvan:${p.titleGroup}`,
    p.segment && `segment:${p.segment}`,
    p.degree && `derece:${p.degree}`,
    p.source && `kaynak:${p.source}`,
  ].filter(Boolean) as string[];
}
