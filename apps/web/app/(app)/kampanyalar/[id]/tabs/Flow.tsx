import { prisma } from "@hfo/db";
import Link from "next/link";
import { SubmitButton } from "@/components/SubmitButton";
import { STEP_LABEL } from "@/lib/convert";
import { deleteCampaign, saveFlow } from "../actions";
import type { TabProps } from "./types";

export async function FlowTab({ campaign: c, sp }: TabProps) {
  const files = await prisma.fileAsset.findMany({ where: { workspaceId: c.workspaceId }, orderBy: { createdAt: "desc" } });
  const newPerson = c.steps.filter((s) => s.branch === "NEW_PERSON" && s.order < 90);
  const connected = c.steps.filter((s) => s.branch === "CONNECTED");
  const approved = new Set((await prisma.template.findMany({ where: { status: "APPROVED", step: { agentId: c.id } }, select: { stepId: true } })).map((t) => t.stepId));

  const step = (s: (typeof c.steps)[number], n: number, desc: string) => (
    <div className={`step ${s.type === "ACCEPTED_MESSAGE" || s.type === "CONNECTED_MESSAGE" ? "key" : ""}`} key={s.id}>
      <span className="ic">{n}</span>
      <div>
        <b>{STEP_LABEL[s.type]}</b> {approved.has(s.id) ? <span className="tag t-good">Onaylı</span> : <span className="tag t-warn">Onay bekliyor</span>}
        <div className="sub">{desc}</div>
        {s.type !== "INVITE" && (
          <div className="row" style={{ marginTop: 6 }}>
            <label className="sub" htmlFor={`file-${s.id}`}>Belge</label>
            <select id={`file-${s.id}`} name={`file-${s.id}`} defaultValue={s.attachmentId ?? ""} style={{ width: "auto", maxWidth: 260, padding: "2px 6px" }}>
              <option value="">Belge yok</option>
              {files.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <Link className="btn sm" href={`/kampanyalar/${c.id}?sekme=mesajlar&adim=${s.id}`}>Metin</Link>
      </div>
    </div>
  );
  const wait = (s: (typeof c.steps)[number]) => (
    <div className="wait" key={`w-${s.id}`}>
      Cevap yoksa <input type="number" name={`delay-${s.id}`} min={1} max={60} defaultValue={Math.round(s.delayHours / 24)} style={{ width: 56, padding: "2px 6px" }} aria-label="Bekleme günü" /> gün bekle
    </div>
  );

  return (
    <form action={saveFlow}>
      <input type="hidden" name="id" value={c.id} />
      {sp.kaydedildi && <p className="form-ok" style={{ marginBottom: 12 }}>Akış kaydedildi.</p>}
      <div className="flow">
        <div className="lane">
          <h3>Yeni kişiler <span className="tag t-mute">2. ve 3. derece</span></h3>
          <p className="sub">Davetle başlar. Kabul edilmezse davet {c.withdrawAfterDays} gün sonra geri çekilir.</p>
          <div className="stack" style={{ gap: 0 }}>
            <div className="step">
              <span className="ic">0</span>
              <div><b>Profil ziyareti</b><div className="sub">Davetten en az 12 saat önce. Kişi, profiline bakıldığını görür.</div></div>
              <label className="row sub"><input type="checkbox" name="visitBeforeInvite" defaultChecked={c.visitBeforeInvite} style={{ accentColor: "var(--accent)" }} /> Açık</label>
            </div>
            <div className="wait">12 saat sonra</div>
            {newPerson.map((s, i) => (
              <div key={s.id}>
                {i === 1 && <div className="wait">Kabul edildiği anda (1–5 dakika içinde)</div>}
                {s.type === "FOLLOW_UP" && wait(s)}
                {step(s, i + 1, s.type === "INVITE" ? "Günlük bütçe içinde, gönderim saatlerinde. Belge eklenemez." : s.type === "ACCEPTED_MESSAGE" ? "Bağlantı kabul edildikten hemen sonra; gece kabul edilirse ertesi sabah." : "Cevap gelmezse.")}
              </div>
            ))}
          </div>
          <div className={`optstep ${c.inmailEnabled ? "on" : ""}`}>
            <span style={{ flex: 1 }}><b>Davet kabul edilmezse</b><span className="sub" style={{ display: "block" }}>Geri çekilir; puanı {c.inmailMinFitScore} ve üstüyse InMail gider</span></span>
            <span className={`tag ${c.inmailEnabled ? "t-good" : "t-mute"}`}>{c.inmailEnabled ? "Açık" : "Kapalı"}</span>
            <Link className="btn sm quiet" href={`/kampanyalar/${c.id}?sekme=secenekler`}>Seçenekler</Link>
          </div>
          <div className={`optstep ${c.openProfileEnabled ? "on" : ""}`}>
            <span style={{ flex: 1 }}><b>Açık profili olanlar</b><span className="sub" style={{ display: "block" }}>Davet yerine doğrudan mesaj</span></span>
            <span className={`tag ${c.openProfileEnabled ? "t-good" : "t-mute"}`}>{c.openProfileEnabled ? "Açık" : "Kapalı"}</span>
            <Link className="btn sm quiet" href={`/kampanyalar/${c.id}?sekme=secenekler`}>Seçenekler</Link>
          </div>
        </div>
        <div className="lane">
          <h3>Mevcut bağlantılar <span className="tag t-acc">1. derece</span></h3>
          <p className="sub">Davet gönderilmez, doğrudan mesajla başlar. Davet bütçesini harcamaz.</p>
          <label className="check" style={{ borderBottom: 0, paddingTop: 0 }}>
            <input type="checkbox" name="includeConnections" defaultChecked={c.includeConnections} />
            <span><b>Mevcut bağlantılarımı da tara</b><div className="sub">Kapalıysa yalnızca yeni kişilere yazılır.</div></span>
          </label>
          <div className="stack" style={{ gap: 0 }}>
            {connected.map((s, i) => (
              <div key={s.id}>
                {s.type === "FOLLOW_UP" && wait(s)}
                {step(s, i + 1, s.type === "CONNECTED_MESSAGE" ? "Davet gerekmez; uygun bulunduğu gün gönderim saatinde." : "Cevap gelmezse.")}
              </div>
            ))}
          </div>
          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-b stack">
              <h3>Kurallar</h3>
              <ul className="checks">
                <li><span className="dot ok" />Cevap gelince akış durur; konuşma gelen kutusuna düşer.</li>
                <li><span className="dot ok" />Resmî tatillerde ve Ayarlar&apos;daki özel günlerde gönderim yapılmaz.</li>
                <li><span className="dot ok" />Bir kişi aynı anda tek kampanyada olur; yazışması biten kişiye 90 gün yazılmaz.</li>
              </ul>
              <div className="row">
                <label htmlFor="maxPerCompany">Aynı kurumdan aynı anda en fazla</label>
                <input type="number" id="maxPerCompany" name="maxPerCompany" min={1} max={10} defaultValue={c.maxPerCompany} style={{ width: 60 }} /> kişi
              </div>
              <div className="row">
                <label htmlFor="withdrawAfterDays">Kabul edilmeyen davet</label>
                <input type="number" id="withdrawAfterDays" name="withdrawAfterDays" min={14} max={30} defaultValue={c.withdrawAfterDays} style={{ width: 60 }} /> gün sonra geri çekilsin
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="row" style={{ marginTop: 16 }}>
        <SubmitButton>Akışı kaydet</SubmitButton>
      </div>
      <details className="more card" style={{ marginTop: 24 }}>
        <summary className="card-b">Kampanyayı sil</summary>
        <div className="card-b stack" style={{ paddingTop: 0 }}>
          <p className="help" style={{ margin: 0 }}>Kampanya, metinleri ve kişi kayıtları silinir. Gönderilmiş mesajlar LinkedIn&apos;de kalır. Onaylamak için kampanya adını yazın.</p>
          {sp.uyari === "silme" && <p className="form-error">Ad eşleşmedi.</p>}
          <div className="row" style={{ flexWrap: "nowrap" }}>
            <input type="text" name="confirm" aria-label="Kampanya adı" placeholder={c.name} style={{ maxWidth: 280 }} />
            <button className="btn danger" formAction={deleteCampaign}>Sil</button>
          </div>
        </div>
      </details>
    </form>
  );
}
