import { prisma } from "@hfo/db";
import { SubmitButton } from "@/components/SubmitButton";
import { saveAutonomy } from "../../actions";
import type { TabProps } from "../types";

export async function AutonomySection({ campaign: c, sp }: TabProps) {
  const waiting = await prisma.job.count({ where: { status: "AWAITING_APPROVAL", agentProspect: { agentId: c.id } } });
  return (
    <form action={saveAutonomy} className="card" style={{ maxWidth: 720 }}>
      <input type="hidden" name="id" value={c.id} />
      <div className="card-h"><div><h2>Özerklik</h2><span className="sub">Temsilcinin kendi başına ne kadar iş yapacağı.</span></div>{sp.kaydedildi && <span className="form-ok">Kaydedildi</span>}</div>
      <div className="card-b stack">
        <div className="field">
          <span className="lbl">Çalışma modu</span>
          <div className="radio">
            <label>
              <input type="radio" name="mode" value="FIND_AND_OUTREACH" defaultChecked={c.mode === "FIND_AND_OUTREACH"} />
              <span><b>Bul ve ulaş</b><div className="sub">Uygun kişiler akışa girer; davet ve mesajlar gönderilir.</div></span>
            </label>
            <label>
              <input type="radio" name="mode" value="FIND_ONLY" defaultChecked={c.mode === "FIND_ONLY"} />
              <span><b>Yalnızca bul</b><div className="sub">Kişiler bulunur ve puanlanır, hiçbir şey gönderilmez. Listeyi Kişiler sekmesinden dışa aktarabilirsiniz. Seçince bekleyen gönderimler iptal edilir.</div></span>
            </label>
          </div>
        </div>
        <div className="field">
          <span className="lbl">Onay düzeyi</span>
          <div className="radio">
            {([
              ["REVIEW_ALL", "Her mesajı onayla", "Hiçbir mesaj siz onaylamadan gitmez."],
              ["REVIEW_FIRST", "İlk mesajı onayla", "Davet notu ya da ilk mesaj onaylanır, sonrası otomatik gider."],
              ["AUTONOMOUS", "Otomatik", "Kural denetiminden geçen her mesaj gider; geçmeyen yine durur."],
            ] as const).map(([v, l, d]) => (
              <label key={v}>
                <input type="radio" name="reviewMode" value={v} defaultChecked={c.reviewMode === v} />
                <span><b>{l}</b><div className="sub">{d}</div></span>
              </label>
            ))}
          </div>
          <span className="help">{waiting > 0 ? `Şu an onay bekleyen ${waiting} iş var (Onay kuyruğu).` : "Onay bekleyen iş yok."} Seviyeyi gevşetmek bekleyen işleri kendiliğinden göndermez; onay kuyruğundan onaylarsınız.</span>
        </div>
        <div className="row"><SubmitButton>Kaydet</SubmitButton></div>
      </div>
    </form>
  );
}
