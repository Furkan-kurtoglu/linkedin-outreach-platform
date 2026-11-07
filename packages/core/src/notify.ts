/**
 * E-posta bildirimleri: olay listesi, alıcı ayrıştırma ve ileti metni.
 *
 * Gönderim yapan katman (apps/web/lib/email.ts) bu saf fonksiyonları kullanır; böylece
 * metinler ve doğrulama veritabanına dokunmadan test edilebilir.
 */

/** Panelde seçilebilen e-posta olayları. Metinler arayüzde gösterilir. */
export const EMAIL_EVENTS = [
  ["replied", "Yeni cevap"],
  ["interested", "Sıcak fırsat (ilgilenen cevap)"],
  ["accepted", "Bağlantı kabul edildi"],
  ["error", "Çalışan hatası"],
] as const;

export type EmailEvent = (typeof EMAIL_EVENTS)[number][0];

/** Bir çalışma alanında en fazla bu kadar alıcı tutulur (sağlayıcı kotasını korur). */
export const MAX_NOTIFY_EMAILS = 5;

const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]{2,}$/;

/**
 * Serbest metinden (virgül, noktalı virgül veya satır sonuyla ayrılmış) e-posta listesi çıkarır.
 * Adresler küçük harfe çevrilir, tekrarlar atılır; geçersizler ayrı döner.
 */
export function parseEmailList(raw: string): { emails: string[]; invalid: string[] } {
  const emails: string[] = [];
  const invalid: string[] = [];
  for (const part of raw.split(/[\s,;]+/)) {
    const v = part.trim().toLowerCase();
    if (!v) continue;
    if (!EMAIL_RE.test(v)) {
      if (!invalid.includes(part.trim())) invalid.push(part.trim());
      continue;
    }
    if (!emails.includes(v)) emails.push(v);
  }
  return { emails, invalid };
}

export interface NotificationPayload {
  /** Çalışma alanı adı; konu satırının başına eklenir. */
  workspace?: string | null;
  /** Kampanya (temsilci) adı. */
  campaign?: string | null;
  personName?: string | null;
  personTitle?: string | null;
  personCompany?: string | null;
  linkedinUrl?: string | null;
  message?: string | null;
  error?: string | null;
  account?: string | null;
  settingsUrl?: string | null;
}

export interface NotificationContent {
  subject: string;
  text: string;
  html: string;
}

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** HTML gövdesine gömülecek kullanıcı metnini kaçışlar. */
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ESC[c] ?? c);

const clean = (v: string | null | undefined) => v?.replace(/\s+/g, " ").trim() || "";

/**
 * Olay için konu, düz metin ve HTML gövde üretir. `test` olayı deneme gönderimi içindir.
 * Kişi adı, kampanya ve mesaj LinkedIn'den gelen veridir; HTML'de kaçışlanır.
 */
export function renderNotification(event: EmailEvent | "test", p: NotificationPayload = {}): NotificationContent {
  const who = clean(p.personName) || "Bilinmeyen kişi";
  const campaign = clean(p.campaign);
  const account = clean(p.account);
  const workspace = clean(p.workspace);

  const subjectBase =
    event === "replied"
      ? `Yeni cevap: ${who}`
      : event === "interested"
        ? `Sıcak fırsat: ${who}`
        : event === "accepted"
          ? `Bağlantı kabul edildi: ${who}`
          : event === "error"
            ? `Çalışan hatası: ${account || campaign || "panel"}`
            : "Deneme bildirimi: e-posta bildirimleri çalışıyor";

  const lead =
    event === "replied"
      ? `${who} cevap verdi.`
      : event === "interested"
        ? `${who} ilgilendiğini yazdı; sıcak fırsatlar panosuna eklendi.`
        : event === "accepted"
          ? `${who} bağlantı isteğini kabul etti.`
          : event === "error"
            ? `Çalışan bir hata bildirdi${account ? ` (${account})` : ""}.`
            : "Bu bir deneme bildirimidir; e-posta bildirimleri çalışıyor.";

  const lines: string[] = [lead];
  if (campaign) lines.push(`Kampanya: ${campaign}`);
  if (event === "error") {
    const err = clean(p.error);
    if (err) lines.push(`Hata: ${err}`);
    if (account) lines.push(`Hesap: ${account}`);
  } else {
    const title = clean(p.personTitle);
    const company = clean(p.personCompany);
    if (title) lines.push(`Unvan: ${title}`);
    if (company) lines.push(`Kurum: ${company}`);
    const msg = clean(p.message);
    if (msg) lines.push(`Mesaj: ${msg}`);
    const url = clean(p.linkedinUrl);
    if (url) lines.push(`Profil: ${url}`);
  }
  const settings = clean(p.settingsUrl);
  if (settings) lines.push(`Bildirim ayarları: ${settings}`);
  lines.push("Bu e-postayı paneldeki Ayarlar > E-posta bildirimleri bölümünden kapatabilirsiniz.");

  const text = lines.join("\n");
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.55;color:#1f2a24">${lines
    .map((l) => `<p style="margin:0 0 10px">${escapeHtml(l)}</p>`)
    .join("")}</div>`;

  return {
    subject: [workspace ? `[${workspace}]` : "", subjectBase].filter(Boolean).join(" "),
    text,
    html,
  };
}
