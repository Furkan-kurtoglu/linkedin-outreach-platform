/**
 * Şablon sürümlerini gerçek sonuçlarla karşılaştırır (yapay zekâ gerekmez).
 * İki oran için z-testi kullanır; az veriyle karar vermez.
 */

export interface VariantStats {
  id: string;
  sent: number;
  /** Kabul (davet notu için) ya da cevap (mesajlar için) sayısı */
  success: number;
}

export interface Comparison {
  winner?: string;
  confident: boolean;
  /** Yüzde puan farkı (kazanan - diğer) */
  liftPts: number;
  message: string;
}

/** Karar vermeden önce her sürümde gereken en az gönderim. */
export const MIN_SAMPLE = 40;

function normalCdf(z: number): number {
  // Abramowitz-Stegun yaklaşımı
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

export function compareVariants(a: VariantStats, b: VariantStats, label = "kabul"): Comparison {
  const pa = a.sent ? a.success / a.sent : 0;
  const pb = b.sent ? b.success / b.sent : 0;
  const lift = Math.round((Math.max(pa, pb) - Math.min(pa, pb)) * 1000) / 10;
  const better = pa >= pb ? a : b;
  const worse = better === a ? b : a;

  if (a.sent < MIN_SAMPLE || b.sent < MIN_SAMPLE) {
    const need = Math.max(MIN_SAMPLE - a.sent, MIN_SAMPLE - b.sent, 0);
    return { confident: false, liftPts: lift, message: `Karar için veri az; her sürümün en az ${MIN_SAMPLE} gönderime ulaşması gerekiyor (yaklaşık ${need} daha).` };
  }
  const p = (a.success + b.success) / (a.sent + b.sent);
  const se = Math.sqrt(p * (1 - p) * (1 / a.sent + 1 / b.sent));
  const z = se === 0 ? 0 : (pa - pb) / se;
  const pValue = 2 * (1 - normalCdf(Math.abs(z)));
  if (pValue < 0.05) {
    return {
      winner: better.id,
      confident: true,
      liftPts: lift,
      message: `${better.id} sürümü ${worse.id} sürümünden ${lift} puan daha yüksek ${label} oranı alıyor; fark tesadüf değil gibi görünüyor. ${better.id} sürümünü kalıcı yapmanız önerilir.`,
    };
  }
  return {
    confident: false,
    liftPts: lift,
    message: `${better.id} sürümü önde (${lift} puan) ama fark henüz kesin değil; teste devam edin.`,
  };
}

/** Bir oranın son dönemde belirgin düşüp düşmediğine bakar (uyarı kartı için). */
export function rateDropped(previous: VariantStats, recent: VariantStats, thresholdPts = 5): boolean {
  if (previous.sent < MIN_SAMPLE || recent.sent < 20) return false;
  const prev = previous.success / previous.sent;
  const now = recent.success / recent.sent;
  return (prev - now) * 100 >= thresholdPts;
}
