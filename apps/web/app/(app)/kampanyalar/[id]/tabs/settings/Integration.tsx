import { WEBHOOK_EVENTS } from "@hfo/core";
import { SubmitButton } from "@/components/SubmitButton";
import { rotateWebhookSecret, saveWebhook, testWebhook } from "../../actions";
import type { TabProps } from "../types";

const fmt = (d: Date) => d.toLocaleString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });

export function IntegrationSection({ campaign: c, sp }: TabProps) {
  return (
    <div className="stack" style={{ maxWidth: 720 }}>
      <form action={saveWebhook} className="card">
        <input type="hidden" name="id" value={c.id} />
        <div className="card-h"><div><h2>Webhook</h2><span className="sub">Seçtiğiniz olaylar olunca adresinize JSON gönderilir. Zapier, Make, n8n ya da kendi sisteminiz alabilir.</span></div>{sp.kaydedildi && <span className="form-ok">Kaydedildi</span>}</div>
        <div className="card-b stack">
          {sp.uyari === "adres" && <p className="form-error">{sp.ayrinti ?? "Adres geçersiz."}</p>}
          <div className="field">
            <label htmlFor="webhookUrl">Adres</label>
            <input type="text" id="webhookUrl" name="webhookUrl" defaultValue={c.webhookUrl ?? ""} placeholder="https://hooks.example.com/..." />
            <span className="help">Yalnızca https. Boş bırakıp kaydederseniz webhook kapanır.</span>
          </div>
          <div className="field">
            <span className="lbl">Olaylar</span>
            {WEBHOOK_EVENTS.map(([k, l]) => (
              <label className="check" key={k}>
                <input type="checkbox" name={`ev-${k}`} defaultChecked={c.webhookEvents.includes(k)} />
                <span><b>{l}</b><div className="sub">Olay adı: <code>{k}</code></div></span>
              </label>
            ))}
          </div>
          <div className="row"><SubmitButton>Kaydet</SubmitButton></div>
        </div>
      </form>
      {c.webhookUrl && (
        <div className="card">
          <div className="card-h"><h2>Doğrulama ve deneme</h2></div>
          <div className="card-b stack">
            <p className="help" style={{ margin: 0 }}>Her istekte <code>X-HFO-Signature: sha256=…</code> başlığı gelir: gövdenin gizli anahtarla HMAC-SHA256 özetidir. Alıcınız aynı hesabı yapıp karşılaştırarak isteğin bizden geldiğini doğrular.</p>
            <div className="field">
              <span className="lbl">Gizli anahtar</span>
              <code style={{ wordBreak: "break-all" }}>{c.webhookSecret}</code>
            </div>
            {sp.yenilendi && <p className="form-ok">Gizli anahtar yenilendi; alıcıdaki değeri güncelleyin.</p>}
            {sp.denendi && <p className="form-ok">Deneme gönderildi; sonuç aşağıda.</p>}
            <p style={{ margin: 0 }}>Son gönderim: {c.webhookLastAt ? `${fmt(c.webhookLastAt)} · ${c.webhookLastStatus}` : "henüz yok"}</p>
            <div className="row">
              <form action={testWebhook}><input type="hidden" name="id" value={c.id} /><SubmitButton className="btn" pendingText="Gönderiliyor…">Deneme gönder</SubmitButton></form>
              <form action={rotateWebhookSecret}><input type="hidden" name="id" value={c.id} /><SubmitButton className="btn quiet" pendingText="Yenileniyor…">Gizli anahtarı yenile</SubmitButton></form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
