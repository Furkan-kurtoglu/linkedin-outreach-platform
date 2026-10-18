import { prisma } from "@hfo/db";
import type { Metadata } from "next";
import Link from "next/link";
import { PeopleTable } from "@/components/PeopleTable";
import { SubmitButton } from "@/components/SubmitButton";
import { UndoBanner } from "@/components/UndoBanner";
import { requireContext } from "@/lib/context";
import { personRows } from "@/lib/people";
import { BulkOps } from "@/components/BulkOps";
import { bulkReview } from "./review";
import { discoverNow, importProfiles, rescoreReview } from "./actions";

export const metadata: Metadata = { title: "Kişi bulma" };

const TABS = [["kaynaklar", "Kaynaklar"], ["karar", "Karar bekleyenler"], ["ice", "İçe aktar"], ["gecmis", "Tarama geçmişi"]] as const;
const fmt = (d: Date) => d.toLocaleString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireContext();
  const sp = await searchParams;
  const tab = TABS.find(([k]) => k === sp.sekme)?.[0] ?? "kaynaklar";
  const ws = ctx.workspace;
  const agents = await prisma.agent.findMany({ where: { workspaceId: ws.id }, select: { id: true, name: true, includeConnections: true, _count: { select: { targetAccounts: true } } } });
  const reviewWhere = { agent: { workspaceId: ws.id }, stage: "NEEDS_REVIEW" as const };
  const reviewCount = await prisma.agentProspect.count({ where: reviewWhere });

  const bySource = await prisma.prospect.groupBy({ by: ["source"], where: { workspaceId: ws.id }, _count: true });
  const src = (s: string) => bySource.find((b) => b.source === s)?._count ?? 0;
  const runs = await prisma.auditLog.findMany({ where: { workspaceId: ws.id, action: "discover" }, orderBy: { createdAt: "desc" }, take: 30 });
  const acc = await prisma.linkedinAccount.findFirst({ where: { workspaceId: ws.id }, orderBy: { createdAt: "asc" }, select: { runnerLastSeenAt: true } });
  const seenMin = acc?.runnerLastSeenAt ? Math.round((Date.now() - acc.runnerLastSeenAt.getTime()) / 60_000) : null;
  const runnerOn = seenMin !== null && seenMin < 3;
  const pending = await prisma.job.count({ where: { type: "DISCOVER", status: { in: ["PENDING", "RUNNING"] }, linkedinAccount: { workspaceId: ws.id } } });

  return (
    <>
      <div className="head">
        <div>
          <h1>Kişi bulma</h1>
          <p className="lede" style={{ margin: 0 }}>Önce mevcut bağlantılarınız, sonra hedef kurumlarınızdaki doğru unvanlar, en son geniş arama. Bulunan herkes kampanya kurallarıyla puanlanır. Tarama, yerel çalışan açıkken sürekli ve kendiliğinden yapılır; bekleyen kişi tamponu dolunca durur.</p>
        </div>
        <form action={discoverNow}><SubmitButton pendingText="Başlatılıyor…" disabled={!agents.length}>{pending ? "Sıradakileri yenile ve tara" : "Şimdi tara"}</SubmitButton></form>
      </div>
      {!runnerOn && (
        <div className="banner warning" role="status" style={{ marginBottom: 16 }}>
          <span className="dot warn" style={{ marginTop: 6 }} />
          <div className="txt">
            <b>{seenMin === null ? "Yerel çalışan henüz bağlanmadı." : `Yerel çalışan kapalı (son sinyal ${seenMin >= 120 ? `${Math.round(seenMin / 60)} saat` : `${seenMin} dk`} önce).`} Tarama bu yüzden başlamadı.</b>
            <p>Arama LinkedIn'de sizin bilgisayarınızdaki Chrome oturumuyla yapılır, bu yüzden panel tek başına tarayamaz. Bilgisayarınızda <code>baslat.bat</code> dosyasını açık tutun; sırada bekleyen {pending} tarama o an başlar.</p>
          </div>
        </div>
      )}
      {sp.baslatildi && <p className="form-ok" style={{ marginBottom: 12 }}>{sp.baslatildi === "0" ? "Taranacak kampanya bulunamadı (unvan ekleyin ya da tarama zaten sırada)." : `${sp.baslatildi} kampanya için tarama sıraya alındı; yerel çalışan sırayla kaynakları dolaşacak.`}</p>}
      <div className="tabs" role="tablist">
        {TABS.map(([k, l]) => (
          <Link key={k} className="tab" role="tab" aria-selected={tab === k} href={`/kisi-bulma?sekme=${k}`}>
            {l}{k === "karar" && reviewCount > 0 && <> <span className="badge">{reviewCount}</span></>}
          </Link>
        ))}
      </div>

      {tab === "kaynaklar" && (
        <>
          <div className="grid g3">
            {([
              ["Bağlantılarım", src("CONNECTIONS"), "Davet gerekmez, doğrudan mesaj gider. İlk önce bunlar taranır.", "Sürekli"],
              ["Hedef kurum listesi", src("ACCOUNTS"), `Önce kurum, sonra o kurumdaki doğru unvan. ${agents.reduce((t, a) => t + a._count.targetAccounts, 0)} kurum listede.`, "Sürekli"],
              ["LinkedIn araması", src("SEARCH"), "Önce 2. derece, sonra 3. derece aranır.", "Sürekli"],
              ["Gönderi etkileşimleri", src("ENGAGERS"), "Kampanyanın gelişmiş ayarlarına eklediğiniz gönderileri beğenen ve yorumlayanlar.", "Sürekli"],
              ["İçe aktarma", src("IMPORT"), "Fuar, etkinlik ya da elinizdeki profil linkleri.", "Elle"],
            ] as const).map(([n, c, d, f]) => (
              <div className="card" key={n}>
                <div className="card-b stack" style={{ gap: 8 }}>
                  <div className="row between"><h3>{n}</h3><span className="tag t-mute">{f}</span></div>
                  <div style={{ font: "500 20px var(--mono)" }}>{c} kişi</div>
                  <p className="help" style={{ margin: 0 }}>{d}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-h"><h2>Nasıl sıralanıyor?</h2></div>
            <div className="card-b"><p style={{ margin: 0, maxWidth: "80ch" }}>Her kişi önce kurallarla puanlanır (unvan, kurum, konum, sektör, segment). Sonra mevcut bağlantılar, ortak bağlantısı olanlar ve hedef kurum listesinden gelenler öne alınır. Aynı kurumdan aynı anda en fazla kampanyada belirlediğiniz sayıda kişiyle süreç yürütülür. LinkedIn&apos;i yormamak için günlük profil görüntüleme bütçesi aşılmaz.</p></div>
          </div>
        </>
      )}

      {tab === "karar" && (
        <>
          <UndoBanner auditId={sp.geri} workspaceId={ws.id} back="/kisi-bulma?sekme=karar" />
          {sp.eklendi && <p className="form-ok" style={{ marginBottom: 12 }}>{sp.eklendi} kişi eklendi. Profil ziyaretinde bilgileri tamamlanır.</p>}
          {sp.elendi && <p className="form-ok" style={{ marginBottom: 12 }}>{sp.elendi} kişi kurumu bilinmediği ya da sektör dışı olduğu için elendi.</p>}
          <div className="row between" style={{ marginBottom: 12 }}>
            <p className="lede" style={{ margin: 0 }}>Kurallar bu kişiler için kesin karar veremedi. Uygun saydıklarınız kampanyada sıraya girer.</p>
            <form action={rescoreReview}><SubmitButton className="btn sm" pendingText="Eleniyor…">Hedef dışıları ele</SubmitButton></form>
          </div>
          <form action={bulkReview}>
            <div className="row" style={{ marginBottom: 10 }}>
              <span className="sub">Seçilenler:</span>
              <BulkOps ops={[{ value: "ok", label: "Uygun say" }, { value: "skip", label: "Atla" }, { value: "exclude", label: "Kurumunu hariç tut" }]} />
            </div>
            <PeopleTable rows={await personRows(reviewWhere, 200)} />
          </form>
        </>
      )}

      {tab === "ice" && (
        <form action={importProfiles} className="card" style={{ maxWidth: 720 }}>
          <div className="card-h"><h2>Profil linklerini içe aktar</h2></div>
          <div className="card-b stack">
            {sp.hata && <p className="form-error">Kampanya seçin.</p>}
            <div className="field">
              <label htmlFor="agentId">Kampanya</label>
              <select id="agentId" name="agentId">{agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
            </div>
            <div className="field">
              <label htmlFor="urls">LinkedIn profil linkleri</label>
              <textarea id="urls" name="urls" placeholder={"https://www.linkedin.com/in/...\nhttps://www.linkedin.com/in/..."} />
              <span className="help">Her satıra bir link; en fazla 500. Kişiler &quot;Karar bekleyenler&quot;e düşer, bilgileri profil ziyaretinde tamamlanır. Daha önce &quot;bir daha yazma&quot; denen kişiler eklenmez.</span>
            </div>
            <div className="row"><SubmitButton disabled={!agents.length}>İçe aktar</SubmitButton></div>
          </div>
        </form>
      )}

      {tab === "gecmis" && (
        <div className="card scroll">
          <table>
            <thead><tr><th>Zaman</th><th>Kampanya</th><th className="num">Görüntülenen</th><th className="num">Uygun</th><th className="num">Belirsiz</th><th className="num">Elenen</th></tr></thead>
            <tbody>
              {runs.map((r) => {
                const d = (r.details ?? {}) as { agentId?: string; viewed?: number; added?: number; review?: number; rejected?: number };
                return (
                  <tr key={r.id}>
                    <td>{fmt(r.createdAt)}</td>
                    <td>{agents.find((a) => a.id === d.agentId)?.name ?? "—"}</td>
                    <td className="num">{d.viewed ?? 0}</td>
                    <td className="num">{d.added ?? 0}</td>
                    <td className="num">{d.review ?? 0}</td>
                    <td className="num">{d.rejected ?? 0}</td>
                  </tr>
                );
              })}
              {!runs.length && <tr><td colSpan={6} className="empty">Henüz tarama yapılmadı.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
