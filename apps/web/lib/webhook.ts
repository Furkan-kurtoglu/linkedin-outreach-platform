import "server-only";
import { createHmac } from "node:crypto";
import { checkWebhookUrl, type WebhookEvent } from "@hfo/core";
import { prisma, type Agent } from "@hfo/db";

export interface WebhookBody {
  event: WebhookEvent | "test";
  sentAt: string;
  campaign: { id: string; name: string };
  person?: { name: string; title?: string | null; company?: string | null; linkedinUrl: string };
  message?: string;
}

/** İmza: HMAC-SHA256(gizli anahtar, gövde). Alıcı aynı hesabı yapıp "X-HFO-Signature" ile karşılaştırır. */
export const sign = (secret: string, body: string) => `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

/**
 * Kampanyanın webhook adresine olayı gönderir. Hata olursa akışı bozmaz; son durum kampanyada saklanır.
 * `force`: test gönderimi (olay seçili olmasa da gider).
 */
export async function fireWebhook(agent: Pick<Agent, "id" | "name" | "webhookUrl" | "webhookSecret" | "webhookEvents">, body: Omit<WebhookBody, "sentAt" | "campaign">, force = false): Promise<string> {
  if (!agent.webhookUrl) return "Adres tanımlı değil.";
  if (!force && !agent.webhookEvents.includes(body.event)) return "Olay seçili değil.";
  const chk = checkWebhookUrl(agent.webhookUrl);
  let status: string;
  if (!chk.ok) status = `Gönderilmedi: ${chk.reason}`;
  else {
    const payload = JSON.stringify({ ...body, sentAt: new Date().toISOString(), campaign: { id: agent.id, name: agent.name } } satisfies WebhookBody);
    try {
      const res = await fetch(chk.url, {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(6000),
        headers: { "content-type": "application/json", "user-agent": "HeAlthFintel-Outreach/1", "x-hfo-event": body.event, ...(agent.webhookSecret ? { "x-hfo-signature": sign(agent.webhookSecret, payload) } : {}) },
        body: payload,
      });
      status = res.ok ? `Teslim edildi (${res.status})` : `Alıcı hata döndü (${res.status})`;
    } catch (e) {
      status = `Ulaşılamadı: ${e instanceof Error ? e.message.slice(0, 80) : "bilinmeyen hata"}`;
    }
  }
  await prisma.agent.update({ where: { id: agent.id }, data: { webhookLastStatus: status, webhookLastAt: new Date() } }).catch(() => undefined);
  return status;
}
