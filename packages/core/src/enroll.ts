/**
 * Kişiyi kampanyaya yazma kuralları.
 *
 * - Bir kişi aynı anda yalnızca bir kampanyada aktif olabilir; iki kampanyadan mesaj almaz.
 * - Birden fazla kampanyaya uyuyorsa en yüksek uygunluk puanlı kampanyaya girer.
 * - Kalıcı hariç tutulanlar (ilgilenmiyor, KVKK silme) hiçbir kampanyaya girmez.
 * - Geri çekilmiş davetin kişisi, LinkedIn'in bekleme süresi dolmadan tekrar davet edilmez.
 */
import type { Verdict } from "./scoring";

export interface CampaignMatch {
  campaignId: string;
  fitScore: number;
  verdict: Verdict;
}

export interface EnrollmentState {
  /** Kişinin şu an aktif olduğu kampanya (varsa) */
  activeCampaignId?: string;
  suppressed?: boolean;
  /** Son davetin geri çekildiği an */
  withdrawnAt?: Date;
  /** Kişiyle başka bir kampanyadaki sürecin bittiği an (cevapsız tamamlandı vb.) */
  lastEndedAt?: Date;
}

/** Bir kampanyada süreci biten kişi, başka kampanyaya bu kadar gün geçmeden alınmaz. */
export const RECONTACT_COOLDOWN_DAYS = 90;

export type EnrollDecision =
  | { ok: true; campaignId: string }
  | { ok: false; reason: string };

/** LinkedIn, geri çekilen kişiye yaklaşık 3 hafta yeniden davet göndermeye izin vermez. */
export const REINVITE_COOLDOWN_DAYS = 21;

export function canReinvite(withdrawnAt: Date | undefined, now: Date): boolean {
  if (!withdrawnAt) return true;
  return now.getTime() - withdrawnAt.getTime() >= REINVITE_COOLDOWN_DAYS * 86_400_000;
}

export function chooseCampaign(matches: CampaignMatch[], state: EnrollmentState, now: Date): EnrollDecision {
  if (state.suppressed) return { ok: false, reason: "Kişi kalıcı olarak hariç tutuldu." };
  if (state.activeCampaignId) return { ok: false, reason: "Kişi zaten başka bir kampanyada aktif." };
  if (!canReinvite(state.withdrawnAt, now)) return { ok: false, reason: "Geri çekilen davetin bekleme süresi dolmadı." };
  if (state.lastEndedAt && now.getTime() - state.lastEndedAt.getTime() < RECONTACT_COOLDOWN_DAYS * 86_400_000) {
    return { ok: false, reason: `Kişiyle son ${RECONTACT_COOLDOWN_DAYS} gün içinde başka bir kampanyada yazışıldı.` };
  }
  const best = matches
    .filter((m) => m.verdict === "uygun")
    .sort((a, b) => b.fitScore - a.fitScore)[0];
  if (!best) return { ok: false, reason: "Hiçbir kampanyaya uygun değil." };
  return { ok: true, campaignId: best.campaignId };
}
