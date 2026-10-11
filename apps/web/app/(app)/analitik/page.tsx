import { bucketByDay } from "@hfo/core";
import { prisma } from "@hfo/db";
import type { Metadata } from "next";
import Link from "next/link";
import { LineChart } from "@/components/LineChart";
import { requireContext } from "@/lib/context";

export const metadata: Metadata = { title: "Analitik" };

const SERIES = [
  ["found", "Bulunan", "#8a918a"],
  ["contacted", "Ulaşılan", "#145c52"],
  ["connected", "Bağlanan", "#2b5a8a"],
  ["replied", "Cevap veren", "#8a5a00"],
] as const;
const RANGES = [["14", "14 gün"], ["30", "30 gün"], ["90", "90 gün"]] as const;
const pct = (a: number, b: number) => (b ? `%${Math.round((a / b) * 100)}` : "—");

export default async function Page({ searchParams }: { searchParams: Promise<{ sirket?: string; gun?: string }> }) {
  const ctx = await requireContext();
  const sp = await searchParams;
  const days = RANGES.find(([k]) => k === sp.gun)?.[0] ? +sp.gun! : 30;
  const companies = await prisma.company.findMany({ where: { workspaceId: ctx.workspace.id }, orderBy: { createdAt: "asc" }, select: { id: true, name: true } });
  const company = companies.find((c) => c.id === sp.sirket);
  const agents = await prisma.agent.findMany({
    where: { workspaceId: ctx.workspace.id, ...(company ? { companyId: company.id } : {}) },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, status: true, companyId: true },
  });
  const aps = await prisma.agentProspect.findMany({
    where: { agentId: { in: agents.map((a) => a.id) } },
    select: { agentId: true, stage: true, createdAt: true, inviteSentAt: true, connectedAt: true, repliedAt: true, branch: true, lastMessageAt: true, replyLabel: true },
  });
  const now = new Date();
  const contactedAt = (a: (typeof aps)[number]) => a.inviteSentAt ?? (a.branch === "CONNECTED" && a.stage !== "QUEUED" && a.stage !== "NEEDS_REVIEW" && a.stage !== "SKIPPED" ? a.lastMessageAt ?? a.createdAt : null);
  const day = (f: (a: (typeof aps)[number]) => Date | null) => bucketByDay(aps.map(f), days, now);
  const data = {
    found: day((a) => (a.stage === "SKIPPED" ? null : a.createdAt)),
    contacted: day(contactedAt),
    connected: day((a) => a.connectedAt),
    replied: day((a) => a.repliedAt),
  };
  const total = (k: keyof typeof data) => data[k].counts.reduce((s, v) => s + v, 0);
  const href = (o: { sirket?: string; gun?: string }) => {
    const q = new URLSearchParams({ ...(company ? { sirket: company.id } : {}), ...(sp.gun ? { gun: sp.gun } : {}), ...o } as Record<string, string>);
    for (const [k, v] of [...q]) if (!v) q.delete(k);
    return `/analitik${q.size ? `?${q}` : ""}`;
  };
  const rows = agents.map((a) => {
    const mine = aps.filter((x) => x.agentId === a.id);
    const contacted = mine.filter((x) => contactedAt(x)).length;
    const invited = mine.filter((x) => x.inviteSentAt).length;
    const accepted = mine.filter((x) => x.connectedAt).length;
    return { a, found: mine.filter((x) => x.stage !== "SKIPPED").length, contacted, invited, accepted, replied: mine.filter((x) => x.repliedAt).length, interested: mine.filter((x) => x.replyLabel === "INTERESTED").length };
  });

  return (
    <>
      <div className="head">
        <div>
          <h1>Analitik</h1>
          <p className="lede" style={{ margin: 0 }}>Tüm kampanyaların etkinliği. Şirkete ve döneme göre daraltabilirsiniz.</p>
        </div>
      </div>
      <div className="row" style={{ marginBottom: 12, gap: 16 }}>
        {companies.length > 1 && (
          <div className="row">
            <span className="sub">Şirket:</span>
            <Link className={`btn sm${company ? "" : " primary"}`} href={href({ sirket: "" })}>Hepsi</Link>
            {companies.map((c) => (
              <Link key={c.id} className={`btn sm${company?.id === c.id ? " primary" : ""}`} href={href({ sirket: c.id })}>{c.name}</Link>
            ))}
          </div>
        )}
        <div className="row">
          <span className="sub">Dönem:</span>
          {RANGES.map(([k, l]) => (
            <Link key={k} className={`btn sm${days === +k ? " primary" : ""}`} href={href({ gun: k })}>{l}</Link>
          ))}
        </div>
      </div>
      {agents.length === 0 ? (
        <div className="card empty">Gösterilecek kampanya yok.</div>
      ) : (
        <div className="stack" style={{ gap: 16 }}>
          <div className="card">
            <div className="card-h"><h2>Etkinlik · son {days} gün</h2></div>
            <div className="card-b row" style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <LineChart labels={data.found.labels} series={SERIES.map(([k, , color]) => ({ key: k, color, counts: data[k].counts }))} />
              </div>
              <div className="legend">
                {SERIES.map(([k, l, color]) => (
                  <div key={k} className="row between"><span><span className="sw" style={{ background: color }} />{l}</span><span className="num">{total(k)}</span></div>
                ))}
              </div>
            </div>
          </div>
          <div className="card scroll">
            <table>
              <thead><tr><th>Kampanya</th><th className="num">Bulunan</th><th className="num">Ulaşılan</th><th className="num">Kabul</th><th className="num">Cevap</th><th className="num">Cevap oranı</th><th className="num">İlgilenen</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.a.id}>
                    <td><Link className="link" href={`/kampanyalar/${r.a.id}`}>{r.a.name}</Link></td>
                    <td className="num">{r.found}</td>
                    <td className="num">{r.contacted}</td>
                    <td className="num">{pct(r.accepted, r.invited)}</td>
                    <td className="num">{r.replied}</td>
                    <td className="num">{pct(r.replied, r.contacted)}</td>
                    <td className="num">{r.interested}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
