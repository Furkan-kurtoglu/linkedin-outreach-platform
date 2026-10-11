import { prisma } from "@hfo/db";
import type { Metadata } from "next";
import Link from "next/link";
import { SubmitButton } from "@/components/SubmitButton";
import { requireContext } from "@/lib/context";
import { KIND_LABEL, SIZE_LABEL, STATUS_LABEL, institutionWhere, type InstSearch } from "@/lib/institution-filter";
import { bulkInstitutions, importMoh, importOsm, importPaste, importSeed } from "./actions";
import { SelectAll } from "./SelectAll";

export const metadata: Metadata = { title: "Kurum Ar-Ge" };
// Resmî liste ve harita sorguları birkaç on saniye sürebilir
export const maxDuration = 60;

const PAGE = 50;
const ERR: Record<string, string> = {
  moh_erisim: "Sağlık Bakanlığı sayfasına şu an ulaşılamadı. Biraz sonra tekrar deneyin ya da listeyi aşağıdan yapıştırın.",
  moh_bicim: "Sağlık Bakanlığı sayfasının biçimi tanınmadı (değişmiş olabilir). Listeyi aşağıdan yapıştırarak ekleyin.",
  osm_erisim: "Harita servisi (OpenStreetMap) şu an yanıt vermedi. Birkaç dakika sonra tekrar deneyin.",
  bos: "Eklenecek satır bulunamadı.",
};

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireContext();
  const sp = await searchParams;
  const f: InstSearch = { q: sp.q, tur: sp.tur, ilce: sp.ilce, durum: sp.durum, kaynak: sp.kaynak, il: sp.il, boyut: sp.boyut };
  const where = institutionWhere(ctx.workspace.id, f);
  const page = Math.max(1, Math.floor(+(sp.sayfa ?? 1)) || 1);
  const ws = ctx.workspace.id;
  const [total, matching, rows, byKind, byStatus, agents, cities] = await Promise.all([
    prisma.institution.count({ where: { workspaceId: ws } }),
    prisma.institution.count({ where }),
    prisma.institution.findMany({ where, orderBy: [{ city: "asc" }, { district: "asc" }, { name: "asc" }], skip: (page - 1) * PAGE, take: PAGE }),
    prisma.institution.groupBy({ by: ["kind"], where: { workspaceId: ws }, _count: true }),
    prisma.institution.groupBy({ by: ["status"], where: { workspaceId: ws }, _count: true }),
    prisma.agent.findMany({ where: { workspaceId: ws }, orderBy: { createdAt: "asc" }, select: { id: true, name: true } }),
    prisma.institution.findMany({ where: { workspaceId: ws, city: { not: null } }, distinct: ["city"], select: { city: true }, orderBy: { city: "asc" }, take: 100 }),
  ]);
  const k = (kind: string) => byKind.find((b) => b.kind === kind)?._count ?? 0;
  const st = (s: string) => byStatus.find((b) => b.status === s)?._count ?? 0;
  const pages = Math.max(1, Math.ceil(matching / PAGE));
  const qs = (p: number) => new URLSearchParams({ ...Object.fromEntries(Object.entries(f).filter(([, v]) => v) as [string, string][]), sayfa: String(p) }).toString();
  const filtered = Object.values(f).some(Boolean);

  const note = sp.eklendi != null ? `${sp.eklendi} yeni kurum eklendi${sp.toplam ? ` (kaynakta ${sp.toplam} kayıt vardı; zaten listede olanlar atlandı)` : ""}.` : sp.kampanya != null ? `${sp.kampanya} kurum kampanyanın hedef listesine eklendi${+(sp.atlanan ?? 0) ? `; ${sp.atlanan} kurum hariç tutma kuralı nedeniyle atlandı` : ""}.` : sp.islem ? `${sp.n ?? 0} kurum ${sp.islem === "haric" ? "hariç tutuldu" : sp.islem === "sil" ? "silindi" : "yeniye alındı"}.` : null;

  return (
    <>
      <div className="head">
        <div>
          <h1>Kurum Ar-Ge</h1>
          <p className="lede" style={{ margin: 0 }}>Hedeflenecek tüm kurumların havuzu. Resmî listelerden, haritadan ya da kendi listenizden toplayın; süzün; seçtiklerinizi bir kampanyanın hedef kurum listesine ekleyin. Kampanya o kurumlardaki doğru unvanları arar.</p>
        </div>
      </div>
      {note && <div className="banner"><div className="txt"><b>{note}</b></div></div>}
      {sp.hata && <div className="banner warning" role="alert"><span className="dot warn" style={{ marginTop: 6 }} /><div className="txt"><b>{ERR[sp.hata] ?? "İşlem tamamlanamadı."}</b></div></div>}
      {sp.uyari === "secim" && <div className="banner warning" role="alert"><div className="txt"><b>Önce tablodan kurum seçin ya da "filtredeki tümü" kutusunu işaretleyin.</b></div></div>}
      {sp.uyari === "kampanya" && <div className="banner warning" role="alert"><div className="txt"><b>Bir kampanya seçin.</b></div></div>}

      <div className="stat5" style={{ marginBottom: 16 }}>
        <div className="stat"><div className="sub">Toplam kurum</div><div className="v">{total}</div></div>
        <div className="stat"><div className="sub">Hastane</div><div className="v">{k("HOSPITAL")}</div></div>
        <div className="stat"><div className="sub">Tıp merkezi ve klinik</div><div className="v">{k("MEDICAL_CENTER") + k("CLINIC") + k("DENTAL")}</div></div>
        <div className="stat"><div className="sub">Sigorta</div><div className="v">{k("INSURER")}</div></div>
        <div className="stat"><div className="sub">Seçili / hariç</div><div className="v">{st("SELECTED")} / {st("EXCLUDED")}</div></div>
      </div>

      <details className="card" open={total === 0} style={{ marginBottom: 16 }}>
        <summary className="card-h" style={{ cursor: "pointer" }}><h2>Kaynaklardan kurum topla</h2><span className="sub">Resmî liste, harita, yapıştırma, hazır liste</span></summary>
        <div className="card-b grid g2">
          <form action={importMoh} className="stack">
            <h3>Sağlık Bakanlığı özel hastane listesi</h3>
            <p className="sub" style={{ margin: 0 }}>Faal özel hastanelerin resmî listesi (il, ilçe, ad, tip). Küçük, orta ve büyük hepsi gelir. Bakanlık sayfasındaki liste 2020 tarihli olabilir; yeni açılanlar harita ve yapıştırma ile tamamlanır.</p>
            <div className="field"><label htmlFor="moh-il">İl</label><input type="text" id="moh-il" name="il" defaultValue="İstanbul" placeholder="Boş bırakırsanız tüm iller" /></div>
            <div className="row"><SubmitButton className="btn primary" pendingText="Çekiliyor…">Listeyi çek</SubmitButton></div>
          </form>
          <form action={importOsm} className="stack">
            <h3>Haritadan hastane ve klinik (OpenStreetMap)</h3>
            <p className="sub" style={{ margin: 0 }}>Haritada kayıtlı özel hastane, klinik ve tıp merkezleri; kamu görünenler ayıklanır. Kapsam eksik olabilir. Birkaç on saniye sürer.</p>
            <div className="field"><label htmlFor="osm-il">İl</label><input type="text" id="osm-il" name="il" defaultValue="İstanbul" /></div>
            <label className="check" style={{ borderBottom: 0, padding: 0 }}><input type="checkbox" name="dental" /><span>Diş klinikleri de gelsin <span className="sub">(sayıları çok yüksek olabilir)</span></span></label>
            <div className="row"><SubmitButton className="btn primary" pendingText="Aranıyor… (1 dk sürebilir)">Haritadan çek</SubmitButton></div>
          </form>
          <form action={importPaste} className="stack">
            <h3>Liste yapıştır</h3>
            <p className="sub" style={{ margin: 0 }}>İl sağlık müdürlüğü, dernek ya da kendi Excel listeniz. Her satıra bir kurum: <code>Ad; İlçe; Tür</code>. Yalnızca ad da yeter.</p>
            <textarea name="liste" style={{ minHeight: 96 }} placeholder={"Alfa Tıp Merkezi; Kadıköy\nBeta Kliniği; Şişli"} aria-label="Kurum listesi" />
            <div className="grid g2">
              <div className="field"><label htmlFor="p-il">İl</label><input type="text" id="p-il" name="il" defaultValue="İstanbul" /></div>
              <div className="field"><label htmlFor="p-tur">Tür belli değilse</label><select id="p-tur" name="tur" defaultValue=""><option value="">Addan anla</option>{Object.entries(KIND_LABEL).filter(([x]) => x !== "OTHER").map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
            </div>
            <div className="row"><SubmitButton className="btn primary" pendingText="Ekleniyor…">Listeyi ekle</SubmitButton></div>
          </form>
          <form action={importSeed} className="stack">
            <h3>Hazır liste</h3>
            <p className="sub" style={{ margin: 0 }}>Bilinen büyük hastane grupları, sağlık sigortası sunan şirketler (Bupa Acıbadem dahil) ve birkaç klinik. Hızlı başlangıç için.</p>
            <div className="row"><SubmitButton className="btn" pendingText="Ekleniyor…">Hazır listeyi ekle</SubmitButton></div>
          </form>
        </div>
      </details>

      <form className="card" style={{ marginBottom: 16 }} method="get">
        <div className="card-b row">
          <input type="search" name="q" defaultValue={f.q} placeholder="Kurum adı ara" aria-label="Kurum adı ara" style={{ maxWidth: 240 }} />
          <select name="tur" defaultValue={f.tur ?? ""} aria-label="Tür" style={{ width: "auto" }}><option value="">Tüm türler</option>{Object.entries(KIND_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <select name="il" defaultValue={f.il ?? ""} aria-label="İl" style={{ width: "auto" }}><option value="">Tüm iller</option>{cities.map((c) => <option key={c.city} value={c.city ?? ""}>{c.city}</option>)}</select>
          <input type="search" name="ilce" defaultValue={f.ilce} placeholder="İlçe" aria-label="İlçe" style={{ maxWidth: 140 }} />
          <select name="durum" defaultValue={f.durum ?? ""} aria-label="Durum" style={{ width: "auto" }}><option value="">Tüm durumlar</option>{Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <select name="kaynak" defaultValue={f.kaynak ?? ""} aria-label="Kaynak" style={{ width: "auto" }}><option value="">Tüm kaynaklar</option><option value="moh">Sağlık Bakanlığı</option><option value="osm">Harita</option><option value="paste">Yapıştırılan</option><option value="seed">Hazır liste</option></select>
          <select name="boyut" defaultValue={f.boyut ?? ""} aria-label="Boyut" style={{ width: "auto" }}><option value="">Her boyut</option>{Object.entries(SIZE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <button className="btn">Süz</button>
          {filtered && <Link className="link" href="/kurumlar">Temizle</Link>}
        </div>
      </form>

      {matching === 0 ? (
        <div className="card empty">{total === 0 ? "Henüz kurum yok. Yukarıdaki kaynaklardan toplayarak başlayın." : "Bu süzgece uyan kurum yok."}</div>
      ) : (
        <form action={bulkInstitutions} id="kurum-form">
          {Object.entries(f).map(([key, v]) => v && <input key={key} type="hidden" name={`f_${key}`} value={v} />)}
          <div className="bulk">
            <span><b>{matching}</b> kurum{filtered ? " bu süzgeçte" : ""}</span>
            <label className="row" style={{ gap: 6 }}><input type="checkbox" name="scope" value="filtre" /> Filtredeki tümüne uygula ({Math.min(matching, 3000)})</label>
            <select name="agentId" aria-label="Kampanya" style={{ width: "auto", color: "var(--fg)" }} defaultValue="">
              <option value="" disabled>Kampanya seç…</option>
              {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <button name="op" value="kampanya" className="btn sm">Kampanyaya ekle</button>
            <button name="op" value="haric" className="btn sm">Hariç tut</button>
            <button name="op" value="yeni" className="btn sm">Yeniye al</button>
            <button name="op" value="sil" className="btn sm danger">Sil</button>
          </div>
          <div className="card scroll">
            <table>
              <thead><tr><th className="sel"><SelectAll formId="kurum-form" /></th><th>Kurum</th><th>Tür</th><th>İl / ilçe</th><th>Boyut</th><th>Kaynak</th><th>Durum</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="sel"><input type="checkbox" name="ids" value={r.id} aria-label={`${r.name} seç`} /></td>
                    <td><b>{r.name}</b>{r.orgType && <div className="sub">{r.orgType}</div>}</td>
                    <td><span className="tag t-mute">{KIND_LABEL[r.kind] ?? r.kind}</span></td>
                    <td>{[r.city, r.district].filter(Boolean).join(" / ") || "—"}</td>
                    <td>{r.size ? SIZE_LABEL[r.size] : <span className="sub">—</span>}</td>
                    <td className="sub">{({ moh: "Sağlık Bakanlığı", osm: "Harita", paste: "Yapıştırılan", seed: "Hazır liste" } as Record<string, string>)[r.source] ?? r.source}</td>
                    <td><span className={`tag ${r.status === "SELECTED" ? "t-good" : r.status === "EXCLUDED" ? "t-bad" : "t-mute"}`}>{STATUS_LABEL[r.status]}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="pager">
              <span className="sub" style={{ alignSelf: "center" }}>Sayfa {page}/{pages}</span>
              {page > 1 && <Link className="btn sm" href={`/kurumlar?${qs(page - 1)}`}>Önceki</Link>}
              {page < pages && <Link className="btn sm" href={`/kurumlar?${qs(page + 1)}`}>Sonraki</Link>}
            </div>
          </div>
        </form>
      )}
    </>
  );
}
