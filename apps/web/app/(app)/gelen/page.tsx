import { INBOX_FILTERS, classifyReply, matchesInboxFilter, salutationFor, suggestReply, type InboxFilter } from "@hfo/core";
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

export default async function Page({ searchParams }: { searchParams: Promise<{ k?: string; f?: string }> }) {
  const ctx = await requireContext();
  const sp = await searchParams;
  const replied = await prisma.prospect.findMany({
    where: { workspaceId: ctx.workspace.id, messages: { some: { direction: "INBOUND" } } },
    include: { messages: { orderBy: { sentAt: "asc" } }, agents: { include: { agent: { select: { name: true, requiredLink: true } } }, orderBy: { createdAt: "desc" } }, opportunities: { select: { id: true } } },
  });
  const all = replied
    .map((p) => {
      const last = p.messages.at(-1)!;
      const ap = p.agents[0];
      const lastIn = [...p.messages].reverse().find((m) => m.direction === "INBOUND");
      const label = ap?.replyLabel ? CORE_LABEL[ap.replyLabel] : classifyReply(lastIn?.body ?? "");
      return { p, last, ap, label, lastInboundText: lastIn?.body ?? "", lastIsInbound: last.direction === "INBOUND" };
    })
    .sort((a, b) => b.last.sentAt.getTime() - a.last.sentAt.getTime());
  const filter: InboxFilter = INBOX_FILTERS.find(([k]) => k === sp.f)?.[0] ?? "hepsi";
  const counts = new Map(INBOX_FILTERS.map(([k]) => [k, all.filter((c) => matchesInboxFilter(k, c)).length]));
  const convs = all.filter((c) => matchesInboxFilter(filter, c));
  const cur = convs.find((c) => c.p.id === sp.k) ?? convs[0];
  const chips = (
    <div className="row" style={{ marginBottom: 12 }} role="group" aria-label="Süzgeç">
      {INBOX_FILTERS.map(([k, l]) => (
        <Link key={k} className={`btn sm${filter === k ? " primary" : ""}`} href={k === "hepsi" ? "/gelen" : `/gelen?f=${k}`}>{l}{(counts.get(k) ?? 0) > 0 && k !== "hepsi" ? ` · ${counts.get(k)}` : ""}</Link>
      ))}
    </div>
  );

  if (!cur)
    return (
      <>
        <h1>Gelen kutusu</h1>
        <p className="lede">Cevaplar burada etiketlenir ve önerilen yanıt hazırlanır. Cevap gelen kişiye otomatik takip gitmez.</p>
        {all.length > 0 && chips}
        <div className="card empty">{all.length ? "Bu süzgece uyan konuşma yok." : "Henüz cevap yok."}</div>
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
      {chips}
      <div className="card inbox">
        <div className="convs">
          {convs.map(({ p, last, ap }) => {
            const l = REPLY_LABEL[ap?.replyLabel ?? "OTHER"]!;
            return (
              <Link key={p.id} className="conv" href={`/gelen?k=${p.id}${filter === "hepsi" ? "" : `&f=${filter}`}`} aria-current={p.id === cur.p.id} style={{ color: "inherit", textDecoration: "none" }}>
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
