import { prisma } from "@hfo/db";
import type { Metadata } from "next";
import Link from "next/link";
import { requireContext } from "@/lib/context";
import { MAX_ACTIVE_AGENTS } from "@hfo/core";

export const metadata: Metadata = { title: "Kampanyalar" };

const STATUS = { ACTIVE: ["Aktif", "t-good"], PAUSED: ["Duraklatıldı", "t-mute"], DRAFT: ["Taslak", "t-warn"] } as const;
const pct = (a: number, b: number) => (b ? `%${Math.round((a / b) * 100)}` : "—");

export default async function Page({ searchParams }: { searchParams: Promise<{ sirket?: string; hazir?: string }> }) {
  const ctx = await requireContext();
  const { sirket, hazir } = await searchParams;
  const companies = await prisma.company.findMany({ where: { workspaceId: ctx.workspace.id }, orderBy: { createdAt: "asc" }, select: { id: true, name: true } });
  const filter = companies.find((c) => c.id === sirket);
  const agents = await prisma.agent.findMany({ where: { workspaceId: ctx.workspace.id, ...(filter ? { companyId: filter.id } : {}) }, orderBy: { createdAt: "asc" }, include: { segments: true } });
  const activeTotal = await prisma.agent.count({ where: { workspaceId: ctx.workspace.id, status: "ACTIVE" } });
  const nameOf = new Map(companies.map((c) => [c.id, c.name]));
  const stats = await Promise.all(
    agents.map(async (a) => {
      const by = await prisma.agentProspect.groupBy({ by: ["stage"], where: { agentId: a.id }, _count: true });
      const n = (s: string[]) => by.filter((b) => s.includes(b.stage)).reduce((t, b) => t + b._count, 0);
      const invited = await prisma.agentProspect.count({ where: { agentId: a.id, inviteSentAt: { not: null } } });
      const accepted = await prisma.agentProspect.count({ where: { agentId: a.id, connectedAt: { not: null } } });
      return { found: n(["QUEUED", "NEEDS_REVIEW", "INVITE_SENT", "CONNECTED", "MESSAGED", "INMAIL_SENT", "REPLIED", "WITHDRAWN", "FINISHED"]), invited, accepted, replied: n(["REPLIED"]) };
    }),
  );
  return (
    <>
      <div className="head">
        <div>
          <h1>Kampanyalar</h1>
          <p className="lede" style={{ margin: 0 }}>Her kampanyanın kendi hedeflemesi, akışı ve mesajları var. Hepsi bağlı LinkedIn hesabının haftalık davet bütçesini paylaşır. Aktif temsilci: {activeTotal}/{MAX_ACTIVE_AGENTS}.</p>
        </div>
        <Link className="btn primary" href="/kampanyalar/yeni">Yeni kampanya</Link>
      </div>
      {hazir != null && (
        <p className="form-ok" role="status">{+hazir > 0 ? `${hazir} temsilci taslak olarak kuruldu. Mesajlarını inceleyip etkinleştirin.` : "Hazır temsilciler zaten kurulu."}</p>
      )}
      {companies.length > 1 && (
        <div className="row" style={{ marginBottom: 12 }}>
          <span className="sub">Şirket:</span>
          <Link className={`btn sm${filter ? "" : " primary"}`} href="/kampanyalar">Hepsi</Link>
          {companies.map((c) => (
            <Link key={c.id} className={`btn sm${filter?.id === c.id ? " primary" : ""}`} href={`/kampanyalar?sirket=${c.id}`}>{c.name}</Link>
          ))}
        </div>
      )}
      {agents.length === 0 ? (
        <div className="card empty">
          Henüz kampanya yok. <Link className="link" href="/kampanyalar/yeni">İlk kampanyayı oluşturun</Link>; birkaç soruya verdiğiniz cevaplardan mesaj taslakları hazırlanır.
        </div>
      ) : (
        <div className="card scroll">
          <table>
            <thead>
              <tr><th>Kampanya</th><th>Şirket</th><th>Durum</th><th className="num">Bütçe payı</th><th className="num">Bulunan</th><th className="num">Davet</th><th className="num">Kabul</th><th className="num">Cevap</th></tr>
            </thead>
            <tbody>
              {agents.map((a, i) => {
                const s = stats[i]!;
                const [label, tone] = STATUS[a.status];
                return (
                  <tr key={a.id}>
                    <td>
                      <Link className="link" href={`/kampanyalar/${a.id}`}>{a.name}</Link>
                      {a.segments.length > 0 && <div className="sub">{a.segments.map((x) => x.name).join(" · ")}</div>}
                    </td>
                    <td>{a.companyId ? nameOf.get(a.companyId) ?? "—" : "—"}</td>
                    <td><span className={`tag ${tone}`}>{label}</span></td>
                    <td className="num">%{a.budgetSharePct}</td>
                    <td className="num">{s.found}</td>
                    <td className="num">{s.invited}</td>
                    <td className="num">{pct(s.accepted, s.invited)}</td>
                    <td className="num">{s.replied}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
