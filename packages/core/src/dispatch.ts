/**
 * Gönderim düzeni: akış motorunun "şimdi şunu yap" dediği işi ne zaman ve hangi
 * bütçeyle yapacağımıza karar verir.
 *
 *  - Her gönderim (davet, kabulde mesaj, takip, InMail) hesabın açık saat aralıklarına ve
 *    tatil olmayan günlere bağlanır. Gece kabul edilen bir davetin mesajı ertesi sabah gider.
 *  - Günlük mesaj sınırı uygulanır.
 *  - Davet bütçesi kampanyalara bütçe payına göre bölünür; ihtiyacı olmayanın payı diğerlerine geçer.
 *  - LinkedIn'den elle gönderilen davetler de haftalık sınırdan düşülür.
 */
import { isQuietDay } from "./sequence";
import { resolveDays, type Rng, type ScheduleConfig } from "./schedule";
import { canonicalProfileUrl } from "./discovery";

const MIN = 60_000;
const DAY = 24 * 60 * MIN;

/** Verilen andan itibaren ilk açık gönderim anı (UTC). 14 gün içinde yoksa null. */
export function nextOpenSlot(at: Date, config: ScheduleConfig, quietDays: string[] = []): Date | null {
  const days = resolveDays(config);
  const off = config.utcOffsetMin * MIN;
  for (let i = 0; i < 14; i++) {
    const local = new Date(at.getTime() + off + i * DAY);
    const dayStart = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
    const d = days[local.getUTCDay()]!;
    if (!d.enabled || isQuietDay(new Date(dayStart), quietDays)) continue;
    const nowMin = i === 0 ? local.getUTCHours() * 60 + local.getUTCMinutes() : 0;
    const windows = [...d.windows].sort((a, b) => a.startMin - b.startMin);
    for (const w of windows) {
      if (w.endMin <= nowMin) continue;
      const startMin = Math.max(w.startMin, nowMin);
      const ts = i === 0 && nowMin >= w.startMin ? at.getTime() : dayStart + startMin * MIN - off;
      return new Date(ts);
    }
  }
  return null;
}

export type DispatchKind = "invite" | "accepted_message" | "connected_message" | "follow_up" | "inmail" | "reply";

/**
 * İşin gönderileceği an. Açık saatteyse hemen (kabulde mesaj için 1-5 dk sonra);
 * değilse bir sonraki açık aralığın başından birkaç dakika sonra.
 */
export function dispatchTime(kind: DispatchKind, due: Date, config: ScheduleConfig, quietDays: string[] = [], rng: Rng = Math.random): Date | null {
  const delay = kind === "accepted_message" ? (1 + rng() * 4) * MIN : 0;
  const wanted = new Date(due.getTime() + delay);
  const slot = nextOpenSlot(wanted, config, quietDays);
  if (!slot) return null;
  if (slot.getTime() === wanted.getTime()) return slot;
  // Aralık açılır açılmaz tüm bekleyenler aynı dakikada gitmesin
  return new Date(slot.getTime() + (2 + rng() * 13) * MIN);
}

/* ---------- Günlük mesaj sınırı ---------- */

export function messagesRemainingToday(limit: number, sentToday: number): number {
  return Math.max(0, limit - sentToday);
}

/** Bugün gönderilecek mesajları önceliğe göre seçer; sınırı aşanlar yarına kalır. */
export function pickMessagesForToday<T extends { priority: number; dueAt: Date }>(items: T[], remaining: number): { today: T[]; later: T[] } {
  const sorted = [...items].sort((a, b) => a.priority - b.priority || a.dueAt.getTime() - b.dueAt.getTime());
  return { today: sorted.slice(0, remaining), later: sorted.slice(remaining) };
}

/* ---------- Kampanya bütçe payı ---------- */

export interface CampaignDemand {
  id: string;
  /** Hesabın davet bütçesindeki payı (yüzde) */
  sharePct: number;
  /** Bugün davet bekleyen uygun kişi sayısı */
  demand: number;
}

/**
 * Günlük davet hakkını kampanyalara payları oranında böler (en büyük kalan yöntemi).
 * Bir kampanyanın bekleyen kişisi payından azsa artan hak diğerlerine payları oranında geçer.
 */
export function allocateInvites(total: number, campaigns: CampaignDemand[]): Map<string, number> {
  const out = new Map(campaigns.map((c) => [c.id, 0]));
  let left = total;
  let open = campaigns.filter((c) => c.demand > 0 && c.sharePct > 0);
  while (left > 0 && open.length) {
    const shareSum = open.reduce((s, c) => s + c.sharePct, 0);
    const raw = open.map((c) => ({ c, v: (left * c.sharePct) / shareSum }));
    const given = raw.map((r) => ({ ...r, n: Math.floor(r.v) }));
    let rem = left - given.reduce((s, g) => s + g.n, 0);
    given.sort((a, b) => b.v - b.n - (a.v - a.n));
    for (const g of given) {
      if (rem <= 0) break;
      g.n++;
      rem--;
    }
    let used = 0;
    for (const g of given) {
      const room = g.c.demand - (out.get(g.c.id) ?? 0);
      const take = Math.min(room, g.n);
      out.set(g.c.id, (out.get(g.c.id) ?? 0) + take);
      used += take;
    }
    left -= used;
    open = open.filter((c) => (out.get(c.id) ?? 0) < c.demand);
    if (used === 0) break;
  }
  return out;
}

/* ---------- Elle gönderilen davetler ---------- */

/**
 * LinkedIn'in "Gönderilen davetler" listesindeki, sistemin göndermediği son 7 günlük
 * davetleri sayar. Haftalık sınır hesabına eklenir.
 */
export function countExternalInvites(observed: { profileUrl: string; sentAt: Date }[], systemUrls: Iterable<string>, now: Date): number {
  const known = new Set([...systemUrls].map((u) => canonicalProfileUrl(u) ?? u));
  return observed.filter((o) => {
    const key = canonicalProfileUrl(o.profileUrl) ?? o.profileUrl;
    return !known.has(key) && now.getTime() - o.sentAt.getTime() < 7 * DAY;
  }).length;
}
