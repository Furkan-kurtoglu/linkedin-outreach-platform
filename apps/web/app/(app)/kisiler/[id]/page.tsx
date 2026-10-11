import { buildTimeline } from "@hfo/core";
import { prisma } from "@hfo/db";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SubmitButton } from "@/components/SubmitButton";
import { OPP_STAGES, REPLY_LABEL, STAGE_LABEL } from "@/lib/convert";
import { requireContext } from "@/lib/context";
import { addNote, erasePerson, personAction, saveOpportunity } from "./actions";

export const metadata: Metadata = { title: "Kişi" };

const fmt = (d: Date) => d.toLocaleString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });
const initials = (n: string) => n.split(/\s+/).map((x) => x[0]).slice(0, 2).join("");

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext();
  const { id } = await params;
  const p = await prisma.prospect.findFirst({
    where: { id, workspaceId: ctx.workspace.id },
    include: {
      agents: { include: { agent: { select: { id: true, name: true, segments: true } } }, orderBy: { createdAt: "desc" } },
      messages: { orderBy: { sentAt: "asc" } },
      notes: { orderBy: { createdAt: "asc" } },
      opportunities: true,
    },
  });
  if (!p) notFound();
  const ap = p.agents[0];
  const authors = new Map((await prisma.user.findMany({ where: { id: { in: p.notes.map((n) => n.authorId) } }, select: { id: true, name: true, email: true } })).map((u) => [u.id, u.name ?? u.email]));
  const timeline = buildTimeline({
    createdAt: ap?.createdAt ?? p.createdAt,
    visitedAt: ap?.visitedAt ?? undefined,
    inviteSentAt: ap?.inviteSentAt ?? undefined,
    connectedAt: ap?.branch === "NEW_PERSON" ? (ap.connectedAt ?? undefined) : undefined,
    withdrawnAt: ap?.withdrawnAt ?? undefined,
    inmailSentAt: ap?.inmailSentAt ?? undefined,
    messages: p.messages.map((m) => ({ at: m.sentAt, direction: m.direction, body: m.body })),
    notes: p.notes.map((n) => ({ at: n.createdAt, author: authors.get(n.authorId) ?? "Ekip", body: n.body })),
    campaignName: ap?.agent.name,
  });
  const next = ap ? await prisma.job.findFirst({ where: { agentProspectId: ap.id, status: { in: ["PENDING", "AWAITING_APPROVAL"] } }, orderBy: { runAfter: "asc" } }) : null;
  const opp = p.opportunities[0];
  const st = ap ? STAGE_LABEL[ap.stage] : undefined;
  const reply = ap?.replyLabel ? REPLY_LABEL[ap.replyLabel] : undefined;
  const reasons = (ap?.fitReason ?? "").split(" · ").filter(Boolean);

  return (
    <>
      {ap && (
        <div className="crumbs" style={{ marginBottom: 8 }}>
          <Link className="link" href="/kampanyalar">Kampanyalar</Link><span>/</span>
          <Link className="link" href={`/kampanyalar/${ap.agent.id}?sekme=kisiler`}>{ap.agent.name}</Link><span>/</span>
          <b>{p.fullName}</b>
        </div>
      )}
      <div className="head">
        <div className="row" style={{ alignItems: "flex-start", gap: 12 }}>
          <span className="avatar" style={{ width: 44, height: 44, fontSize: 15 }}>{initials(p.fullName)}</span>
          <div>
            <h1>{p.fullName}</h1>
            <p className="lede" style={{ margin: 0 }}>{[p.title, p.company].filter(Boolean).join(" · ") || "Bilgiler profil ziyaretinde tamamlanacak"}</p>
            <div className="row" style={{ marginTop: 8 }}>
              {(p.degree || ap?.branch === "CONNECTED") && <span className={`tag ${p.degree === 1 || ap?.branch === "CONNECTED" ? "t-acc" : "t-mute"}`}>{ap?.branch === "CONNECTED" ? 1 : p.degree}. derece</span>}
              {st && <span className={`tag ${st.tone}`}>{st.text}</span>}
              {reply && <span className={`tag ${reply.tone}`}>{reply.text}</span>}
              {ap?.fitScore != null && <span className="tag t-mute">Puan {ap.fitScore}</span>}
              {p.lang === "en" && <span className="tag t-mute">İngilizce profil</span>}
              {p.openProfile && <span className="tag t-mute">Açık profil</span>}
            </div>
          </div>
        </div>
        <form action={personAction} className="row">
          <input type="hidden" name="prospectId" value={p.id} />
          <a className="btn" href={p.linkedinUrl} target="_blank" rel="noopener noreferrer">LinkedIn&apos;de aç</a>
          {ap && !["SKIPPED", "FINISHED", "WITHDRAWN"].includes(ap.stage) && <button className="btn" name="op" value="skip">Atla</button>}
          {p.company && <button className="btn" name="op" value="exclude">Kurumu hariç tut</button>}
          <button className="btn quiet" name="op" value="never">Bir daha yazma</button>
        </form>
      </div>
      <div className="grid g-main">
        <div className="card">
          <div className="card-h"><h2>Geçmiş</h2><span className="sub">Sıradaki: {next ? `${next.status === "AWAITING_APPROVAL" ? "onayınızda" : fmt(next.runAfter)}` : "—"}</span></div>
          <ul className="tl">
            {timeline.map((e, i) => (
              <li key={i} className={`k-${e.kind}`}>
                <span className="when">{fmt(e.at)}</span>
                <span className="rail" />
                <div className="what"><b>{e.text}</b>{e.body && <div className="body">{e.body}</div>}</div>
              </li>
            ))}
          </ul>
        </div>
        <div className="stack">
          <form action={saveOpportunity} className="card">
            <input type="hidden" name="prospectId" value={p.id} />
            <div className="card-h"><h2>Fırsat</h2></div>
            <div className="card-b stack">
              {!opp && <p className="help" style={{ margin: 0 }}>Görüşmeye ilerleyen kişiyi fırsat olarak izleyin.</p>}
              <div className="field">
                <label htmlFor="stage">Aşama</label>
                <select id="stage" name="stage" defaultValue={opp?.stage ?? "NEW"}>{OPP_STAGES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
              </div>
              <div className="row" style={{ flexWrap: "nowrap", alignItems: "flex-end" }}>
                <div className="field" style={{ flex: 1 }}><label htmlFor="nextStep">Sıradaki adım</label><input type="text" id="nextStep" name="nextStep" defaultValue={opp?.nextStep ?? ""} placeholder="Online görüşme" /></div>
                <div className="field"><label htmlFor="nextStepAt">Tarih</label><input type="date" id="nextStepAt" name="nextStepAt" defaultValue={opp?.nextStepAt ? opp.nextStepAt.toISOString().slice(0, 10) : ""} style={{ width: 160 }} /></div>
              </div>
              <div className="field"><label htmlFor="lostReason">Kaybedildiyse neden</label><input type="text" id="lostReason" name="lostReason" defaultValue={opp?.lostReason ?? ""} /></div>
              <div className="row"><SubmitButton className="btn">{opp ? "Kaydet" : "Fırsat oluştur"}</SubmitButton></div>
            </div>
          </form>
          <div className="card">
            <div className="card-h"><h2>Notlar</h2><span className="sub">{p.notes.length}</span></div>
            <div className="card-b stack">
              {p.notes.map((n) => (
                <div key={n.id}><div className="sub">{authors.get(n.authorId) ?? "Ekip"} · {fmt(n.createdAt)}</div><div style={{ whiteSpace: "pre-wrap" }}>{n.body}</div></div>
              ))}
              {!p.notes.length && <p className="help" style={{ margin: 0 }}>Henüz not yok. Notlar yalnızca ekibinize görünür, kişiye gönderilmez.</p>}
              <form action={addNote} className="stack" style={{ gap: 6 }}>
                <input type="hidden" name="prospectId" value={p.id} />
                <textarea name="body" style={{ minHeight: 70 }} placeholder="Görüşme notu, hatırlatma…" aria-label="Not" required />
                <SubmitButton className="btn sm" pendingText="Ekleniyor…">Not ekle</SubmitButton>
              </form>
            </div>
          </div>
          {reasons.length > 0 && (
            <div className="card">
              <div className="card-h"><h2>Neden bu kişi?</h2></div>
              <div className="card-b">
                <ul style={{ margin: 0, paddingLeft: 18 }}>{reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
                <div className="sub" style={{ marginTop: 6 }}>Kaynak: {({ CONNECTIONS: "Bağlantılarım", ACCOUNTS: "Hedef kurum", SEARCH: "LinkedIn araması", ENGAGERS: "Gönderi etkileşimi", IMPORT: "İçe aktarma" } as const)[p.source]}{p.mutualConnections ? ` · ${p.mutualConnections} ortak bağlantı` : ""}</div>
              </div>
            </div>
          )}
          <details className="more card">
            <summary className="card-b">KVKK silme talebi</summary>
            <form action={erasePerson} className="card-b stack" style={{ paddingTop: 0 }}>
              <input type="hidden" name="prospectId" value={p.id} />
              <p className="help" style={{ margin: 0 }}>Kişi, yazışmaları ve notları kalıcı olarak silinir. Tekrar bulunup yazılmaması için yalnızca profil linkinin geri döndürülemez özeti tutulur.</p>
              <div className="row"><SubmitButton className="btn danger" pendingText="Siliniyor…">Kişiyi sil</SubmitButton></div>
            </form>
          </details>
        </div>
      </div>
    </>
  );
}
