/**
 * Temsilci (kampanya) bazında kurallar: gönderim penceresi, kararsız aday politikası,
 * iş arayanları eleme ve tercihli ölçüt puanı. Hepsi saf fonksiyondur (ağ ya da veritabanı yok).
 */
import { containsFolded } from "./text";
import { dailyPlan, formatMin, resolveDays, type DaySchedule, type ScheduleConfig } from "./schedule";

/* ---------- Gönderim penceresi ---------- */

export interface AgentWindow {
  /** 0=Pazar … 6=Cumartesi. Boş liste: kampanya hesabın takvimini olduğu gibi kullanır. */
  days: number[];
  startMin: number;
  endMin: number;
}

export function hasWindow(w: Partial<AgentWindow> | null | undefined): w is AgentWindow {
  return !!w && Array.isArray(w.days) && w.days.length > 0 && typeof w.startMin === "number" && typeof w.endMin === "number";
}

/** Hesap takvimini kampanyanın gün ve saatleriyle kesiştirir; hesabın kapalı saatleri yine kapalı kalır. */
export function restrictToWindow(config: ScheduleConfig, w: Partial<AgentWindow> | null | undefined): ScheduleConfig {
  if (!hasWindow(w)) return config;
  const days: DaySchedule[] = resolveDays(config).map((d, i) => {
    if (!d.enabled || !w.days.includes(i)) return { ...d, enabled: false, windows: [] };
    const windows = d.windows
      .map((x) => ({ startMin: Math.max(x.startMin, w.startMin), endMin: Math.min(x.endMin, w.endMin) }))
      .filter((x) => x.endMin > x.startMin);
    return { ...d, enabled: windows.length > 0, windows };
  });
  return { ...config, days };
}

export interface WindowIssue {
  level: "error" | "warning";
  message: string;
}

const DAY_SHORT = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];

/**
 * Pencerenin güvenli aralıklı gönderime yetip yetmediğini denetler.
 * `dailyInvites`: kampanyanın pencere günlerinde günlük yaklaşık davet sayısı.
 */
export function validateAgentWindow(w: AgentWindow, config: ScheduleConfig, dailyInvites: number): WindowIssue[] {
  const out: WindowIssue[] = [];
  if (!w.days.length) out.push({ level: "error", message: "En az bir gün seçin." });
  if (w.endMin <= w.startMin) {
    out.push({ level: "error", message: `Bitiş saati başlangıçtan sonra olmalı (${formatMin(w.startMin)}–${formatMin(w.endMin)}).` });
    return out;
  }
  const effective = restrictToWindow(config, w);
  const days = resolveDays(effective);
  const empty = w.days.filter((d) => !days[d]!.enabled);
  if (w.days.length && empty.length === w.days.length) {
    out.push({ level: "error", message: "Bu pencere hesabın gönderim saatleriyle hiç kesişmiyor; hesap takvimini ya da pencereyi değiştirin." });
    return out;
  }
  if (empty.length) out.push({ level: "warning", message: `${empty.map((d) => DAY_SHORT[d]).join(", ")} günleri hesap takviminde kapalı olduğu için kullanılmayacak.` });
  const avgGap = (config.minGapMin + config.maxGapMin) / 2;
  const best = Math.max(...w.days.map((d) => days[d]!.windows.reduce((s, x) => s + (x.endMin - x.startMin), 0)));
  const fits = Math.floor(best / avgGap);
  if (dailyInvites > fits) out.push({ level: "warning", message: `Günde yaklaşık ${dailyInvites} davet bu saatlere sığmaz (en fazla ~${fits}). Pencereyi uzatın ya da bütçe payını düşürün.` });
  if ((w.endMin - w.startMin) / 60 < 4) out.push({ level: "warning", message: "Dört saatten kısa pencerede gönderimler çok yoğun görünür; en az 6–8 saat önerilir." });
  return out;
}

/** Pencere günlerinde kampanyanın günlük yaklaşık davet sayısı (hesap planının payı). */
export function estimateDailyInvites(config: ScheduleConfig, w: AgentWindow | null | undefined, sharePct: number): number {
  const plan = dailyPlan(config);
  const days = hasWindow(w) ? w.days : [0, 1, 2, 3, 4, 5, 6];
  const vals = days.map((d) => plan.get(d) ?? 0).filter((v) => v > 0);
  if (!vals.length) return 0;
  return Math.ceil((Math.max(...vals) * sharePct) / 100);
}

/* ---------- Kararsız adaylar ---------- */

export type UncertainPolicy = "ASK" | "DROP" | "ACCEPT_STRONG";
export type UncertainOutcome = "review" | "drop" | "queue";

/** Puan eşiği: ACCEPT_STRONG seçiliyken bu puanın üstündeki belirsizler doğrudan sıraya girer. */
export const ACCEPT_STRONG_MIN = 65;

export function resolveUncertain(policy: UncertainPolicy, score: number): UncertainOutcome {
  if (policy === "DROP") return "drop";
  if (policy === "ACCEPT_STRONG") return score >= ACCEPT_STRONG_MIN ? "queue" : "drop";
  return "review";
}

/* ---------- İş arayanlar ---------- */

const OPEN_TO_WORK = [/open\s*to\s*work/i, /#opentowork/i, /iş\s*arıyorum/i, /is\s*ariyorum/i, /iş\s*arayan/i, /seeking\s+(new\s+)?(opportunit|role|position)/i, /looking\s+for\s+(a\s+)?(new\s+)?(job|role|opportunit)/i];

export function isOpenToWork(...texts: (string | undefined | null)[]): boolean {
  const t = texts.filter(Boolean).join(" ");
  return !!t && OPEN_TO_WORK.some((r) => r.test(t));
}

/* ---------- Tercihli ölçüt ---------- */

/** Tercihli ifadelerden her biri bulunursa puana +5 (en fazla +10) eklenir; kimseyi elemez. */
export function preferredBonus(keywords: string[], ...texts: (string | undefined | null)[]): { bonus: number; hits: string[] } {
  const text = texts.filter(Boolean).join(" ");
  if (!text) return { bonus: 0, hits: [] };
  const hits = keywords.filter((k) => k.trim() && containsFolded(text, k));
  return { bonus: Math.min(10, hits.length * 5), hits };
}

/* ---------- Webhook ---------- */

export const WEBHOOK_EVENTS = [
  ["accepted", "Bağlantı kabul edildi"],
  ["replied", "Biri cevap verdi"],
  ["interested", "İlgilenen cevap geldi"],
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number][0];

/**
 * Webhook adresi güvenli mi? Yalnızca https; kullanıcı adı/parola, yerel ve özel ağ adresleri yok.
 * (Panel sunucusunun iç ağa istek göndermesi engellenir.)
 */
export function checkWebhookUrl(raw: string): { ok: true; url: string } | { ok: false; reason: string } {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return { ok: false, reason: "Adres geçerli değil." };
  }
  if (u.protocol !== "https:") return { ok: false, reason: "Adres https:// ile başlamalı." };
  if (u.username || u.password) return { ok: false, reason: "Adreste kullanıcı adı ya da parola olamaz; imza için gizli anahtarı kullanın." };
  const h = u.hostname.toLowerCase();
  if (!h.includes(".") || h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".test"))
    return { ok: false, reason: "Yerel adresler kullanılamaz." };
  if (/^\[/.test(h)) return { ok: false, reason: "IPv6 adresi kullanılamaz; alan adı girin." };
  const ip = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ip) {
    const [a, b] = [+ip[1]!, +ip[2]!];
    const priv = a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
    if (priv) return { ok: false, reason: "Özel ağ adresleri kullanılamaz." };
  }
  return { ok: true, url: u.toString() };
}
