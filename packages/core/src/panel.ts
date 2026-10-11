/**
 * Panelin veri tarafındaki kurallar: uyarı bantları, ilk giriş kontrol listesi,
 * kişi zaman çizelgesi, geri alma süresi ve CSV dışa aktarma.
 */

/* ---------- Uyarılar ---------- */

export type AlertKind =
  | "RUNNER_OFFLINE"
  | "SESSION_EXPIRED"
  | "LINKEDIN_WARNING"
  | "LIMIT_REACHED"
  | "TEMPLATE_BLOCKED";

export interface AccountHealth {
  status: "CONNECTED" | "NEEDS_LOGIN" | "PAUSED" | "DISCONNECTED";
  runnerLastSeenAt?: Date;
  pausedUntil?: Date;
  /** Bugün gönderim saati içinde miyiz (çalışanın açık olması beklenir mi) */
  inSendingWindow: boolean;
  /** Haftalık davet bütçesinden kalan */
  invitesLeftThisWeek: number;
  /** Bekleyen davet işi var mı */
  pendingInvites: number;
}

export interface DerivedAlert {
  kind: AlertKind;
  severity: "error" | "warning";
  message: string;
  action: string;
}

/** Çalışan bu süre boyunca bağlanmazsa "kapalı" sayılır. */
export const RUNNER_OFFLINE_MINUTES = 20;

export function deriveAlerts(a: AccountHealth, now: Date): DerivedAlert[] {
  const out: DerivedAlert[] = [];
  if (a.status === "NEEDS_LOGIN" || a.status === "DISCONNECTED") {
    out.push({
      kind: "SESSION_EXPIRED",
      severity: "error",
      message: "LinkedIn oturumu kapandı; gönderimler bekliyor.",
      action: "Bilgisayarınızda çalışanı açıp LinkedIn'e yeniden giriş yapın.",
    });
  }
  if (a.status === "PAUSED" && a.pausedUntil && a.pausedUntil > now) {
    out.push({
      kind: "LINKEDIN_WARNING",
      severity: "error",
      message: `LinkedIn bir uyarı gösterdi; hesap ${formatTime(a.pausedUntil)} saatine kadar duraklatıldı.`,
      action: "LinkedIn'deki uyarıyı kendiniz kontrol edin. Süre dolunca gönderim düşük hızla devam eder.",
    });
  }
  const seenAgo = a.runnerLastSeenAt ? (now.getTime() - a.runnerLastSeenAt.getTime()) / 60_000 : Infinity;
  if (a.status === "CONNECTED" && a.inSendingWindow && seenAgo > RUNNER_OFFLINE_MINUTES) {
    out.push({
      kind: "RUNNER_OFFLINE",
      severity: "warning",
      message: a.runnerLastSeenAt
        ? `Çalışan ${Math.round(seenAgo)} dakikadır bağlanmadı.`
        : "Çalışan henüz hiç bağlanmadı.",
      action: "Bilgisayarınızın açık ve çalışanın başlatılmış olduğundan emin olun.",
    });
  }
  if (a.invitesLeftThisWeek <= 0 && a.pendingInvites > 0) {
    out.push({
      kind: "LIMIT_REACHED",
      severity: "warning",
      message: "Bu haftanın davet sınırı doldu; kalan davetler gelecek haftaya kaldı.",
      action: "Bekleyen mesajlar ve takipler gönderilmeye devam eder.",
    });
  }
  return out;
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });
}

/* ---------- İlk giriş kontrol listesi ---------- */

export const ONBOARDING_STEPS = [
  { key: "account", title: "LinkedIn hesabını bağla", hint: "Çalışanı bilgisayarınıza kurup LinkedIn'e bir kez giriş yapın." },
  { key: "schedule", title: "Gönderim saatlerini ayarla", hint: "Haftalık davet sayısı, günler ve saatler." },
  { key: "privacy", title: "KVKK aydınlatma metnini yayınla", hint: "Hazır metni düzenleyip web sitenize koyun." },
  { key: "campaign", title: "İlk kampanyayı oluştur", hint: "Kimlere, hangi amaçla yazacağınızı sorularla belirleyin." },
  { key: "templates", title: "Mesajları onayla", hint: "Yalnızca onaylı metinler gönderilir." },
  { key: "people", title: "Kişileri incele ve başlat", hint: "Bulunan kişileri gözden geçirip kampanyayı başlatın." },
] as const;

export type OnboardingKey = (typeof ONBOARDING_STEPS)[number]["key"];

export function onboardingProgress(done: readonly string[]) {
  const steps = ONBOARDING_STEPS.map((s) => ({ ...s, done: done.includes(s.key) }));
  const next = steps.find((s) => !s.done);
  return { steps, completed: steps.filter((s) => s.done).length, total: steps.length, next: next?.key, finished: !next };
}

/* ---------- Kişi zaman çizelgesi ---------- */

export type TimelineKind =
  | "found"
  | "visited"
  | "invite_sent"
  | "connected"
  | "message_sent"
  | "inmail_sent"
  | "reply"
  | "withdrawn"
  | "note"
  | "stage";

export interface TimelineEvent {
  at: Date;
  kind: TimelineKind;
  text: string;
  /** Mesaj ve notlarda tam metin */
  body?: string;
}

export interface ProspectHistory {
  createdAt: Date;
  visitedAt?: Date;
  inviteSentAt?: Date;
  connectedAt?: Date;
  withdrawnAt?: Date;
  inmailSentAt?: Date;
  messages: { at: Date; direction: "OUTBOUND" | "INBOUND"; body: string }[];
  notes: { at: Date; author: string; body: string }[];
  campaignName?: string;
}

/** Kişinin tüm geçmişi, en yeni üstte. */
export function buildTimeline(h: ProspectHistory): TimelineEvent[] {
  const ev: TimelineEvent[] = [
    { at: h.createdAt, kind: "found", text: h.campaignName ? `${h.campaignName} kampanyasına eklendi` : "Listeye eklendi" },
  ];
  if (h.visitedAt) ev.push({ at: h.visitedAt, kind: "visited", text: "Profili ziyaret edildi" });
  if (h.inviteSentAt) ev.push({ at: h.inviteSentAt, kind: "invite_sent", text: "Bağlantı daveti gönderildi" });
  if (h.connectedAt) ev.push({ at: h.connectedAt, kind: "connected", text: "Daveti kabul etti" });
  if (h.withdrawnAt) ev.push({ at: h.withdrawnAt, kind: "withdrawn", text: "Kabul edilmeyen davet geri çekildi" });
  if (h.inmailSentAt) ev.push({ at: h.inmailSentAt, kind: "inmail_sent", text: "InMail gönderildi" });
  for (const m of h.messages) {
    ev.push(
      m.direction === "OUTBOUND"
        ? { at: m.at, kind: "message_sent", text: "Mesaj gönderildi", body: m.body }
        : { at: m.at, kind: "reply", text: "Cevap geldi", body: m.body },
    );
  }
  for (const n of h.notes) ev.push({ at: n.at, kind: "note", text: `${n.author} not ekledi`, body: n.body });
  return ev.sort((a, b) => b.at.getTime() - a.at.getTime());
}

/* ---------- Geri alma ---------- */

/** Atla / hariç tut / toplu işlemler bu süre içinde geri alınabilir. */
export const UNDO_WINDOW_MS = 10 * 60_000;

export function canUndo(action: { createdAt: Date; undoneAt?: Date | null; undoData?: unknown }, now: Date): boolean {
  return !action.undoneAt && action.undoData != null && now.getTime() - action.createdAt.getTime() <= UNDO_WINDOW_MS;
}

/* ---------- CSV dışa aktarma ---------- */

/**
 * Excel'in Türkçe karakterleri doğru açması için UTF-8 BOM ve ";" ayırıcı kullanılır
 * (Türkçe Excel'de liste ayırıcı noktalı virgüldür).
 */
export function toCsv(columns: { key: string; title: string }[], rows: Record<string, unknown>[], sep = ";"): string {
  const cell = (v: unknown): string => {
    if (v == null) return "";
    let s = v instanceof Date ? v.toISOString().slice(0, 16).replace("T", " ") : String(v);
    // Formül enjeksiyonunu önle: = + - @ ile başlayan hücreler metin olarak kalır
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /["\n\r]/.test(s) || s.includes(sep) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.map((c) => cell(c.title)).join(sep), ...rows.map((r) => columns.map((c) => cell(r[c.key])).join(sep))];
  return "﻿" + lines.join("\r\n");
}

/* ---------- Temsilci sınırı ---------- */

/** Bir çalışma alanında aynı anda en fazla bu kadar temsilci (kampanya) aktif olabilir. */
export const MAX_ACTIVE_AGENTS = 5;

/** Yeni bir temsilciyi aktifleştirmek mümkün mü? */
export function canActivateAgent(activeCount: number, max = MAX_ACTIVE_AGENTS): boolean {
  return activeCount < max;
}

/* ---------- Günlük seri (grafik) ---------- */

/**
 * Tarihleri son `days` günün gün kovalarına dağıtır (yerel saate göre). Dizinin sonu bugündür.
 * Aralık dışındaki tarihler yok sayılır.
 */
export function bucketByDay(dates: (Date | null | undefined)[], days: number, now: Date, utcOffsetMin = 180): { labels: string[]; counts: number[] } {
  const DAY = 86_400_000;
  const off = utcOffsetMin * 60_000;
  const dayIndex = (t: number) => Math.floor((t + off) / DAY);
  const today = dayIndex(now.getTime());
  const counts = new Array<number>(days).fill(0);
  for (const d of dates) {
    if (!d) continue;
    const i = days - 1 - (today - dayIndex(d.getTime()));
    if (i >= 0 && i < days) counts[i]!++;
  }
  const labels = counts.map((_, i) => {
    const t = new Date((today - (days - 1 - i)) * DAY);
    return `${String(t.getUTCDate()).padStart(2, "0")}.${String(t.getUTCMonth() + 1).padStart(2, "0")}`;
  });
  return { labels, counts };
}
