import { FIXED_HOLIDAYS_TR } from "@hfo/core";
import { prisma } from "@hfo/db";
import type { Metadata } from "next";
import { SubmitButton } from "@/components/SubmitButton";
import { requireContext } from "@/lib/context";
import { inviteMember, removeInvite, saveExcluded, saveGeneral } from "./actions";

export const metadata: Metadata = { title: "Ayarlar" };

const ROLE = { OWNER: "Sahip", ADMIN: "Yönetici", MEMBER: "Üye" } as const;

export default async function Page() {
  const ctx = await requireContext();
  const ws = ctx.workspace;
  const [excluded, members, invites] = await Promise.all([
    prisma.suppression.findMany({ where: { workspaceId: ws.id, kind: "company" }, orderBy: { createdAt: "asc" } }),
    prisma.membership.findMany({ where: { workspaceId: ws.id }, include: { user: true } }),
    prisma.workspaceInvite.findMany({ where: { workspaceId: ws.id, acceptedAt: null } }),
  ]);
  const ai = !!process.env.GEMINI_API_KEY;

  return (
    <>
      <h1>Ayarlar</h1>
      <p className="lede">Tüm kampanyalar için geçerli kurallar, KVKK, ekip ve yardımcı araçlar.</p>
      <div className="grid g2">
        <div className="stack">
          <form action={saveExcluded} className="card">
            <div className="card-h"><h2>Hariç tutma listesi</h2><span className="sub">{excluded.length} kurum</span></div>
            <div className="card-b stack">
              <p className="help" style={{ margin: 0 }}>Bu kurumlardaki kimseye ulaşılmaz; kurum adı bir mesajda geçerse mesaj durdurulur. Her satıra bir kurum.</p>
              <textarea name="companies" defaultValue={excluded.map((e) => e.value).join("\n")} style={{ minHeight: 120 }} aria-label="Hariç tutulan kurumlar" />
              <div className="row"><SubmitButton className="btn">Kaydet</SubmitButton></div>
            </div>
          </form>
          <form action={saveGeneral} className="card">
            <div className="card-h"><h2>Genel kurallar</h2></div>
            <div className="card-b stack">
              <div className="field"><label htmlFor="name">Çalışma alanı adı</label><input type="text" id="name" name="name" defaultValue={ws.name} /></div>
              <div className="field">
                <label htmlFor="bannedPhrases">Yasak ifadeler</label>
                <textarea id="bannedPhrases" name="bannedPhrases" defaultValue={ws.bannedPhrases.join("\n")} style={{ minHeight: 90 }} />
                <span className="help">Her satıra bir ifade. Tüm kampanyalarda, her mesajda denetlenir.</span>
              </div>
              <div className="field">
                <label htmlFor="quietDays">Gönderim yapılmayacak günler</label>
                <textarea id="quietDays" name="quietDays" defaultValue={ws.quietDays.join("\n")} style={{ minHeight: 90 }} placeholder="2026-03-20" />
                <span className="help">YYYY-AA-GG biçiminde, her satıra bir gün. Dinî bayramları her yıl ekleyin. Sabit resmî tatiller ({FIXED_HOLIDAYS_TR.length} gün) otomatik.</span>
              </div>
              <div className="field">
                <label htmlFor="privacyNoticeUrl">KVKK aydınlatma metni adresi</label>
                <input type="text" id="privacyNoticeUrl" name="privacyNoticeUrl" defaultValue={ws.privacyNoticeUrl ?? ""} placeholder="https://www.healthfintel.com.tr/kvkk" />
                <span className="help">Hazır metin depoda: docs/kvkk-aydinlatma.md. Köşeli parantezli yerleri doldurup web sitenizde yayınlayın.</span>
              </div>
              <div className="field">
                <label htmlFor="retentionMonths">Cevap vermeyenlerin verisi silinsin</label>
                <select id="retentionMonths" name="retentionMonths" defaultValue={String(ws.retentionMonths)}>
                  {[6, 12, 24].map((m) => <option key={m} value={m}>{m} ay sonra</option>)}
                </select>
              </div>
              <div className="row"><SubmitButton className="btn">Kaydet</SubmitButton></div>
            </div>
          </form>
        </div>
        <div className="stack">
          <div className="card">
            <div className="card-h"><h2>Ekip</h2></div>
            <div className="card-b tight">
              <table>
                <tbody>
                  {members.map((m) => (
                    <tr key={m.userId}><td>{m.user.name ?? m.user.email}<div className="sub">{m.user.email}</div></td><td className="sub">{ROLE[m.role]}</td><td /></tr>
                  ))}
                  {invites.map((i) => (
                    <tr key={i.id}>
                      <td>{i.email}<div className="sub">Davet edildi; bu adresle kayıt olunca katılır</div></td>
                      <td className="sub">Bekliyor</td>
                      <td style={{ textAlign: "right" }}><form action={removeInvite}><input type="hidden" name="id" value={i.id} /><button className="btn sm quiet">Geri al</button></form></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <form action={inviteMember} className="add" style={{ padding: "0 16px 16px" }}>
                <input type="email" name="email" placeholder="E-posta ile davet et" aria-label="Davet e-postası" required />
                <SubmitButton className="btn sm" pendingText="…">Davet et</SubmitButton>
              </form>
              <p className="help" style={{ padding: "0 16px 16px", margin: 0 }}>Ekip üyeleri bu çalışma alanının kampanyalarını ve konuşmalarını görür. Kendi LinkedIn hesabıyla ayrı çalışmak isteyen biri davetsiz kayıt olur ve kendi çalışma alanını kullanır.</p>
            </div>
          </div>
          <div className="card">
            <div className="card-h"><h2>Düzenleme yardımı</h2><span className={`tag ${ai ? "t-good" : "t-mute"}`}>{ai ? "Açık" : "Kapalı"}</span></div>
            <div className="card-b stack">
              <p className="help" style={{ margin: 0 }}>Mesaj taslakları, kural denetimi, kişi puanlama, cevap etiketleme ve sonuç karşılaştırması yapay zekâ olmadan çalışır. Bu yardım yalnızca mesaj düzenleyicideki &quot;Netleştir, Kısalt, 3 alternatif&quot; düğmeleri içindir.</p>
              <p className="help" style={{ margin: 0 }}>{ai ? "Gemini anahtarı tanımlı. Gönderilen tek şey şablon metnidir; kişi bilgisi gönderilmez. Günlük ücretsiz hak dolarsa düğmeler ertesi güne kadar çalışmaz." : "Açmak için Google AI Studio'dan ücretsiz bir anahtar alıp Vercel proje ayarlarında GEMINI_API_KEY olarak ekleyin."}</p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
