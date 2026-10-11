import { bucketByDay } from "@hfo/core";
import { prisma } from "@hfo/db";
import { LineChart } from "@/components/LineChart";
import type { TabProps } from "./types";

const SERIES = [
  ["found", "Bulunan", "#8a918a"],
  ["contacted", "Ulaşılan", "#145c52"],
  ["connected", "Bağlanan", "#2b5a8a"],
  ["replied", "Cevap veren", "#8a5a00"],
] as const;

export async function OverviewTab({ campaign: c }: TabProps) {
  const now = new Date();
  const aps = await prisma.agentProspect.findMany({
    where: { agentId: c.id },
    select: { stage: true, createdAt: true, inviteSentAt: true, connectedAt: true, repliedAt: true, branch: true, lastMessageAt: true, replyLabel: true },
  });
  const found = aps.filter((a) => a.stage !== "SKIPPED").length;
  const invited = aps.filter((a) => a.inviteSentAt).length;
  const firstMsgConnected = aps.filter((a) => a.branch === "CONNECTED" && a.stage !== "QUEUED" && a.stage !== "NEEDS_REVIEW" && a.stage !== "SKIPPED").length;
  const contacted = invited + firstMsgConnected;
  const accepted = aps.filter((a) => a.connectedAt).length;
  const replied = aps.filter((a) => a.repliedAt).length;
  const interested = aps.filter((a) => a.replyLabel === "INTERESTED").length;
  const pct = (a: number, b: number) => (b ? `%${Math.round((a / b) * 100)}` : "—");

  const day = (f: (a: (typeof aps)[number]) => Date | null) => bucketByDay(aps.map(f), 30, now);
  const data = {
    found: day((a) => (a.stage === "SKIPPED" ? null : a.createdAt)),
    contacted: day((a) => a.inviteSentAt ?? (a.branch === "CONNECTED" ? a.lastMessageAt : null)),
    connected: day((a) => a.connectedAt),
    replied: day((a) => a.repliedAt),
  };
  const labels = data.found.labels;
  const total = (k: keyof typeof data) => data[k].counts.reduce((s, v) => s + v, 0);

  const funnel: [string, number][] = [["Bulunan", found], ["Davet / ilk mesaj", contacted], ["Kabul", accepted], ["Cevap", replied], ["İlgileniyor", interested]];
  const max = Math.max(1, funnel[0]![1]);

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="stat5">
        <div className="stat"><div className="sub">Ulaşılan</div><div className="v">{contacted}<span className="sub"> / {found}</span></div><div className="sub">{pct(contacted, found)} ulaşıldı</div></div>
        <div className="stat"><div className="sub">Davet</div><div className="v">{invited}</div><div className="sub">toplam gönderilen</div></div>
        <div className="stat"><div className="sub">Kabul</div><div className="v">{pct(accepted, invited)}</div><div className="sub">{accepted} kişi bağlandı</div></div>
        <div className="stat"><div className="sub">Cevap</div><div className="v">{replied}</div><div className="sub">{pct(replied, contacted)} cevap oranı</div></div>
        <div className="stat"><div className="sub">İlgilenen</div><div className="v">{interested}</div><div className="sub">olumlu cevap</div></div>
      </div>
      <div className="grid g-wide">
        <div className="card">
          <div className="card-h"><h2>Etkinlik · son 30 gün</h2></div>
          <div className="card-b chart-row">
            <div style={{ flex: 1, minWidth: 0 }}>
              <LineChart labels={labels} series={SERIES.map(([k, , color]) => ({ key: k, color, counts: data[k].counts }))} />
            </div>
            <div className="legend">
              {SERIES.map(([k, l, color]) => (
                <div key={k} className="row between"><span><span className="sw" style={{ background: color }} />{l}</span><span className="num">{total(k)}</span></div>
              ))}
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-h"><h2>Huni</h2><span className="sub">Kampanya başından beri</span></div>
          <div className="card-b stack">
            {funnel.map(([l, v], i) => (
              <div key={l}>
                <div className="row between"><span>{l}</span><span className="num">{v}{i > 0 && funnel[i - 1]![1] ? <span className="sub"> · %{Math.round((v / funnel[i - 1]![1]) * 100)}</span> : null}</span></div>
                <div className="bar"><i style={{ width: `${Math.max(2, (v / max) * 100)}%` }} /></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
