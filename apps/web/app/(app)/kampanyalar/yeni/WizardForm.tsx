"use client";
import Link from "next/link";
import { useActionState } from "react";
import { createCampaign, type WizardState } from "./actions";

interface Q {
  name: string;
  label: string;
  help?: string;
  placeholder?: string;
  multiline?: boolean;
  required?: boolean;
}

function Field({ q, state }: { q: Q; state: WizardState }) {
  const err = state.errors?.[q.name];
  const val = state.values?.[q.name];
  const props = { id: q.name, name: q.name, defaultValue: val, placeholder: q.placeholder, "aria-invalid": !!err || undefined, "aria-describedby": `${q.name}-h` };
  return (
    <div className="field">
      <label htmlFor={q.name}>
        {q.label}
        {!q.required && <span className="sub" style={{ fontWeight: 400 }}> · isteğe bağlı</span>}
      </label>
      {q.multiline ? <textarea {...props} style={{ minHeight: 84 }} /> : <input type="text" {...props} />}
      <span className="help" id={`${q.name}-h`}>
        {err ? <span className="form-error">{err}</span> : q.help}
      </span>
    </div>
  );
}

const S1: Q[] = [
  { name: "companyName", label: "Şirket ya da ürün adı", placeholder: "HeAlthFintel", required: true },
  { name: "senderRole", label: "Mesajda kendinizi nasıl tanıtırsınız?", help: "\"…HeAlthFintel'in kurucusuyum\" cümlesinin sonu.", placeholder: "kurucusuyum", required: true },
  { name: "productPhrase", label: "Ürününüz ne yapıyor?", help: "Tek cümle, \"-an/-en\" ile bitsin. Davet notunda \"{bu cümle} HeAlthFintel'in kurucusuyum\" olarak geçer.", placeholder: "özel hastanelerde hasta kabul ve sigorta doğrulamayı hızlandıran", required: true },
  { name: "audience", label: "Kime ulaşmak istiyorsunuz?", help: "Kurum türünü çoğul yazın.", placeholder: "özel hastaneler", required: true },
  { name: "problem", label: "Onların yaşadığı sorun ne?", help: "Karşı tarafı suçlamadan, sektörün genel sorunu olarak.", placeholder: "poliçe doğrulama ve hasta kabulünde manuel işlemler", required: true },
  { name: "benefits", label: "Bu sorunu nasıl çözüyorsunuz?", help: "Her satıra bir somut fayda. Mesajda \"hedefliyoruz\" diliyle geçer.", multiline: true, required: true },
];
const S2: Q[] = [
  { name: "proofs", label: "Kanıtlarınız", help: "Ödül, başvuru, pilot. Her satıra bir tane.", multiline: true },
  { name: "tractionLine", label: "Güven cümlesi", help: "Davet notunda kullanılır; sığmazsa çıkarılır.", placeholder: "Kurumlarla pilot anlaşmalarına başladık" },
  { name: "figures", label: "Rakamlı iddialar", help: "Her satıra bir tane. Türünü aşağıdan seçin.", multiline: true },
  { name: "link", label: "Paylaşılacak link", help: "Detay mesajının sonunda yer alır.", placeholder: "https://www.healthfintel.com.tr/" },
];
const S3: Q[] = [
  { name: "bannedPhrases", label: "Mesajlarda asla geçmemesi gereken ifadeler", help: "Her satıra bir tane. Her mesajda denetlenir.", multiline: true },
  { name: "excludedCompanies", label: "Hiç yazılmayacak kurumlar", help: "Her satıra bir tane. Tüm kampanyalarda geçerli olur.", multiline: true },
];
const S4: Q[] = [
  { name: "titles", label: "Unvanlar", help: "Her satıra bir tane. Unvanın içinde geçmesi yeterli; Türkçe ve İngilizce yazın.", multiline: true, required: true },
  { name: "excludedTitles", label: "Hariç unvanlar", help: "Ör. Stajyer, Asistan", multiline: true },
  { name: "locations", label: "Konum", placeholder: "İstanbul" },
  { name: "industries", label: "Sektör", placeholder: "Hastaneler ve Sağlık Hizmetleri" },
  { name: "requiredCompanyKeywords", label: "Kurum adında ya da açıklamasında geçmeli", help: "Her satıra bir tane; en az biri geçmeli. Ör. özel, hastane, hospital", multiline: true },
  { name: "excludedCompanyKeywords", label: "Kurum adında geçerse elensin", help: "Kamu hastaneleri zaten otomatik ayıklanır.", multiline: true },
  { name: "fitRule", label: "Uygunluk kuralı (not)", help: "Belirsiz kişilerde karar verirken size hatırlatılır.", placeholder: "Yalnızca özel hastaneler; kamu hariç." },
];

function Radios({ name, options, state, def }: { name: string; options: [string, string, string?][]; state: WizardState; def: string }) {
  const cur = state.values?.[name] ?? def;
  return (
    <div className="radio">
      {options.map(([v, l, d]) => (
        <label key={v}>
          <input type="radio" name={name} value={v} defaultChecked={cur === v} />
          <span>
            <b>{l}</b>
            {d && <div className="sub">{d}</div>}
          </span>
        </label>
      ))}
    </div>
  );
}

export function WizardForm({ accounts }: { accounts: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<WizardState, FormData>(createCampaign, {});
  const n = Object.keys(state.errors ?? {}).length;
  return (
    <form action={action} className="stack" style={{ gap: 16, maxWidth: 860 }}>
      {n > 0 && (
        <div className="banner error" role="alert">
          <span className="dot no" style={{ marginTop: 6 }} />
          <div className="txt"><b>{n} alanı düzeltin</b><p>İşaretli alanlar aşağıda.</p></div>
        </div>
      )}
      <div className="card">
        <div className="card-h"><h2>Kampanya</h2></div>
        <div className="card-b stack">
          <Field q={{ name: "name", label: "Kampanya adı", placeholder: "Özel hastaneler", required: true }} state={state} />
          <div className="field">
            <label htmlFor="accountId">Gönderen LinkedIn hesabı</label>
            {accounts.length ? (
              <select id="accountId" name="accountId" defaultValue={state.values?.accountId}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            ) : (
              <p className="form-error">Önce <Link className="link" href="/hesaplar">LinkedIn hesapları</Link> sayfasından bir hesap ekleyin.</p>
            )}
            {state.errors?.accountId && <span className="form-error">{state.errors.accountId}</span>}
          </div>
          <div className="field">
            <label htmlFor="share">Haftalık davet bütçesindeki payı (%)</label>
            <input type="number" id="share" name="share" min={5} max={100} step={5} defaultValue={state.values?.share ?? "100"} style={{ maxWidth: 120 }} />
          </div>
        </div>
      </div>
      <div className="card">
        <div className="card-h"><div><h2>Ne anlatacağız</h2><span className="sub">Cevaplardan davet notu, kabulde mesaj, takipler ve mevcut bağlantılara mesaj taslakları hazırlanır.</span></div></div>
        <div className="card-b stack">{S1.map((q) => <Field key={q.name} q={q} state={state} />)}</div>
      </div>
      <div className="card">
        <div className="card-h"><h2>Kanıt ve link</h2></div>
        <div className="card-b stack">
          {S2.map((q) => <Field key={q.name} q={q} state={state} />)}
          <div className="field">
            <span className="lbl">Rakamlar ne tür?</span>
            <Radios name="proofKind" state={state} def="yok" options={[["yok", "Rakam yok"], ["sektor", "Sektör verisi", "Mesajda \"sektör çalışmalarına göre\" diye geçer."], ["kendi", "Kendi pilot sonucumuz", "Mesajda \"pilot sonuçlarımıza göre\" diye geçer."]]} />
            {state.errors?.proofKind && <span className="form-error">{state.errors.proofKind}</span>}
          </div>
        </div>
      </div>
      <div className="card">
        <div className="card-h"><h2>Hedef, ton ve sınırlar</h2></div>
        <div className="card-b stack">
          <div className="field">
            <span className="lbl">Karşı taraftan ne istiyorsunuz?</span>
            <Radios name="goal" state={state} def="gorusme" options={[["gorusme", "Online görüşme"], ["demo", "Demo"], ["pilot", "Pilot görüşmesi"]]} />
            <span className="help">Görüşme için süre yazılmaz.</span>
          </div>
          <div className="grid g2">
            <div className="field"><span className="lbl">Ton</span><Radios name="tone" state={state} def="resmi" options={[["resmi", "Resmî"], ["samimi", "Samimi"]]} /></div>
            <div className="field"><span className="lbl">Hitap</span><Radios name="salutation" state={state} def="ad_soyad" options={[["ad_soyad", "Ad soyad", "\"Merhaba Elif Demirtaş\""], ["bey_hanim", "Bey / Hanım", "Yalnızca cinsiyeti elle işaretlenen kişilerde"]]} /></div>
          </div>
          {S3.map((q) => <Field key={q.name} q={q} state={state} />)}
        </div>
      </div>
      <div className="card">
        <div className="card-h"><div><h2>Kimlere</h2><span className="sub">Kişi bulma bu bilgilerle arar; bulunan herkes bu kurallarla puanlanır.</span></div></div>
        <div className="card-b stack">{S4.map((q) => <Field key={q.name} q={q} state={state} />)}</div>
      </div>
      <div className="row">
        <button className="btn primary" disabled={pending || !accounts.length}>{pending ? "Taslaklar hazırlanıyor…" : "Kampanyayı oluştur"}</button>
        <span className="help">Kampanya taslak olarak oluşur; mesajları onaylayıp başlatana kadar hiçbir şey gönderilmez.</span>
      </div>
    </form>
  );
}
