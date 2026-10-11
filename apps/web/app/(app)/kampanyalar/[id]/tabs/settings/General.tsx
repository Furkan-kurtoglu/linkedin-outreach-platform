import { prisma } from "@hfo/db";
import { SubmitButton } from "@/components/SubmitButton";
import { requireContext } from "@/lib/context";
import { saveGeneral } from "../../actions";
import type { TabProps } from "../types";

export async function GeneralSection({ campaign: c, sp }: TabProps) {
  const ctx = await requireContext();
  const companies = await prisma.company.findMany({ where: { workspaceId: ctx.workspace.id }, orderBy: { createdAt: "asc" }, select: { id: true, name: true } });
  return (
    <form action={saveGeneral} className="card" style={{ maxWidth: 720 }}>
      <input type="hidden" name="id" value={c.id} />
      <div className="card-h"><div><h2>Genel</h2><span className="sub">Ad, şirket ve her mesajda denetlenen kurallar.</span></div>{sp.kaydedildi && <span className="form-ok">Kaydedildi</span>}</div>
      <div className="card-b stack">
        {sp.uyari === "ad" && <p className="form-error">Kampanya adı 3–80 karakter olmalı.</p>}
        {sp.uyari === "link" && <p className="form-error">Link http:// ya da https:// ile başlamalı.</p>}
        <div className="field"><label htmlFor="name">Kampanya adı</label><input type="text" id="name" name="name" defaultValue={c.name} maxLength={80} required /></div>
        <div className="field">
          <label htmlFor="companyId">Şirket</label>
          <select id="companyId" name="companyId" defaultValue={c.companyId ?? ""}>
            {!c.companyId && <option value="">Seçilmedi</option>}
            {companies.map((x) => (
              <option key={x.id} value={x.id}>{x.name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <span className="lbl">Gönderen hesap</span>
          <div>{c.linkedinAccount.displayName}</div>
          <span className="help">Hesabı Hesaplar sayfasından yönetirsiniz.</span>
        </div>
        <div className="field">
          <span className="lbl">Teklif özeti</span>
          <div className="sub">{c.offerContext}</div>
          <span className="help">Mesaj metinleri Mesajlar sekmesinden düzenlenir; onaylanmış metinler burada yapılan değişiklikten etkilenmez.</span>
        </div>
        <div className="field">
          <label htmlFor="requiredLink">Detay mesajında bulunması zorunlu link</label>
          <input type="text" id="requiredLink" name="requiredLink" defaultValue={c.requiredLink ?? ""} placeholder="https://" />
        </div>
        <div className="field">
          <label htmlFor="bannedPhrases">Bu kampanyada geçmemesi gereken ifadeler</label>
          <textarea id="bannedPhrases" name="bannedPhrases" defaultValue={c.bannedPhrases.join("\n")} style={{ minHeight: 88 }} />
          <span className="help">Her satıra bir ifade. Ayarlar&apos;daki genel listeye ek olarak, onay sırasında ve gönderimden hemen önce denetlenir.</span>
        </div>
        <div className="row"><SubmitButton>Kaydet</SubmitButton></div>
      </div>
    </form>
  );
}
