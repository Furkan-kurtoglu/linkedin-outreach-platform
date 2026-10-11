import { prisma } from "@hfo/db";
import { SubmitButton } from "@/components/SubmitButton";
import { saveOptions } from "../actions";
import type { TabProps } from "./types";

function Opt({ name, on, title, desc, children }: { name: string; on: boolean; title: string; desc: string; children?: React.ReactNode }) {
  return (
    <div className="opt">
      <div className="opt-h">
        <label className="switch">
          <input type="checkbox" name={name} defaultChecked={on} aria-label={title} />
          <span />
        </label>
        <div className="txt">
          <b>{title}</b> {on ? <span className="tag t-good">Açık</span> : <span className="tag t-mute">Kapalı</span>}
          <p>{desc}</p>
        </div>
      </div>
      {children && <div className="opt-b">{children}</div>}
    </div>
  );
}

const SOURCES = [
  ["mutual", "Ortak bağlantı", "\"ortak bağlantımız Ahmet Yılmaz üzerinden profilinize denk geldim.\""],
  ["post", "Konuyla ilgili son paylaşımı", "\"geçenlerde sağlık sigortası üzerine paylaşımınızı okudum.\" Yalnızca kampanyayla ilgili konularda; paylaşım metni saklanmaz."],
  ["school", "Ortak okul", "\"ikimiz de Boğaziçi Üniversitesi mezunuyuz.\" Kendi profilinizdeki okullarla karşılaştırılır."],
  ["city", "Aynı şehir", "\"ben de İstanbul'dayım.\""],
] as const;

export async function OptionsTab({ campaign: c, sp }: TabProps) {
  const openProfiles = await prisma.agentProspect.count({ where: { agentId: c.id, prospect: { openProfile: true }, stage: { in: ["QUEUED", "NEEDS_REVIEW"] } } });
  const enCount = await prisma.template.count({ where: { lang: "en", status: "APPROVED", step: { agentId: c.id } } });
  return (
    <form action={saveOptions} className="stack" style={{ maxWidth: 860 }}>
      <input type="hidden" name="id" value={c.id} />
      <p className="lede" style={{ marginBottom: 4 }}>Her seçenek yalnızca bu kampanyada geçerlidir ve başlangıçta kapalıdır. Kapalı seçenek hiçbir mesajı değiştirmez.</p>
      {sp.kaydedildi && <p className="form-ok">Seçenekler kaydedildi.</p>}
      <h3>Mesaj içeriği</h3>
      <Opt name="firstLineEnabled" on={c.firstLineEnabled} title="Kişiye özel ilk cümle" desc="Davet notu ve bağlantıya ilk mesaj, kişinin profilinden bulunan bir bilgiyle açılır. Bilgi bulunamayan kişide cümle hiç görünmez; davet notu sınırı aşılırsa önce bu cümle çıkarılır.">
        <div>
          <span className="lbl">Kaynaklar</span>
          <p className="help" style={{ margin: "2px 0 6px" }}>İşaretli kaynaklar sırayla denenir; ilk bulunan kullanılır.</p>
          {SOURCES.map(([k, l, h]) => (
            <label className="check" key={k}>
              <input type="checkbox" name={`src-${k}`} defaultChecked={c.firstLineSources.includes(k)} />
              <span><b>{l}</b><div className="sub">{h}</div></span>
            </label>
          ))}
        </div>
      </Opt>
      <Opt name="calendarEnabled" on={c.calendarEnabled} title="Takvim linki" desc="Kabulde giden mesajın ve ilk takibin sonuna randevu cümlesi eklenir; kişi uygun saati kendisi seçer. Google Takvim'in randevu sayfası ücretsizdir.">
        <div className="field">
          <label htmlFor="calendarUrl">Randevu sayfası adresi</label>
          <input type="text" id="calendarUrl" name="calendarUrl" defaultValue={c.calendarUrl ?? ""} placeholder="https://calendar.app.google/..." />
          <span className="help">Adres girilene kadar cümle eklenmez. Cümle: &quot;Uygun bir saati buradan seçebilirsiniz: …&quot;</span>
        </div>
      </Opt>
      <Opt name="englishEnabled" on={c.englishEnabled} title="İngilizce varyant" desc="Unvanı ve özeti İngilizce olan kişilere İngilizce metin gider. Metinler Mesajlar sekmesinde dil seçilerek yazılır; İngilizcesi onaylanmamış adımda kişiye Türkçe metin gider.">
        <p className="help" style={{ margin: 0 }}>{enCount ? `${enCount} adımın İngilizce metni onaylı.` : "Henüz onaylı İngilizce metin yok."}</p>
      </Opt>
      <h3 style={{ marginTop: 8 }}>Ek adımlar</h3>
      <Opt name="openProfileEnabled" on={c.openProfileEnabled} title="Açık profile davetsiz mesaj" desc="Profilini herkese mesaja açmış kişilere davet harcamadan doğrudan mesaj gider. Haftalık davet bütçesinden düşmez, günlük mesaj sınırından düşer.">
        <p className="help" style={{ margin: 0 }}>Açık profil, profil ziyaretinde anlaşılır. Şu an sırada açık profili bilinen {openProfiles} kişi var.</p>
      </Opt>
      <Opt name="inmailEnabled" on={c.inmailEnabled} title="Kabul edilmeyen davetten sonra InMail" desc={`Daveti ${c.withdrawAfterDays} gün içinde kabul etmeyen kişiye, davet geri çekildikten sonra bir InMail gönderilir. Premium InMail kredisi harcar; yalnızca puanı yüksek kişiler için.`}>
        <div className="row" style={{ gap: 16, alignItems: "flex-end" }}>
          <div className="field"><label htmlFor="imin">En düşük uygunluk puanı</label><input type="number" id="imin" name="inmailMinFitScore" min={50} max={100} defaultValue={c.inmailMinFitScore} style={{ width: 110 }} /></div>
          <div className="field"><label htmlFor="iwk">Haftada en fazla</label><input type="number" id="iwk" name="inmailWeeklyMax" min={1} max={30} defaultValue={c.inmailWeeklyMax} style={{ width: 110 }} /></div>
          <div><div className="sub">Kalan kredi</div><div style={{ font: "500 18px var(--mono)" }}>{c.linkedinAccount.inmailCredits ?? "—"}</div></div>
        </div>
        <p className="help" style={{ margin: 0 }}>Kredi bitince adım atlanır. Metni Mesajlar sekmesindeki &quot;InMail&quot; adımından düzenleyin.{!c.linkedinAccount.premium && " Hesap Premium görünmüyor; InMail gönderilemeyebilir."}</p>
      </Opt>
      <div className="row"><SubmitButton>Seçenekleri kaydet</SubmitButton></div>
    </form>
  );
}
