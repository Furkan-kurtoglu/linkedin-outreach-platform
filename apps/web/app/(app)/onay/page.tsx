import type { JobPayload } from "@hfo/core";
import { prisma } from "@hfo/db";
import type { Metadata } from "next";
import Link from "next/link";
import { SubmitButton } from "@/components/SubmitButton";
import { requireContext } from "@/lib/context";
import { approveAll } from "./actions";
import { QueueItem } from "./QueueItem";

export const metadata: Metadata = { title: "Onay kuyruğu" };

const LABEL: Record<string, string> = { SEND_INVITE: "Davet notu", SEND_MESSAGE: "Mesaj", SEND_INMAIL: "InMail", VISIT_PROFILE: "Profil ziyareti", WITHDRAW_INVITE: "Daveti geri çekme" };
const fmt = (d: Date) => d.toLocaleString("tr-TR", { weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });
const initials = (n: string) => n.split(/\s+/).map((x) => x[0]).slice(0, 2).join("");

export default async function Page() {
  const ctx = await requireContext();
  const jobs = await prisma.job.findMany({
    where: { status: "AWAITING_APPROVAL", linkedinAccount: { workspaceId: ctx.workspace.id } },
    orderBy: [{ priority: "asc" }, { runAfter: "asc" }],
    take: 100,
  });
  const aps = await prisma.agentProspect.findMany({ where: { id: { in: jobs.map((j) => j.agentProspectId).filter((x): x is string => !!x) } }, include: { prospect: true, agent: { select: { id: true, name: true } } } });
  const apBy = new Map(aps.map((a) => [a.id, a]));
  const steps = await prisma.sequenceStep.findMany({ where: { agentId: { in: [...new Set(aps.map((a) => a.agentId))] } }, include: { attachment: true } });
  const ready = jobs.filter((j) => !j.lastError).length;

  return (
    <>
      <div className="head">
        <div>
          <h1>Onay kuyruğu</h1>
          <p className="lede" style={{ margin: 0 }}>Onaylanan mesaj, günlük bütçe ve gönderim saatleri içinde gider. Metni burada son kez düzenleyebilirsiniz; değişiklik yalnızca bu kişiye gider.</p>
        </div>
        {ready > 1 && <form action={approveAll}><SubmitButton pendingText="Onaylanıyor…">Kurallara uyanların tümünü onayla ({ready})</SubmitButton></form>}
      </div>
      <div className="stack">
        {jobs.map((j) => {
          const ap = j.agentProspectId ? apBy.get(j.agentProspectId) : undefined;
          const p = j.payload as unknown as JobPayload;
          const stepId = "stepId" in p ? p.stepId : undefined;
          const step = steps.find((s) => s.id === stepId);
          const editable = p.type === "SEND_INVITE" || p.type === "SEND_MESSAGE" || p.type === "SEND_INMAIL";
          const text = p.type === "SEND_INVITE" ? (p.note ?? "") : p.type === "SEND_MESSAGE" || p.type === "SEND_INMAIL" ? p.text : null;
          return (
            <div className="card" key={j.id}>
              <div className="card-h">
                <div className="row">
                  <span className="avatar">{initials(ap?.prospect.fullName ?? "?")}</span>
                  <div>
                    {ap ? <Link className="link" href={`/kisiler/${ap.prospectId}`}><b>{ap.prospect.fullName}</b></Link> : <b>—</b>}
                    <div className="sub">{[ap?.prospect.title, ap?.prospect.company].filter(Boolean).join(" · ")}</div>
                  </div>
                </div>
                <div className="row">
                  <span className="tag t-info">{LABEL[j.type] ?? j.type}</span>
                  {ap && <span className="tag t-mute">{ap.agent.name}</span>}
                  <span className="sub">{fmt(j.runAfter)}</span>
                  {j.lastError ? <span className="tag t-bad">Kural hatası</span> : <span className="tag t-good">Kurallar tamam</span>}
                </div>
              </div>
              <div className="card-b stack">
                {step?.attachment && <span className="file" style={{ margin: 0 }}>PDF · {step.attachment.name}</span>}
                <QueueItem jobId={j.id} text={text} editable={editable} rows={p.type === "SEND_INVITE" ? 90 : 180} label={`${ap?.prospect.fullName ?? ""} için ${LABEL[j.type]?.toLocaleLowerCase("tr-TR") ?? "iş"}`} issue={j.lastError} />
              </div>
            </div>
          );
        })}
        {!jobs.length && <div className="card empty">Onay bekleyen gönderim yok. Yeni taslaklar geldiğinde burada görünür.</div>}
      </div>
    </>
  );
}
