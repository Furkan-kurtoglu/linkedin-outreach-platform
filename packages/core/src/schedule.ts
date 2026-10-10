/**
 * Davet bütçesi ve gönderim planlama.
 *
 * - Haftalık davet bütçesi (varsayılan 180) seçili günlere eşit dağıtılır.
 * - Davetler mesai penceresine rastgele aralıklarla yayılır.
 * - Son 7 günde gönderilen davet sayısı bütçeyi asla aşamaz.
 * - Kabul edilen davetin detay mesajı en yüksek öncelikle, kısa bir gecikmeyle gider.
 */

export interface ScheduleConfig {
  /** Haftalık davet bütçesi (hesap başına). */
  weeklyInvites: number;
  /** Davet gönderilecek günler: 0=Pazar ... 6=Cumartesi. */
  activeDays: number[];
  /** Mesai penceresi, dakika cinsinden gün başından (09:00 = 540). */
  windowStartMin: number;
  windowEndMin: number;
  /** İki davet arası en az / en çok dakika. */
  minGapMin: number;
  maxGapMin: number;
  /** Yerel saat farkı (İstanbul = +180 dakika). */
  utcOffsetMin: number;
}

export const DEFAULT_SCHEDULE: ScheduleConfig = {
  weeklyInvites: 180,
  activeDays: [0, 1, 2, 3, 4, 5, 6],
  windowStartMin: 9 * 60,
  windowEndMin: 18 * 60 + 30,
  minGapMin: 4,
  maxGapMin: 20,
  utcOffsetMin: 180,
};

/** Isınma: yeni hesap 1. hafta %33, 2. hafta %67, sonra tam bütçe. */
export function warmupBudget(weeklyInvites: number, weeksSinceConnected: number): number {
  if (weeksSinceConnected < 1) return Math.round(weeklyInvites / 3);
  if (weeksSinceConnected < 2) return Math.round((weeklyInvites * 2) / 3);
  return weeklyInvites;
}

/**
 * Haftalık bütçeyi aktif günlere dağıtır; toplam bütçeye birebir eşittir.
 * 180 / 7 gün -> [26, 26, 26, 26, 26, 25, 25].
 */
export function dailyQuotas(weekly: number, activeDays: number[]): Map<number, number> {
  const days = [...new Set(activeDays)].sort((a, b) => a - b);
  const quotas = new Map<number, number>();
  if (days.length === 0) return quotas;
  const base = Math.floor(weekly / days.length);
  let extra = weekly - base * days.length;
  for (const day of days) {
    quotas.set(day, base + (extra > 0 ? 1 : 0));
    if (extra > 0) extra--;
  }
  return quotas;
}

/** Bugün daha kaç davet gönderilebilir? Hem günlük kota hem 7 günlük sınır uygulanır. */
export function invitesRemainingToday(params: {
  config: ScheduleConfig;
  weeklyBudget: number;
  localDay: number;
  sentToday: number;
  sentLast7Days: number;
}): number {
  const quota = dailyQuotas(params.weeklyBudget, params.config.activeDays).get(params.localDay) ?? 0;
  const byDay = quota - params.sentToday;
  const byWeek = params.weeklyBudget - params.sentLast7Days;
  return Math.max(0, Math.min(byDay, byWeek));
}

export type Rng = () => number;

/**
 * Bugünkü kalan davetler için gönderim zamanları üretir (UTC Date).
 * Zamanlar mesai penceresi içinde, aralarında rastgele boşluk olacak şekilde dağıtılır.
 * Pencereye sığmayanlar ertesi güne kalır.
 */
export function planInviteTimes(params: {
  now: Date;
  count: number;
  config: ScheduleConfig;
  rng?: Rng;
}): Date[] {
  const { now, count, config } = params;
  const rng = params.rng ?? Math.random;
  const offsetMs = config.utcOffsetMin * 60_000;
  const local = new Date(now.getTime() + offsetMs);
  const dayStartLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  const minuteOfDay = local.getUTCHours() * 60 + local.getUTCMinutes();

  let cursor = Math.max(minuteOfDay, config.windowStartMin);
  const times: Date[] = [];
  for (let i = 0; i < count; i++) {
    const gap = config.minGapMin + rng() * (config.maxGapMin - config.minGapMin);
    cursor += i === 0 && minuteOfDay < config.windowStartMin ? rng() * config.minGapMin : gap;
    if (cursor > config.windowEndMin) break;
    times.push(new Date(dayStartLocal + cursor * 60_000 - offsetMs));
  }
  return times;
}

/** Kabul algılandığında detay mesajının gönderim zamanı: 1-5 dakika sonra. */
export function acceptedMessageTime(detectedAt: Date, rng: Rng = Math.random): Date {
  const delayMin = 1 + rng() * 4;
  return new Date(detectedAt.getTime() + delayMin * 60_000);
}

/** Kuyruk öncelikleri: küçük sayı önce çalışır. */
export const PRIORITY = {
  acceptedMessage: 1,
  reply: 2,
  followUp: 5,
  invite: 10,
} as const;
