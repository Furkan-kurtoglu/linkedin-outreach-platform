import { prisma } from "@hfo/db";
import { SubmitButton } from "@/components/SubmitButton";
import { cancelPending, deleteCampaign } from "../../actions";
import type { TabProps } from "../types";

export async function DangerSection({ campaign: c, sp }: TabProps) {
  const pending = await prisma.job.count({ where: { status: { in: ["PENDING", "AWAITING_APPROVAL"] }, agentProspect: { agentId: c.id } } });
  return (
    <div className="stack" style={{ maxWidth: 720 }}>
      <div className="card">
        <div className="card-h"><h2>Bekleyen işleri iptal et</h2></div>
        <div className="card-b stack">
          <p className="help" style={{ margin: 0 }}>Sırada bekleyen davet, mesaj ve ziyaretler iptal edilir; kampanya ve kişiler silinmez. Kampanya aktifse planlayıcı yeni işleri yeniden oluşturur; durdurmak için önce kampanyayı duraklatın.</p>
          {sp.iptal && <p className="form-ok">{sp.iptal} iş iptal edildi.</p>}
          <form action={cancelPending}>
            <input type="hidden" name="id" value={c.id} />
            <SubmitButton className="btn" pendingText="İptal ediliyor…" disabled={pending === 0}>{pending ? `${pending} bekleyen işi iptal et` : "Bekleyen iş yok"}</SubmitButton>
          </form>
        </div>
      </div>
      <form action={deleteCampaign} className="card">
        <input type="hidden" name="id" value={c.id} />
        <div className="card-h"><h2 style={{ color: "var(--bad)" }}>Kampanyayı sil</h2></div>
        <div className="card-b stack">
          <p className="help" style={{ margin: 0 }}>Kampanya, metinleri ve kişi kayıtları silinir. Gönderilmiş mesajlar LinkedIn&apos;de kalır. Onaylamak için kampanya adını yazın.</p>
          {sp.uyari === "silme" && <p className="form-error">Ad eşleşmedi.</p>}
          <div className="row" style={{ flexWrap: "nowrap" }}>
            <input type="text" name="confirm" aria-label="Kampanya adı" placeholder={c.name} style={{ maxWidth: 320 }} autoComplete="off" />
            <SubmitButton className="btn danger" pendingText="Siliniyor…">Sil</SubmitButton>
          </div>
        </div>
      </form>
    </div>
  );
}
