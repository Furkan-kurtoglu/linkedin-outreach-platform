import { classifyReply, salutationFor, suggestReply } from "@hfo/core";
import { prisma } from "@hfo/db";
import type { Metadata } from "next";
import Link from "next/link";
import { SubmitButton } from "@/components/SubmitButton";
import { REPLY_LABEL } from "@/lib/convert";
import { requireContext } from "@/lib/context";
import { setLabel, toOpportunity } from "./actions";
import { ReplyBox } from "./ReplyBox";

export const metadata: Metadata = { title: "Gelen kutusu" };

const fmt = (d: Date) => d.toLocaleString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });
const CORE_LABEL = { INTERESTED: "ilgileniyor", LATER: "sonra", NOT_INTERESTED: "ilgilenmiyor", WRONG_PERSON: "yanlis_kisi", OTHER: "diger" } as const;

export default async function Page({ searchParams }: { searchParams: Promise<{ k?: string }> }) {
  const ctx = await requireContext();
  const sp = await searchParams;
  const replied = await prisma.prospect.findMany({
    where: { workspaceId: ctx.workspace.id, messages: { some: { direction: "INBOUND" } } },
    include: { messages: { orderBy: { sentAt: "asc" } }, agents: { include: { agent: { select: { name: true, requiredLink: true } } }, orderBy: { createdAt: "desc" } }, opportunities: { select: { id: true } } },
  });
  const convs = replied
    .map((p) => ({ p, last: p.messages.at(-1)!, ap: p.agents[0] }))
    .sort((a, b) => b.last.sentAt.getTime() - a.last.sentAt.getTime());
  const cur = convs.find((c) => c.p.id === sp.k) ?? convs[0];

  if (!cur)
    return (
      <>
        <h1>Gelen kutusu</h1>
        <p className="lede">Cevaplar burada etiketlenir ve önerilen yanıt hazırlanır. Cevap gelen kişiye otomatik takip gitmez.</p>
        <div className="card empty">Henüz cevap yok.</div>
      </>
    );

  const label = (cur.ap?.replyLabel ?? "OTHER") as keyof typeof CORE_LABEL;
  const lastIn = [...cur.p.messages].reverse().find((m) => m.direction === "INBOUND");
  const suggested = suggestReply(cur.ap?.replyLabel ? CORE_LABEL[label] : classifyReply(lastIn?.body ?? ""), salutationFor(cur.p.fullName, "ad_soyad"), cur.ap?.agent.requiredLink ?? undefined);
  const pending = await prisma.job.findFirst({ where: { agentProspectId: { in: cur.p.agents.map((a) => a.id) }, type: "SEND_MESSAGE", status: { in: ["PENDING", "RUNNING"] } } });

  return (
    <>
      <h1>Gelen kutusu</h1>
      <p className="lede">Cevaplar etiketlenir ve önerilen yanıt hazırlanır. Yanıtlar kendiliğinden gitmez; cevap gelen kişiye otomatik takip de gitmez.</p>
      <div className="card inbox">
        <div className="convs">
          {convs.map(({ p, last, ap }) => {
            const l = REPLY_LABEL[ap?.replyLabel ?? "OTHER"]!;
            return (
              <Link key={p.id} className="conv" href={`/gelen?k=${p.id}`} aria-current={p.id === cur.p.id} style={{ color: "inherit", textDecoration: "none" }}>
                <span className="row between"><b>{p.fullName}</b>{last.direction === "INBOUND" ? <span className={`tag ${l.tone}`}>{l.text}</span> : <span className="tag t-mute">Yanıtlandı</span>}</span>
                <span className="snip">{last.body}</span>
              </Link>
            );
          })}
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="card-h">
            <div>
              <Link className="link" href={`/kisiler/${cur.p.id}`}><b>{cur.p.fullName}</b></Link>
              <div className="sub">{[cur.p.title, cur.p.company].filter(Boolean).join(" · ")}{cur.ap ? ` · ${cur.ap.agent.name}` : ""}</div>
            </div>
            <div className="row">
              <form action={setLabel} className="row">
                <input type="hidden" name="prospectId" value={cur.p.id} />
                <select name="label" defaultValue={label} aria-label="Etiket" style={{ width: "auto" }}>
                  {Object.entries(REPLY_LABEL).map(([k, v]) => <option key={k} value={k}>{v.text}</option>)}
                </select>
                <SubmitButton className="btn sm" pendingText="…">Etiketle</SubmitButton>
              </form>
              {cur.p.opportunities.length ? (
                <Link className="btn sm" href="/firsatlar">Fırsatlarda</Link>
              ) : (
                <form action={toOpportunity}><input type="hidden" name="prospectId" value={cur.p.id} /><SubmitButton className="btn sm" pendingText="…">Fırsata taşı</SubmitButton></form>
              )}
            </div>
          </div>
          <div className="thread">
            {cur.p.messages.map((m) => (
              <div key={m.id} className={`msg ${m.direction === "OUTBOUND" ? "me" : "them"}`}>
                {m.body}
                <small>{fmt(m.sentAt)}</small>
              </div>
            ))}
          </div>
          {pending ? <p className="help" style={{ padding: "0 16px 16px" }}>Bir yanıt gönderim sırasında ({fmt(pending.runAfter)}).</p> : <ReplyBox prospectId={cur.p.id} draft={suggested} />}
        </div>
      </div>
    </>
  );
}
