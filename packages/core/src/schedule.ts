/**
 * Davet bütçesi ve gönderim planlama.
 *
 * - Haftalık davet hedefi (varsayılan 180) kullanıcı tarafından değiştirilebilir (en fazla 200).
 * - Her günün açık/kapalı durumu, saat aralıkları (birden fazla olabilir) ve isteğe bağlı
 *   sabit davet hedefi ayrı ayrı ayarlanır; hedefi boş günler haftalık hedeften kalanı paylaşır.
 * - Davetler o günün saat aralıklarına rastgele aralıklarla yayılır.
 * - Son 7 günde gönderilen davet sayısı bütçeyi asla aşamaz.
 * - Kabul edilen davetin detay mesajı en yüksek öncelikle, kısa bir gecikmeyle gider.
 */

/** Bir gün içindeki gönderim aralığı, dakika cinsinden gün başından (09:00 = 540). */
export interface TimeWindow {
  startMin: number;
  endMin: number;
}

/** Tek bir günün ayarı: açık mı, hangi saatlerde, kaç davet. */
export interface DaySchedule {
  enabled: boolean;
  /** Bir ya da birden fazla aralık (ör. 09:00-12:00 ve 14:00-18:00). */
  windows: TimeWindow[];
  /** Bu gün için sabit davet hedefi. Boşsa haftalık hedeften otomatik pay alır. */
  invites?: number;
}

export interface ScheduleConfig {
  /** Haftalık davet bütçesi (hesap başına). */
  weeklyInvites: number;
  /**
   * Gün gün ayar, dizin 0=Pazar ... 6=Cumartesi. Verilirse `activeDays` ve
   * `windowStartMin/EndMin` yerine bu kullanılır.
   */
  days?: DaySchedule[];
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

/** LinkedIn'e karşı güvenlik sınırları. */
export const SAFE_LIMITS = {
  /** LinkedIn'in haftalık davet sınırı yaklaşık 200; bunun üstü kabul edilmez. */
  weeklyMax: 200,
  /** Tek günde bunun üstü uyarı verir (insan davranışından uzaklaşır). */
  dailyWarn: 40,
  /** Tek günde bunun üstü kabul edilmez. */
  dailyMax: 60,
};

/** Gün gün ayarı çözer; eski tek pencereli ayarı da destekler. */
export function resolveDays(config: ScheduleConfig): DaySchedule[] {
  if (config.days && config.days.length === 7) return config.days;
  return Array.from({ length: 7 }, (_, d) => ({
    enabled: config.activeDays.includes(d),
    windows: [{ startMin: config.windowStartMin, endMin: config.windowEndMin }],
  }));
}

/**
 * Her günün davet hedefi. Sabit hedefi olan günler olduğu gibi alınır; haftalık hedeften
 * kalan, hedefi boş bırakılan açık günlere eşit dağıtılır.
 */
export function dailyPlan(config: ScheduleConfig, weekly = config.weeklyInvites): Map<number, number> {
  const days = resolveDays(config);
  const plan = new Map<number, number>();
  let fixedSum = 0;
  const auto: number[] = [];
  days.forEach((d, i) => {
    if (!d.enabled || d.windows.length === 0) {
      plan.set(i, 0);
      return;
    }
    if (d.invites !== undefined) {
      const v = Math.max(0, Math.min(SAFE_LIMITS.dailyMax, Math.round(d.invites)));
      plan.set(i, v);
      fixedSum += v;
    } else auto.push(i);
  });
  const rest = dailyQuotas(Math.max(0, weekly - fixedSum), auto);
  for (const d of auto) plan.set(d, rest.get(d) ?? 0);
  return plan;
}

export interface ScheduleIssue {
  level: "error" | "warning";
  day?: number;
  message: string;
}

const DAY_NAMES = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];

export function formatMin(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

export function parseTime(s: string): number | null {
  const m = s.trim().match(/^(\d{1,2})[:.](\d{2})$/);
  if (!m) return null;
  const h = +m[1]!, min = +m[2]!;
  return h < 24 && min < 60 ? h * 60 + min : null;
}

/** Ayarları denetler: hatalar kaydedilmez, uyarılar gösterilir ama kaydedilebilir. */
export function validateSchedule(config: ScheduleConfig): ScheduleIssue[] {
  const issues: ScheduleIssue[] = [];
  if (config.weeklyInvites > SAFE_LIMITS.weeklyMax) {
    issues.push({ level: "error", message: `Haftalık hedef ${SAFE_LIMITS.weeklyMax}'ü geçemez; LinkedIn hesabı kısıtlayabilir.` });
  }
  const days = resolveDays(config);
  const plan = dailyPlan(config);
  const avgGap = (config.minGapMin + config.maxGapMin) / 2;
  days.forEach((d, i) => {
    if (!d.enabled) return;
    const name = DAY_NAMES[i]!;
    if (d.windows.length === 0) issues.push({ level: "error", day: i, message: `${name}: açık ama saat aralığı yok.` });
    const sorted = [...d.windows].sort((a, b) => a.startMin - b.startMin);
    sorted.forEach((w, k) => {
      if (w.endMin <= w.startMin) issues.push({ level: "error", day: i, message: `${name}: bitiş saati başlangıçtan sonra olmalı (${formatMin(w.startMin)}–${formatMin(w.endMin)}).` });
      const prev = sorted[k - 1];
      if (prev && w.startMin < prev.endMin) issues.push({ level: "error", day: i, message: `${name}: saat aralıkları çakışıyor.` });
    });
    const q = plan.get(i) ?? 0;
    if (d.invites !== undefined && d.invites > SAFE_LIMITS.dailyMax) {
      issues.push({ level: "error", day: i, message: `${name}: günlük en fazla ${SAFE_LIMITS.dailyMax} davet olabilir.` });
    } else if (q > SAFE_LIMITS.dailyWarn) {
      issues.push({ level: "warning", day: i, message: `${name}: ${q} davet; günde ${SAFE_LIMITS.dailyWarn}'ın üstü hesabı riske atabilir.` });
    }
    const minutes = d.windows.reduce((s, w) => s + Math.max(0, w.endMin - w.startMin), 0);
    const fits = Math.floor(minutes / avgGap);
    if (q > fits) issues.push({ level: "warning", day: i, message: `${name}: ${q} davet bu saatlere sığmaz (en fazla yaklaşık ${fits}). Aralığı uzatın ya da hedefi düşürün.` });
  });
  const total = [...plan.values()].reduce((a, b) => a + b, 0);
  if (total > config.weeklyInvites) {
    issues.push({ level: "warning", message: `Günlük hedeflerin toplamı (${total}) haftalık hedefi (${config.weeklyInvites}) aşıyor; haftalık hedefte durulur.` });
  } else if (total < config.weeklyInvites) {
    issues.push({ level: "warning", message: `Günlük hedeflerin toplamı ${total}; haftalık hedef ${config.weeklyInvites}'a ulaşılmaz.` });
  }
  return issues;
}

/** Bugün daha kaç davet gönderilebilir? Hem günlük kota hem 7 günlük sınır uygulanır. */
export function invitesRemainingToday(params: {
  config: ScheduleConfig;
  weeklyBudget: number;
  localDay: number;
  sentToday: number;
  sentLast7Days: number;
}): number {
  const quota = dailyPlan(params.config, params.weeklyBudget).get(params.localDay) ?? 0;
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
  const today = resolveDays(config)[local.getUTCDay()]!;
  if (!today.enabled) return [];
  const windows = [...today.windows].sort((a, b) => a.startMin - b.startMin).filter((w) => w.endMin > minuteOfDay);

  const times: Date[] = [];
  let cursor = -1;
  let wi = 0;
  while (times.length < count && wi < windows.length) {
    const w = windows[wi]!;
    if (cursor < w.startMin) {
      // Aralığın başına (ya da şimdiye) küçük rastgele bir kayma ile gir
      cursor = Math.max(minuteOfDay, w.startMin) + rng() * config.minGapMin;
    } else {
      cursor += config.minGapMin + rng() * (config.maxGapMin - config.minGapMin);
    }
    if (cursor > w.endMin) {
      wi++;
      continue;
    }
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
