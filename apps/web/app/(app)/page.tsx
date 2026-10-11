import { dailyPlan, onboardingProgress } from "@hfo/core";
import { prisma } from "@hfo/db";
import Link from "next/link";
import { SubmitButton } from "@/components/SubmitButton";
import { requireContext } from "@/lib/context";
import { toScheduleConfig } from "@/lib/convert";
import { localDay } from "@/lib/planner";
import { awaitingReplyIds } from "@/lib/queries";
import { hideOnboarding } from "./actions";

const LINKS: Record<string, string> = { account: "/hesaplar", schedule: "/hesaplar", privacy: "/ayarlar", campaign: "/kampanyalar/yeni", templates: "/kampanyalar", people: "/kampanyalar" };
const DAYS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
const fmtTime = (d: Date) => d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });

export default async function Overview() {
  const ctx = await requireContext();
  const ws = ctx.workspace;
  const now = new Date();
  const account = await prisma.linkedinAccount.findFirst({ where: { workspaceId: ws.id }, orderBy: { createdAt: "asc" } });
  const agents = await prisma.agent.findMany({ where: { workspaceId: ws.id }, select: { id: true, name: true, status: true } });
  const agentIds = agents.map((a) => a.id);
  const approvedCount = await prisma.template.count({ where: { status: "APPROVED", step: { agentId: { in: agentIds } } } });

  const done = [
    account?.runnerTokenHash && account.runnerLastSeenAt ? "account" : "",
    account?.schedule ? "schedule" : "",
    ws.privacyNoticeUrl ? "privacy" : "",
    agents.length ? "campaign" : "",
    approvedCount ? "templates" : "",
    agents.some((a) => a.status === "ACTIVE") ? "people" : "",
  ].filter(Boolean);
  const onb = onboardingProgress(done);
  const showOnb = !onb.finished && !ws.onboardingDone.includes("hidden");

  // Bu haftanın davetleri (Pazartesi başlangıçlı)
  const today = localDay(now, 180);
  const mondayOffset = (today.weekday + 6) % 7;
  const weekStart = new Date(today.startUtc.getTime() - mondayOffset * 86_400_000);
  const invites = await prisma.job.findMany({ where: { type: "SEND_INVITE", status: "DONE", finishedAt: { gte: weekStart }, linkedinAccount: { workspaceId: ws.id } }, select: { finishedAt: true } });
  const sent = new Array(7).fill(0) as number[];
  for (const j of invites) {
    const k = Math.min(6, Math.floor((j.finishedAt!.getTime() - weekStart.getTime()) / 86_400_000));
    sent[k] = (sent[k] ?? 0) + 1;
  }
  const plan = account ? dailyPlan(toScheduleConfig(account)) : new Map<number, number>();
  const quota = [1, 2, 3, 4, 5, 6, 0].map((d) => plan.get(d) ?? 0);
  const sentTotal = sent.reduce((a, b) => a + b, 0);
  const quotaTotal = quota.reduce((a, b) => a + b, 0);

  const [invited, accepted, connMsgs, replies, interested, queue, review, waiting, recent] = await Promise.all([
    prisma.agentProspect.count({ where: { agentId: { in: agentIds }, inviteSentAt: { gte: weekStart } } }),
    prisma.agentProspect.count({ where: { agentId: { in: agentIds }, connectedAt: { gte: weekStart }, branch: "NEW_PERSON" } }),
    prisma.message.count({ where: { agentId: { in: agentIds }, direction: "OUTBOUND", sentAt: { gte: weekStart }, prospect: { agents: { some: { branch: "CONNECTED" } } } } }),
    prisma.agentProspect.count({ where: { agentId: { in: agentIds }, repliedAt: { gte: weekStart } } }),
    prisma.agentProspect.count({ where: { agentId: { in: agentIds }, repliedAt: { gte: weekStart }, replyLabel: "INTERESTED" } }),
    prisma.job.count({ where: { status: "AWAITING_APPROVAL", linkedinAccount: { workspaceId: ws.id } } }),
    prisma.agentProspect.count({ where: { agentId: { in: agentIds }, stage: "NEEDS_REVIEW" } }),
    awaitingReplyIds(ws.id),
    prisma.message.findMany({ where: { prospect: { workspaceId: ws.id } }, orderBy: { sentAt: "desc" }, take: 6, include: { prospect: { select: { id: true, fullName: true } } } }),
  ]);
  const max = Math.max(1, ...quota, ...sent);

  return (
    <>
      <div className="head">
        <div>
          <h1>Genel bakış</h1>
          <p className="lede" style={{ margin: 0 }}>Bu hafta. Davetler seçtiğiniz gün ve saatlere yayılır; kabul edilen bağlantıya detay mesajı birkaç dakika içinde gider.</p>
        </div>
        <Link className="btn primary" href="/kampanyalar/yeni">Yeni kampanya</Link>
      </div>

      {showOnb && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-h">
            <div><h2>Kurulum · {onb.completed}/{onb.total}</h2><span className="sub">Sıradaki: {onb.steps.find((s) => !s.done)?.title}</span></div>
            <form action={hideOnboarding}><SubmitButton className="btn sm quiet" pendingText="…">Gizle</SubmitButton></form>
          </div>
          <div className="onb">
            {onb.steps.map((s, i) => (
              <Link key={s.key} href={LINKS[s.key]!} className={s.done ? "done" : undefined} style={{ display: "flex", gap: 10, alignItems: "flex-start", textAlign: "left", borderRight: "1px solid var(--line)", borderBottom: "1px solid var(--line)", padding: "12px 16px", color: "inherit", textDecoration: "none" }}>
                <span className="n">{s.done ? "✓" : i + 1}</span>
                <span><b>{s.title}</b><span className="sub">{s.hint}</span></span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="grid g4">
        <div className="card kpi"><div className="k">Gönderilen davet</div><div className="v">{sentTotal} <span className="sub">/ {quotaTotal}</span></div><div className="bar"><i style={{ width: `${Math.min(100, Math.round((sentTotal / Math.max(1, quotaTotal)) * 100))}%` }} /></div></div>
        <div className="card kpi"><div className="k">Kabul oranı</div><div className="v">{invited ? `%${Math.round((accepted / invited) * 100)}` : "—"}</div><div className="s">{accepted} kabul</div></div>
        <div className="card kpi"><div className="k">Mevcut bağlantılara mesaj</div><div className="v">{connMsgs}</div><div className="s">Davet gerekmedi</div></div>
        <div className="card kpi"><div className="k">Cevap</div><div className="v">{replies}</div><div className="s">{interested} ilgileniyor</div></div>
      </div>

      <div className="grid g-main" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="card-h"><h2>İlgilenmeniz gerekenler</h2></div>
          {queue > 0 && <div className="attn"><span className="stripe" style={{ background: "var(--accent)" }} /><div style={{ flex: 1 }}><b>{queue} gönderim onayınızı bekliyor</b><p>Onaylanan mesaj, gönderim saatleri içinde gider.</p></div><Link className="btn sm" href="/onay">Kuyruğu aç</Link></div>}
          {waiting.length > 0 && <div className="attn"><span className="stripe" style={{ background: "var(--good)" }} /><div style={{ flex: 1 }}><b>{waiting.length} konuşma yanıt bekliyor</b><p>Önerilen yanıt hazır; gönderilmeden önce düzenleyebilirsiniz.</p></div><Link className="btn sm" href="/gelen">Gelen kutusu</Link></div>}
          {review > 0 && <div className="attn"><span className="stripe" style={{ background: "var(--warn)" }} /><div style={{ flex: 1 }}><b>{review} kişi için kararınız gerekiyor</b><p>Kurallar bu kişiler için kesin karar veremedi.</p></div><Link className="btn sm" href="/kisi-bulma?sekme=karar">İncele</Link></div>}
          {!queue && !waiting.length && !review && <div className="empty">Şu an bekleyen bir şey yok.</div>}
        </div>
        <div className="card">
          <div className="card-h"><h2>Günlük davetler</h2><Link className="link" href="/hesaplar">Zamanlamayı düzenle</Link></div>
          <div className="card-b">
            <svg viewBox="0 0 280 130" role="img" aria-label="Bu hafta günlük gönderilen davetler ve hedefler" style={{ width: "100%", height: "auto" }}>
              {DAYS.map((d, i) => {
                const sc = 90 / max, x = 10 + i * 39, hq = quota[i]! * sc, hs = sent[i]! * sc;
                return (
                  <g key={d}>
                    <rect x={x} y={108 - hq} width={26} height={hq} rx={3} fill="var(--sunk)" />
                    <rect x={x} y={108 - hs} width={26} height={hs} rx={3} fill="var(--accent)" opacity={i === mondayOffset ? 1 : 0.75} />
                    <text x={x + 13} y={124} textAnchor="middle" fontSize={10} fill={i === mondayOffset ? "var(--fg)" : "var(--muted)"}>{d}</text>
                    {sent[i]! > 0 && <text x={x + 13} y={102 - hs} textAnchor="middle" fontSize={10} fontFamily="IBM Plex Mono, monospace" fill="var(--fg)">{sent[i]}</text>}
                  </g>
                );
              })}
            </svg>
            <p className="help" style={{ margin: "8px 0 0" }}>Koyu: gönderilen. Açık: o günün hedefi.</p>
          </div>
        </div>
      </div>

      <div className="grid g2" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="card-h"><h2>Kampanyalar</h2><Link className="link" href="/kampanyalar">Tümü</Link></div>
          <div className="card-b tight">
            <ul className="list">
              {agents.map((a) => (
                <li key={a.id}><Link className="link" style={{ flex: 1 }} href={`/kampanyalar/${a.id}`}>{a.name}</Link><span className={`tag ${a.status === "ACTIVE" ? "t-good" : a.status === "DRAFT" ? "t-warn" : "t-mute"}`}>{a.status === "ACTIVE" ? "Aktif" : a.status === "DRAFT" ? "Taslak" : "Duraklatıldı"}</span></li>
              ))}
              {!agents.length && <li className="sub">Henüz kampanya yok.</li>}
            </ul>
          </div>
        </div>
        <div className="card">
          <div className="card-h"><h2>Son mesajlar</h2></div>
          <ul className="list">
            {recent.map((m) => (
              <li key={m.id}>
                <span className="time">{fmtTime(m.sentAt)}</span>
                <span style={{ minWidth: 0 }}>
                  <Link className="link" href={`/kisiler/${m.prospect.id}`}>{m.prospect.fullName}</Link> {m.direction === "INBOUND" ? <span className="tag t-good">cevap</span> : <span className="sub">· gönderildi</span>}
                  <div className="sub" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 420 }}>{m.body}</div>
                </span>
              </li>
            ))}
            {!recent.length && <li className="sub">Henüz mesaj yok.</li>}
          </ul>
        </div>
      </div>
    </>
  );
}
