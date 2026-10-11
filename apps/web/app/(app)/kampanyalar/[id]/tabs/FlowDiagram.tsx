import { STEP_LABEL } from "@/lib/convert";
import type { Campaign } from "@/lib/campaign";

const days = (h: number) => (h >= 24 ? `${Math.round(h / 24)} gün` : `${h} saat`);

/** Akışın okunur şeması: adımlar, bekleme süreleri ve "kabul edildi mi" koşulu. Düzenleme aşağıdaki kartlarda. */
export function FlowDiagram({ c }: { c: Campaign }) {
  const np = c.steps.filter((s) => s.branch === "NEW_PERSON" && s.order < 90).sort((a, b) => a.order - b.order);
  const invite = np.find((s) => s.type === "INVITE");
  const accepted = np.find((s) => s.type === "ACCEPTED_MESSAGE");
  const follow = np.filter((s) => s.type === "FOLLOW_UP");
  const conn = c.steps.filter((s) => s.branch === "CONNECTED").sort((a, b) => a.order - b.order);
  const A = () => <div className="fa" aria-hidden="true" />;
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-h"><div><h2>Akış şeması</h2><span className="sub">Cevap gelirse akış her adımda durur ve konuşma gelen kutusuna düşer.</span></div></div>
      <div className="card-b">
        <div className="grid g2" style={{ alignItems: "start" }}>
          <div className="fd" aria-label="Yeni kişiler">
            <div className="fw"><b>Yeni kişiler (2. ve 3. derece)</b></div>
            {c.visitBeforeInvite && (<><div className="fn">Profil ziyareti<small>davetten en az 12 saat önce</small></div><A /></>)}
            <div className="fn">{invite ? STEP_LABEL[invite.type] : "Davet"}<small>bütçe ve gönderim saatleri içinde</small></div>
            <A />
            <div className="fn dec">Davet kabul edildi mi?<small>en çok {c.withdrawAfterDays} gün beklenir</small></div>
            <div className="fbranch" style={{ marginTop: 6 }}>
              <div>
                <h4>Evet</h4>
                <div className="fn">{accepted ? STEP_LABEL[accepted.type] : "Kabulde mesaj"}<small>kabul anından 1–5 dakika sonra</small></div>
                {follow.map((s) => (
                  <div key={s.id} className="fd" style={{ padding: 0 }}>
                    <A />
                    <div className="fw">cevap yoksa {days(s.delayHours)} sonra</div>
                    <div className="fn">{STEP_LABEL[s.type]}</div>
                  </div>
                ))}
                <A />
                <div className="fn end">Akış biter<small>cevap gelmezse; 90 gün tekrar yazılmaz</small></div>
              </div>
              <div>
                <h4>Hayır</h4>
                <div className="fn">Daveti geri çek<small>{c.withdrawAfterDays}. günde (hesapta otomatik temizlik açıksa)</small></div>
                <A />
                {c.inmailEnabled ? (
                  <div className="fn">InMail<small>puanı {c.inmailMinFitScore} ve üstüyse, haftada en çok {c.inmailWeeklyMax}</small></div>
                ) : (
                  <div className="fn end">Akış biter<small>21 gün tekrar yazılmaz</small></div>
                )}
              </div>
            </div>
          </div>
          <div className="fd" aria-label="Mevcut bağlantılar">
            <div className="fw"><b>Mevcut bağlantılar (1. derece)</b></div>
            {!c.includeConnections ? (
              <div className="fn end">Bu kampanyada kapalı<small>yalnızca yeni kişilere yazılır</small></div>
            ) : (
              <>
                {conn.map((s, i) => (
                  <div key={s.id} className="fd" style={{ padding: 0 }}>
                    {i > 0 && (<><A /><div className="fw">cevap yoksa {days(s.delayHours)} sonra</div></>)}
                    <div className="fn">{STEP_LABEL[s.type]}<small>{i === 0 ? "davet gerekmez" : "takip"}</small></div>
                  </div>
                ))}
                <A />
                <div className="fn end">Akış biter</div>
                {c.openProfileEnabled && (
                  <>
                    <div className="fw" style={{ marginTop: 12 }}><b>Açık profil</b></div>
                    <div className="fn">Davetsiz doğrudan mesaj<small>davet bütçesinden düşmez</small></div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
