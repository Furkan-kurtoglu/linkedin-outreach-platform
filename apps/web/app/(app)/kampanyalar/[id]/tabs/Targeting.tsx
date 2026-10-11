import { KIND_SEARCH } from "@hfo/core";
import { SubmitButton } from "@/components/SubmitButton";
import { readTargeting, segmentKeywords } from "@/lib/convert";
import { addSegment, addTargetAccounts, removeSegment, removeTargetAccount, saveTargeting } from "../actions";
import type { TabProps } from "./types";

const TA = ({ name, label, value, help, rows = 4 }: { name: string; label: string; value: string[]; help?: string; rows?: number }) => (
  <div className="field">
    <label htmlFor={name}>{label}</label>
    <textarea id={name} name={name} defaultValue={value.join("\n")} style={{ minHeight: rows * 22 }} />
    {help && <span className="help">{help}</span>}
  </div>
);

export function TargetingTab({ campaign: c, sp }: TabProps) {
  const t = readTargeting(c.targeting);
  return (
    <div className="grid g2">
      <form action={saveTargeting} className="card">
        <input type="hidden" name="id" value={c.id} />
        <div className="card-h"><h2>Kimler</h2>{sp.kaydedildi && <span className="form-ok">Kaydedildi</span>}{sp.uyari === "unvan" && <span className="form-error">En az bir unvan gerekli.</span>}</div>
        <div className="card-b stack">
          <TA name="titles" label="Unvanlar" value={t.titles} help="Her satıra bir tane. Unvanın içinde geçmesi yeterli: &quot;Genel Müdür&quot;, &quot;Genel Müdür Yardımcısı&quot;nı da bulur. Türkçe ve İngilizce yazın." rows={6} />
          <TA name="excludedTitles" label="Hariç unvanlar" value={t.excludedTitles} />
          <TA name="locations" label="Konum" value={t.locations} rows={2} help="Bulunan kişiler bu konumlara göre puanlanır." />
          <TA name="industries" label="Sektör" value={t.industries} rows={2} />
          <div className="field">
            <span className="lbl">Hedef kurum türleri</span>
            <div className="row" style={{ gap: 14, flexWrap: "wrap" }}>
              {Object.entries(KIND_SEARCH).map(([k, v]) => (
                <label key={k} className="row" style={{ gap: 6 }}><input type="checkbox" name="institutionKinds" value={k} defaultChecked={t.institutionKinds.includes(k as never)} /> {v!.label}</label>
              ))}
              <label className="row" style={{ gap: 6 }}><input type="checkbox" name="institutionKinds" value="OTHER" defaultChecked={t.institutionKinds.includes("OTHER")} /> Diğer</label>
            </div>
            <span className="help">Kurum Ar-Ge'den kampanyaya yalnızca bu türdeki kurumlar eklenir; başka türler atlanır ve sayısı gösterilir. Hiçbiri seçilmezse tür sınırı olmaz, bu durumda tek türden oluşmayan karışık listeler eklenemez.</span>
          </div>
          <TA name="requiredCompanyKeywords" label="Kurum adında ya da açıklamasında geçmeli" value={t.requiredCompanyKeywords} help="En az biri geçmeli; boşsa aranmaz." />
          <TA name="excludedCompanyKeywords" label="Kurum adında geçerse elensin" value={t.excludedCompanyKeywords} help="Kamu hastaneleri ve aracı kurumlar zaten otomatik ayıklanır." />
          <div className="field">
            <label htmlFor="fitRule">Uygunluk kuralı (not)</label>
            <textarea id="fitRule" name="fitRule" defaultValue={c.fitRule ?? ""} style={{ minHeight: 60 }} />
            <span className="help">Belirsiz kişilerde karar verirken size gösterilir.</span>
          </div>
          <details className="more">
            <summary>Gelişmiş arama ayarları</summary>
            <div className="stack" style={{ marginTop: 10 }}>
              <TA name="geoUrns" label="LinkedIn konum kimlikleri" value={t.geoUrns} rows={2} help="İsteğe bağlı. LinkedIn aramasında konum seçince adres çubuğundaki geoUrn sayısı (ör. 102105699). Boşsa konum, puanlamada kullanılır." />
              <TA name="engagementPostUrls" label="Etkileşimleri taranacak gönderiler" value={t.engagementPostUrls} rows={2} help="Sektör gönderilerinin linkleri; beğenen ve yorum yapanlar aday olur." />
            </div>
          </details>
        </div>
        <div className="card-h" style={{ borderTop: "1px solid var(--line)" }}><div><h2>Nitelik kuralları</h2><span className="sub">Kimin &quot;uygun&quot; sayılacağını belirler.</span></div></div>
        <div className="card-b stack">
          <TA name="preferredKeywords" label="Tercih edilen ölçütler" value={c.preferredKeywords} rows={3} help="İsteğe bağlı, her satıra bir ifade (kurum adı, açıklama ya da unvanda aranır). Bulunursa puan artar, bulunmaması kimseyi elemez." />
          <label className="check">
            <input type="checkbox" name="skipOpenToWork" defaultChecked={c.skipOpenToWork} />
            <span><b>İş arayan profilleri atla</b><div className="sub">&quot;Open to Work&quot; ya da &quot;iş arıyorum&quot; yazan profillere ulaşılmaz.</div></span>
          </label>
          <div className="field">
            <span className="lbl">Kararsız adaylar</span>
            <div className="radio">
              {([
                ["ASK", "Bana sor", "Emin olunamayanlar Kişiler sekmesinde “Belirsiz” olarak bekler; siz karar verirsiniz."],
                ["ACCEPT_STRONG", "Güçlü olanı al, gerisini ele", "Puanı 65 ve üstü olanlar doğrudan sıraya girer, diğerleri elenir."],
                ["DROP", "Hepsini ele", "Emin olunamayan kimseye ulaşılmaz."],
              ] as const).map(([v, l, d]) => (
                <label key={v}>
                  <input type="radio" name="uncertainPolicy" value={v} defaultChecked={c.uncertainPolicy === v} />
                  <span><b>{l}</b><div className="sub">{d}</div></span>
                </label>
              ))}
            </div>
          </div>
          <div className="row"><SubmitButton>Kaydet</SubmitButton></div>
        </div>
      </form>

      <div className="stack">
        <div className="card">
          <div className="card-h"><div><h2>Segmentler</h2><span className="sub">Kişi, kurumuna göre bir segmente girer; her segmentin kendi mesaj varyantı olabilir. Segment yoksa genel metin kullanılır.</span></div></div>
          <div className="card-b tight">
            <ul className="list">
              {c.segments.map((s) => (
                <li key={s.id}>
                  <div style={{ flex: 1 }}><b>{s.name}</b><div className="sub">Kurum adında: {segmentKeywords(s).join(", ") || "—"}</div></div>
                  <form action={removeSegment}>
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="segmentId" value={s.id} />
                    <button className="btn sm quiet">Kaldır</button>
                  </form>
                </li>
              ))}
              {!c.segments.length && <li className="sub">Segment yok; herkese genel metin gider.</li>}
            </ul>
            <form action={addSegment} className="stack" style={{ padding: 16, borderTop: "1px solid var(--line)" }}>
              <input type="hidden" name="id" value={c.id} />
              <div className="grid g2">
                <div className="field"><label htmlFor="sname">Segment adı</label><input type="text" id="sname" name="name" placeholder="Klinik / tıp merkezi" /></div>
                <div className="field"><label htmlFor="skw">Kurum adında geçenler</label><input type="text" id="skw" name="keywords" placeholder="klinik, tıp merkezi, poliklinik" /></div>
              </div>
              <div className="row"><SubmitButton className="btn sm">Segment ekle</SubmitButton></div>
            </form>
          </div>
        </div>
        <div className="card">
          <div className="card-h"><div><h2>Hedef kurum listesi · {c.targetAccounts.length}</h2><span className="sub">Önce kurum, sonra o kurumdaki doğru unvanlar aranır. En isabetli kaynak.</span></div></div>
          <div className="card-b tight">
            {c.targetAccounts.length > 0 && (
              <ul className="list" style={{ maxHeight: 320, overflowY: "auto" }}>
                {c.targetAccounts.map((a) => (
                  <li key={a.id}>
                    <span style={{ flex: 1 }}>{a.name}</span>
                    <form action={removeTargetAccount}>
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="accountId" value={a.id} />
                      <button className="btn sm quiet">Çıkar</button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
            <form action={addTargetAccounts} className="stack" style={{ padding: 16, borderTop: c.targetAccounts.length ? "1px solid var(--line)" : undefined }}>
              <input type="hidden" name="id" value={c.id} />
              <div className="field">
                <label htmlFor="names">Kurum ekle</label>
                <textarea id="names" name="names" style={{ minHeight: 80 }} placeholder={"Her satıra bir kurum adı\nÖzel Örnek Hastanesi"} />
                <span className="help">Excel'den bir sütunu kopyalayıp yapıştırabilirsiniz.</span>
              </div>
              <div className="row"><SubmitButton className="btn sm">Listeye ekle</SubmitButton></div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
