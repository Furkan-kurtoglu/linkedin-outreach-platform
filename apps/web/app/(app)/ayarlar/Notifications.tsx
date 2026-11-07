import { EMAIL_EVENTS } from "@hfo/core";
import type { Workspace } from "@hfo/db";
import { SubmitButton } from "@/components/SubmitButton";
import { saveNotifications, testNotification } from "./actions";

const fmt = (d: Date) => d.toLocaleString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });

export function Notifications({ ws, configured, provider }: { ws: Workspace; configured: boolean; provider: string | null }) {
  return (
    <div className="card">
      <div className="card-h">
        <div>
          <h2>E-posta bildirimleri</h2>
          <span className="sub">Yeni cevap, sıcak fırsat ve çalışan hatası olduğunda seçtiğiniz adreslere e-posta gelir.</span>
        </div>
        <span className={`tag ${configured ? "t-good" : "t-mute"}`}>{configured ? `Hazır${provider ? ` · ${provider}` : ""}` : "Kapalı"}</span>
      </div>
      <div className="card-b stack">
        {!configured && (
          <p className="help" style={{ margin: 0 }}>
            Gönderim için sunucuda <code>EMAIL_FROM</code> ve ücretsiz bir sağlayıcı anahtarı tanımlı olmalı: <code>RESEND_API_KEY</code> (Resend) veya{" "}
            <code>BREVO_API_KEY</code> (Brevo). Anahtar yoksa ayarlar kaydedilir, e-posta gönderilmez.
          </p>
        )}
        <form action={saveNotifications} className="stack">
          <div className="field">
            <label htmlFor="notifyEmails">Alıcılar</label>
            <textarea id="notifyEmails" name="notifyEmails" defaultValue={ws.notifyEmails.join("\n")} placeholder="ornek@firma.com" style={{ minHeight: 90 }} />
            <span className="help">Her satıra bir adres, en fazla 5. Boş bırakılırsa ekip üyelerinin adreslerine gönderilir.</span>
          </div>
          <div className="field">
            <span className="lbl">Hangi olaylarda gönderilsin</span>
            {EMAIL_EVENTS.map(([k, l]) => (
              <label className="check" key={k}>
                <input type="checkbox" name={`ev-${k}`} defaultChecked={ws.notifyEvents.includes(k)} />
                <span>
                  <b>{l}</b>
                  <div className="sub">
                    Olay adı: <code>{k}</code>
                  </div>
                </span>
              </label>
            ))}
          </div>
          <div className="row">
            <SubmitButton>Kaydet</SubmitButton>
          </div>
        </form>
        <div className="row">
          <form action={testNotification}>
            <SubmitButton className="btn" pendingText="Gönderiliyor…">
              Deneme e-postası gönder
            </SubmitButton>
          </form>
        </div>
        <p style={{ margin: 0 }}>
          Son gönderim: {ws.notifyLastAt ? `${fmt(ws.notifyLastAt)} · ${ws.notifyLastStatus}` : "henüz yok"}
        </p>
      </div>
    </div>
  );
}
