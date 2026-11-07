import "server-only";
/**
 * E-posta bildirimleri: ücretsiz katmanı olan Resend veya Brevo'ya HTTP üzerinden gönderir.
 * SDK gerekmez; iki sağlayıcı da tek bir JSON isteğiyle çalışır.
 *
 * Anahtarlar tanımlı değilse hiçbir şey gönderilmez ve akış bozulmaz: sonuç çalışma
 * alanındaki `notifyLastStatus` alanına yazılır, panelde görünür.
 */
import { renderNotification, type EmailEvent, type NotificationPayload } from "@hfo/core";
import { prisma } from "@hfo/db";
import { env } from "./env";

type Provider = { name: "resend" | "brevo"; key: string; from: string };

function provider(): Provider | null {
  const from = env.emailFrom();
  if (!from) return null;
  const resend = env.resendKey();
  if (resend) return { name: "resend", key: resend, from };
  const brevo = env.brevoKey();
  if (brevo) return { name: "brevo", key: brevo, from };
  return null;
}

/** Panelde "Hazır / Kapalı" etiketi için: gönderim yapılandırılmış mı? */
export const emailConfigured = () => !!provider();

/** Aktif sağlayıcının adı (arayüzde bilgi olarak gösterilir). */
export const emailProvider = () => provider()?.name ?? null;

/** "Ad <adres@alan>" biçiminden yalnızca adresi çıkarır (Brevo düz adres ister). */
const bareEmail = (from: string) => from.match(/<([^>]+)>/)?.[1]?.trim() ?? from.trim();

async function deliver(p: Provider, to: string[], content: { subject: string; text: string; html: string }): Promise<string> {
  const signal = AbortSignal.timeout(8000);
  if (p.name === "resend") {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal,
      headers: { authorization: `Bearer ${p.key}`, "content-type": "application/json" },
      body: JSON.stringify({ from: p.from, to, subject: content.subject, text: content.text, html: content.html }),
    });
    if (res.ok) return `Teslim edildi (resend ${res.status})`;
    const detail = (await res.text().catch(() => "")).slice(0, 160);
    return `Gönderilemedi (resend ${res.status})${detail ? `: ${detail}` : ""}`;
  }
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    signal,
    headers: { "api-key": p.key, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: { email: bareEmail(p.from), name: env.emailFromName() },
      to: to.map((email) => ({ email })),
      subject: content.subject,
      htmlContent: content.html,
      textContent: content.text,
    }),
  });
  if (res.ok) return `Teslim edildi (brevo ${res.status})`;
  const detail = (await res.text().catch(() => "")).slice(0, 160);
  return `Gönderilemedi (brevo ${res.status})${detail ? `: ${detail}` : ""}`;
}

/**
 * Çalışma alanına e-posta bildirimi gönderir. Hata fırlatmaz; durumu metin olarak döner.
 *
 * - Alıcı listesi boşsa çalışma alanı üyelerinin adresleri kullanılır.
 * - `dedupeMinutes`: aynı olay kısa sürede çok kez olursa (ör. art arda çalışan hataları)
 *   tek e-posta gönderilir; denetim kaydı üzerinden kontrol edilir.
 * - `force`: olay seçili olmasa da gönderir (deneme düğmesi).
 */
export async function notifyWorkspace(
  workspaceId: string,
  event: EmailEvent | "test",
  payload: NotificationPayload = {},
  opts: { force?: boolean; dedupeMinutes?: number } = {},
): Promise<string> {
  try {
    const ws = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, name: true, notifyEmails: true, notifyEvents: true },
    });
    if (!ws) return "Çalışma alanı bulunamadı.";
    if (!opts.force && !ws.notifyEvents.includes(event)) return "Olay seçili değil.";

    const p = provider();
    if (!p) return "E-posta servisi yapılandırılmadı (RESEND_API_KEY veya BREVO_API_KEY ve EMAIL_FROM).";

    if (opts.dedupeMinutes && opts.dedupeMinutes > 0) {
      const since = new Date(Date.now() - opts.dedupeMinutes * 60_000);
      const recent = await prisma.auditLog.findFirst({
        where: { workspaceId, action: `notify.email.${event}`, createdAt: { gte: since } },
        select: { id: true },
      });
      if (recent) return "Yakın zamanda gönderildi; tekrar gönderilmedi.";
    }

    let to = ws.notifyEmails.map((e) => e.trim().toLowerCase()).filter(Boolean);
    if (!to.length) {
      const members = await prisma.membership.findMany({
        where: { workspaceId },
        select: { user: { select: { email: true } } },
      });
      to = members.map((m) => m.user.email.trim().toLowerCase()).filter(Boolean);
    }
    to = [...new Set(to)].slice(0, 20);
    if (!to.length) return "Alıcı tanımlı değil.";

    const content = renderNotification(event, {
      ...payload,
      workspace: payload.workspace ?? ws.name,
      settingsUrl: payload.settingsUrl ?? `${env.appUrl()}/ayarlar`,
    });
    const status = await deliver(p, to, content);

    await prisma.workspace
      .update({ where: { id: ws.id }, data: { notifyLastStatus: status, notifyLastAt: new Date() } })
      .catch(() => undefined);
    if (status.startsWith("Teslim edildi")) {
      await prisma.auditLog
        .create({ data: { workspaceId, actor: "system", action: `notify.email.${event}`, details: { to, subject: content.subject } } })
        .catch(() => undefined);
    }
    return status;
  } catch (e) {
    return `Bildirim gönderilemedi: ${e instanceof Error ? e.message.slice(0, 120) : "bilinmeyen hata"}`;
  }
}
