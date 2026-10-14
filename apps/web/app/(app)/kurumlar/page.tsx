import { KIND_SEARCH, TR_PROVINCES, fold } from "@hfo/core";
import { prisma } from "@hfo/db";
import type { Metadata } from "next";
import Link from "next/link";
import { SubmitButton } from "@/components/SubmitButton";
import { readTargeting } from "@/lib/convert";
import { requireContext } from "@/lib/context";
import { applyCompanyExclusions } from "@/lib/institution-exclusions";
import { KIND_LABEL, SIZE_LABEL, STATUS_LABEL, institutionWhere, type InstSearch } from "@/lib/institution-filter";
import { bulkInstitutions, enrichInstitutions, findCompaniesOnLinkedIn, importMoh, importOsm, importPaste, importSeed } from "./actions";
import { ProvincePicker } from "./ProvincePicker";
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
  anahtar: "En az bir arama sözcüğü yazın.",
  hesap: "Önce Hesaplar sayfasından bir LinkedIn hesabı bağlayın; arama o hesabın tarayıcısında yapılır.",
  bekleyen: "Sırada zaten çok sayıda LinkedIn araması var (100+). Yerel çalışan bir kısmını bitirince yenisini ekleyin.",
};

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireContext();
  const sp = await searchParams;
  // Tür süzgeci birden çok olabilir (?tur=A&tur=B ya da A,B)
  const tur = ([] as string[]).concat((sp.tur as unknown as string | string[] | undefined) ?? []).flatMap((x) => x.split(",")).filter((k) => KIND_LABEL[k]).join(",");
  const f: InstSearch = { q: sp.q, tur: tur || undefined, ilce: sp.ilce, durum: sp.durum, kaynak: sp.kaynak, il: sp.il, boyut: sp.boyut, sektor: sp.sektor };
  const where = institutionWhere(ctx.workspace.id, f);
  const page = Math.max(1, Math.floor(+(sp.sayfa ?? 1)) || 1);
  const ws = ctx.workspace.id;
  // Hariç tutulan kurum kuralları havuza her zaman uygulanır (kural sonradan eklenmiş olsa bile)
  await applyCompanyExclusions(ws);
  const [total, matching, rows, byKind, byStatus, agents, extraCities, account, liJobs, pendingEnrich, byCity, bySector] = await Promise.all([
    prisma.institution.count({ where: { workspaceId: ws } }),
    prisma.institution.count({ where }),
    prisma.institution.findMany({ where, orderBy: [{ city: "asc" }, { district: "asc" }, { name: "asc" }], skip: (page - 1) * PAGE, take: PAGE }),
    prisma.institution.groupBy({ by: ["kind"], where: { workspaceId: ws }, _count: true }),
    prisma.institution.groupBy({ by: ["status"], where: { workspaceId: ws }, _count: true }),
    prisma.agent.findMany({ where: { workspaceId: ws }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, targeting: true } }),
    prisma.institution.findMany({ where: { workspaceId: ws, city: { not: null } }, distinct: ["city"], select: { city: true }, orderBy: { city: "asc" }, take: 200 }),
    prisma.linkedinAccount.findFirst({ where: { workspaceId: ws }, orderBy: { createdAt: "asc" }, select: { runnerLastSeenAt: true } }),
    prisma.job.findMany({ where: { linkedinAccount: { workspaceId: ws }, type: { in: ["DISCOVER_COMPANIES", "ENRICH_COMPANIES"] } }, orderBy: { createdAt: "desc" }, take: 300, select: { type: true, status: true, lastError: true, finishedAt: true } }),
    prisma.institution.count({ where: { workspaceId: ws, linkedinUrl: { not: null }, enrichedAt: null } }),
    prisma.institution.groupBy({ by: ["city"], where: { workspaceId: ws, city: { not: null } }, _count: true }),
    prisma.institution.groupBy({ by: ["orgType"], where: { workspaceId: ws, orgType: { not: null } }, _count: true, orderBy: { _count: { orgType: "desc" } }, take: 60 }),
  ]);
  // İl başına kurum sayısı (yazım farklarını birleştirir)
  const cityCount = new Map<string, number>();
  for (const c of byCity) cityCount.set(fold(c.city ?? ""), (cityCount.get(fold(c.city ?? "")) ?? 0) + c._count);
  // Tüm 81 il her zaman seçilebilir; veride listede olmayan yazımlar da eklenir
  const cities = [...TR_PROVINCES, ...extraCities.map((c) => c.city ?? "").filter((c) => c && !TR_PROVINCES.some((p) => p.toLocaleLowerCase("tr-TR") === c.toLocaleLowerCase("tr-TR")))].map((city) => ({ city }));
  const seenMin = account?.runnerLastSeenAt ? Math.round((Date.now() - account.runnerLastSeenAt.getTime()) / 60_000) : null;
  const runnerOn = seenMin !== null && seenMin < 3;
  const jobCount = (t: string, st2: string[]) => liJobs.filter((j) => j.type === t && st2.includes(j.status)).length;
  const lastFail = liJobs.find((j) => j.status === "FAILED" || (j.lastError && j.status === "PENDING"))?.lastError;
  const k = (kind: string) => byKind.find((b) => b.kind === kind)?._count ?? 0;
  const st = (s: string) => byStatus.find((b) => b.status === s)?._count ?? 0;
  const pages = Math.max(1, Math.ceil(matching / PAGE));
  const qs = (p: number) => new URLSearchParams({ ...Object.fromEntries(Object.entries(f).filter(([, v]) => v) as [string, string][]), sayfa: String(p) }).toString();
  const filtered = Object.values(f).some(Boolean);

  const note = sp.ayrinti_is != null ? `${sp.ayrinti_is} ayrıntı okuma işi sıraya alındı (web sitesi, çalışan sayısı, merkez). Yerel çalışan açıkken yapılır.` : sp.aranacak != null ? `${sp.aranacak} arama sözcüğü ${sp.is} işe bölünerek sıraya alındı. Yerel çalışan (baslat.bat) açıkken LinkedIn'de taranır; bulunan şirketler bu listeye "LinkedIn" kaynağıyla düşer.` : sp.eklendi != null ? `${sp.eklendi} yeni kurum eklendi${sp.toplam ? ` (kaynakta ${sp.toplam} kayıt vardı; zaten listede olanlar atlandı)` : ""}.` : sp.kampanya != null ? `${sp.kampanya} kurum kampanyanın hedef listesine eklendi${+(sp.atlanan ?? 0) ? `; ${sp.atlanan} kurum hariç tutma kuralı nedeniyle atlandı` : ""}${+(sp.tur_uyumsuz ?? 0) ? `; ${sp.tur_uyumsuz} kurum kampanyanın hedef türüne uymadığı için eklenmedi` : ""}. ${sp.tarama === "basladi" ? "Bu kurumlardaki kişileri arama sıraya alındı." : sp.tarama === "bekliyor" ? "Kampanyada devam eden bir kişi taraması var; o bitince yeni kurumlar için Kampanya sayfasından taramayı yeniden başlatın." : sp.tarama === "duraklatilmis" ? "Kampanya duraklatılmış; etkinleştirince kişi taraması başlar." : ""}` : sp.islem ? `${sp.n ?? 0} kurum ${sp.islem === "haric" ? "hariç tutuldu" : sp.islem === "sil" ? "silindi" : "yeniye alındı"}.` : null;

  return (
    <>
      <div className="head">
        <div>
          <h1>Kurum Ar-Ge</h1>
          <p className="lede" style={{ margin: 0 }}>Hedeflenecek tüm kurumların havuzu. Resmî listelerden, haritadan ya da kendi listenizden toplayın; süzün; seçtiklerinizi bir kampanyanın hedef kurum listesine ekleyin. Kampanya o kurumlardaki doğru unvanları arar.</p>
        </div>
      </div>
      {note && <div className="banner"><div className="txt"><b>{note}</b></div></div>}
      {sp.hata && <div className="banner warning" role="alert"><span className="dot warn" style={{ marginTop: 6 }} /><div className="txt"><b>{ERR[sp.hata] ?? "İşlem tamamlanamadı."}</b>{sp.ayrinti && <p>Ayrıntı: {sp.ayrinti}</p>}</div></div>}
      {sp.uyari === "secim" && <div className="banner warning" role="alert"><div className="txt"><b>Önce tablodan kurum seçin ya da "filtredeki tümü" kutusunu işaretleyin.</b></div></div>}
      {sp.uyari === "karisik" && <div className="banner warning" role="alert"><div className="txt"><b>Seçimde birden çok tür var ({sp.turler}); tür sınırı olmayan bir kampanyaya karışık liste eklenemez.</b><p>Önce yukarıdan tek bir türe süzün ya da kampanyanın Hedefleme sekmesinde hedef kurum türlerini seçin.</p></div></div>}
      {sp.uyari === "tur_farkli" && <div className="banner warning" role="alert"><div className="txt"><b>Bu kampanyanın listesinde zaten {sp.mevcut} var; seçtiğiniz kurumlar {sp.turler}.</b><p>Farklı türdeki kurumlara başka bir mesaj gitmesin diye eklenmedi. Başka bir kampanya seçin ya da kampanyanın Hedefleme sekmesinde hedef kurum türlerini seçin.</p></div></div>}
      {sp.uyari === "kampanya" && <div className="banner warning" role="alert"><div className="txt"><b>Bir kampanya seçin.</b></div></div>}

      <div className="stat5" style={{ marginBottom: 16 }}>
        <div className="stat"><div className="sub">Toplam kurum</div><div className="v">{total}</div></div>
        <div className="stat"><div className="sub">Hastane</div><div className="v">{k("HOSPITAL")}</div></div>
        <div className="stat"><div className="sub">Tıp merkezi ve klinik</div><div className="v">{k("MEDICAL_CENTER") + k("CLINIC") + k("DENTAL")}</div></div>
        <div className="stat"><div className="sub">Sigorta</div><div className="v">{k("INSURER")}</div></div>
        <div className="stat"><div className="sub">Seçili / hariç</div><div className="v">{st("SELECTED")} / {st("EXCLUDED")}</div></div>
      </div>

      <div className={`banner${runnerOn ? "" : " warning"}`} role="status" style={{ marginBottom: 16 }}>
        <div className="txt">
          <b>{runnerOn ? "Yerel çalışan açık; LinkedIn aramaları yapılıyor." : seenMin === null ? "Yerel çalışan henüz bağlanmadı." : `Yerel çalışan kapalı (son sinyal ${seenMin >= 120 ? `${Math.round(seenMin / 60)} saat` : `${seenMin} dk`} önce).`}</b>
          <p>LinkedIn aramaları yalnızca çalışan açıkken (baslat.bat) yürür; kapalıyken sırada bekler.
            {" "}Şirket araması: {jobCount("DISCOVER_COMPANIES", ["PENDING", "RUNNING"])} sırada, {jobCount("DISCOVER_COMPANIES", ["DONE"])} bitti, {jobCount("DISCOVER_COMPANIES", ["FAILED"])} hatalı.
            {" "}Ayrıntı okuma: {jobCount("ENRICH_COMPANIES", ["PENDING", "RUNNING"])} sırada, {jobCount("ENRICH_COMPANIES", ["DONE"])} bitti.
            {lastFail ? ` Son hata: ${lastFail}` : ""}</p>
        </div>
      </div>

      <form action={findCompaniesOnLinkedIn} className="card" style={{ marginBottom: 16 }}>
        <div className="card-h"><h2>LinkedIn'de şirket ara</h2><span className="sub">Güncel kaynak: LinkedIn şirket sayfaları</span></div>
        <div className="card-b stack">
          <p className="sub" style={{ margin: 0 }}>Web listeleri eskiyebilir; LinkedIn'de şirketin sayfası varsa ve hâlâ aktifse burada görünür. Her satıra bir arama sözcüğü yazın (Türkçe ve İngilizce olabilir). Bulunan şirketler havuza eklenir; sonra kampanyaya ekleyince o şirketlerdeki kurucu, müdür ve yöneticiler aranır.</p>
          <div className="field">
            <label>Aranacak kurum türleri</label>
            <div className="row" style={{ gap: 14, flexWrap: "wrap" }}>
              {Object.entries(KIND_SEARCH).map(([k, v]) => (
                <label key={k} className="row" style={{ gap: 6 }} title={v!.keywords.join(", ")}><input type="checkbox" name="turler" value={k} defaultChecked={k === "CLINIC"} /> {v!.label}</label>
              ))}
            </div>
            <span className="sub">Seçilen her tür kendi sözcükleriyle ve kendi türüyle aranır (üstüne gelince sözcükler görünür). Sigorta şirketleri merkezi olduğu için il il değil, Türkiye genelinde aranır.</span>
          </div>
          <div className="field"><label htmlFor="li-anahtar">Ek arama sözcükleri (isteğe bağlı)</label><textarea id="li-anahtar" name="anahtar" style={{ minHeight: 72 }} defaultValue={sp.anahtar ?? ""} placeholder={"Her satıra bir sözcük; sağlık dışı sektörler için de kullanılır\nörn. gıda üretimi"} /></div>
          <div className="field">
            <label>İller</label>
            <ProvincePicker provinces={[...TR_PROVINCES]} name="sehir" initial={["İstanbul"]} />
            <span className="sub">Her arama sözcüğü seçilen illerin her biri için ayrı aranır (LinkedIn bir aramada en fazla birkaç yüz sonuç verdiği için il il aramak daha çok kurum bulur). 20'den fazla il seçilirse sözcük sayısı 3 ile sınırlanır.</span>
          </div>
          <div className="grid g2">
            <div className="field"><label htmlFor="li-tur">Ek sözcüklerle bulunup türü anlaşılamayan şirketlere atanacak tür</label><select id="li-tur" name="tur" defaultValue="OTHER">{Object.entries(KIND_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select><span className="sub">Tür, şirket adından ve LinkedIn sektöründen çıkarılır (hastane, klinik, diş, sigorta…). Çıkarılamazsa bu tür verilir. Sağlık dışı sektörde "Diğer" kalsın; sektör bilgisi her şirketin kaydında ve "Sektör" filtresinde ayrıca tutulur.</span></div>
            <div className="field"><label htmlFor="li-sayfa">Sözcük başına sayfa</label><select id="li-sayfa" name="sayfa" defaultValue="3">{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} sayfa (~{n * 10} şirket)</option>)}</select></div>
          </div>
          <div className="row"><SubmitButton className="btn primary" pendingText="Sıraya alınıyor…">LinkedIn'de ara</SubmitButton><span className="sub">Yalnızca şirket sayfalarını okur; kimseye davet ya da mesaj gitmez.</span></div>
        </div>
      </form>
      {pendingEnrich > 0 && (
        <form action={enrichInstitutions} className="card" style={{ marginBottom: 16 }}>
          <div className="card-b row between">
            <div className="txt" style={{ flex: "1 1 280px" }}><b>{pendingEnrich} LinkedIn şirketinin ayrıntısı okunmadı</b><p className="sub" style={{ margin: "2px 0 0" }}>Şirket sayfasındaki web sitesi, sektör, çalışan sayısı ve merkez bilgisi okunur. Yeni bulunanlar için bu kendiliğinden başlar; buradan elle de başlatabilirsiniz.</p></div>
            <SubmitButton className="btn" pendingText="Sıraya alınıyor…">Ayrıntıları tamamla</SubmitButton>
          </div>
        </form>
      )}

      <details className="card" open={total === 0} style={{ marginBottom: 16 }}>
        <summary className="card-h" style={{ cursor: "pointer" }}><h2>Kaynaklardan kurum topla</h2><span className="sub">Resmî liste, harita, yapıştırma, hazır liste</span></summary>
        <div className="card-b grid g2">
          <form action={importMoh} className="stack">
            <h3>Sağlık Bakanlığı özel hastane listesi</h3>
            <p className="sub" style={{ margin: 0 }}>Faal özel hastanelerin resmî listesi (il, ilçe, ad, tip). Küçük, orta ve büyük hepsi gelir. Bakanlık sayfasındaki liste 2020 tarihli olabilir; yeni açılanlar harita ve yapıştırma ile tamamlanır.</p>
            <div className="field"><label htmlFor="moh-il">İl</label><select id="moh-il" name="il" defaultValue=""><option value="">Tüm iller (81 il)</option>{TR_PROVINCES.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
            <div className="row"><SubmitButton className="btn primary" pendingText="Çekiliyor…">Listeyi çek</SubmitButton></div>
          </form>
          <form action={importOsm} className="stack">
            <h3>Haritadan hastane ve klinik (OpenStreetMap)</h3>
            <p className="sub" style={{ margin: 0 }}>Haritada kayıtlı özel hastane, klinik ve tıp merkezleri; kamu görünenler ayıklanır. Kapsam eksik olabilir. Birkaç on saniye sürer.</p>
            <div className="field"><label htmlFor="osm-il">İl</label><select id="osm-il" name="il" defaultValue="İstanbul">{TR_PROVINCES.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
            <label className="check" style={{ borderBottom: 0, padding: 0 }}><input type="checkbox" name="dental" /><span>Diş klinikleri de gelsin <span className="sub">(sayıları çok yüksek olabilir)</span></span></label>
            <div className="row"><SubmitButton className="btn primary" pendingText="Aranıyor… (1 dk sürebilir)">Haritadan çek</SubmitButton></div>
          </form>
          <form action={importPaste} className="stack">
            <h3>Liste yapıştır</h3>
            <p className="sub" style={{ margin: 0 }}>İl sağlık müdürlüğü, dernek ya da kendi Excel listeniz. Her satıra bir kurum: <code>Ad; İlçe; Tür</code>. Yalnızca ad da yeter.</p>
            <textarea name="liste" style={{ minHeight: 96 }} placeholder={"Alfa Tıp Merkezi; Kadıköy\nBeta Kliniği; Şişli"} aria-label="Kurum listesi" />
            <div className="grid g2">
              <div className="field"><label htmlFor="p-il">İl</label><select id="p-il" name="il" defaultValue="İstanbul">{TR_PROVINCES.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
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
          <fieldset className="row" style={{ gap: 10, flexWrap: "wrap", border: 0, margin: 0, padding: 0 }} aria-label="Tür">
            {Object.entries(KIND_LABEL).map(([v, l]) => (
              <label key={v} className="row" style={{ gap: 4 }}><input type="checkbox" name="tur" value={v} defaultChecked={(f.tur ?? "").split(",").includes(v)} /> {l}</label>
            ))}
          </fieldset>
          <select name="il" defaultValue={f.il ?? ""} aria-label="İl" style={{ width: "auto" }}><option value="">Tüm iller</option>{cities.map((c) => <option key={c.city} value={c.city ?? ""}>{c.city} ({cityCount.get(fold(c.city ?? "")) ?? 0})</option>)}</select>
          <input type="search" name="ilce" defaultValue={f.ilce} placeholder="İlçe" aria-label="İlçe" style={{ maxWidth: 140 }} />
          <select name="durum" defaultValue={f.durum ?? ""} aria-label="Durum" style={{ width: "auto" }}><option value="">Tüm durumlar</option>{Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <select name="kaynak" defaultValue={f.kaynak ?? ""} aria-label="Kaynak" style={{ width: "auto" }}><option value="">Tüm kaynaklar</option><option value="moh">Sağlık Bakanlığı</option><option value="linkedin">LinkedIn</option><option value="osm">Harita</option><option value="paste">Yapıştırılan</option><option value="seed">Hazır liste</option></select>
          <select name="sektor" defaultValue={f.sektor ?? ""} aria-label="Sektör" style={{ width: "auto", maxWidth: 220 }}><option value="">Tüm sektörler</option>{bySector.map((b) => <option key={b.orgType} value={b.orgType ?? ""}>{b.orgType} ({b._count})</option>)}</select>
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
          <div className="bulk" style={{ position: "sticky", top: 8, zIndex: 5 }}>
            <span><b>{matching}</b> kurum{filtered ? " bu süzgeçte" : ""}</span>
            <label className="row" style={{ gap: 6 }}><input type="checkbox" name="scope" value="filtre" /> Süzgeçteki tüm {Math.min(matching, 3000)} kurumu seç (yalnızca bu sayfadakileri değil)</label>
            <select name="agentId" aria-label="Kampanya" style={{ width: "auto", color: "var(--fg)" }} defaultValue="">
              <option value="" disabled>Kampanya seç…</option>
              {agents.map((a) => { const ks = readTargeting(a.targeting).institutionKinds; return <option key={a.id} value={a.id}>{a.name} — {ks.length ? ks.map((k) => KIND_LABEL[k] ?? k).join(", ") : "tür sınırı yok (Hedefleme'den seçin)"}</option>; })}
            </select>
            <button name="op" value="kampanya" className="btn sm">Kampanyaya ekle</button>
            <button name="op" value="haric" className="btn sm">Hariç tut</button>
            <button name="op" value="yeni" className="btn sm">Yeniye al</button>
            <button name="op" value="sil" className="btn sm danger">Sil</button>
          </div>
          <div className="card scroll">
            <table>
              <thead><tr><th className="sel"><SelectAll formId="kurum-form" /></th><th>Kurum</th><th>Tür</th><th>İl / ilçe</th><th>Web sitesi</th><th>Boyut</th><th>Kaynak</th><th>Durum</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="sel"><input type="checkbox" name="ids" value={r.id} aria-label={`${r.name} seç`} /></td>
                    <td><b>{r.linkedinUrl ? <a className="link" href={r.linkedinUrl} target="_blank" rel="noopener noreferrer">{r.name}</a> : r.name}</b>{r.orgType && <div className="sub">{r.orgType}</div>}{r.note && <div className="sub">{r.note}</div>}</td>
                    <td><span className="tag t-mute">{KIND_LABEL[r.kind] ?? r.kind}</span></td>
                    <td>{[r.city, r.district].filter(Boolean).join(" / ") || "—"}</td>
                    <td>{r.website ? <a className="link" href={/^https?:/.test(r.website) ? r.website : `https://${r.website}`} target="_blank" rel="noopener noreferrer">{r.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}</a> : <span className="sub">—</span>}</td>
                    <td>{r.size ? SIZE_LABEL[r.size] : <span className="sub">—</span>}</td>
                    <td className="sub">{({ moh: "Sağlık Bakanlığı", linkedin: "LinkedIn", osm: "Harita", paste: "Yapıştırılan", seed: "Hazır liste" } as Record<string, string>)[r.source] ?? r.source}</td>
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
