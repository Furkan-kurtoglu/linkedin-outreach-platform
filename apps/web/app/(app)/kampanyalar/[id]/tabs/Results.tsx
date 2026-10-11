import { featuresOf, insights, learn, compareVariants } from "@hfo/core";
import { prisma } from "@hfo/db";
import { STEP_LABEL } from "@/lib/convert";
import type { TabProps } from "./types";

const FEATURE_TEXT = (f: string) => {
  const [k, v] = f.split(":");
  return k === "segment" ? `"${v}" segmenti` : k === "derece" ? `${v}. derece bağlantılar` : k === "kaynak" ? `"${v}" kaynağından gelenler` : `"${v}" unvanlı kişiler`;
};

export async function ResultsTab({ campaign: c }: TabProps) {
  const aps = await prisma.agentProspect.findMany({
    where: { agentId: c.id },
    select: { stage: true, inviteSentAt: true, connectedAt: true, repliedAt: true, branch: true, segmentId: true, prospect: { select: { title: true, degree: true, source: true } }, replyLabel: true },
  });
  const found = aps.filter((a) => a.stage !== "SKIPPED").length;
  const invited = aps.filter((a) => a.inviteSentAt).length;
  const firstMsgConnected = aps.filter((a) => a.branch === "CONNECTED" && a.stage !== "QUEUED" && a.stage !== "NEEDS_REVIEW" && a.stage !== "SKIPPED").length;
  const accepted = aps.filter((a) => a.connectedAt).length;
  const replied = aps.filter((a) => a.repliedAt).length;
  const interested = aps.filter((a) => a.replyLabel === "INTERESTED").length;
  const funnel: [string, number][] = [
    ["Bulunan", found],
    ["Davet / ilk mesaj", invited + firstMsgConnected],
    ["Kabul", accepted],
    ["Cevap", replied],
    ["İlgileniyor", interested],
  ];
  const max = Math.max(1, funnel[0]![1]);

  // Öğrenme: davet gönderilenlerde kabul, mevcut bağlantılarda cevap
  const segName = new Map(c.segments.map((s) => [s.id, s.name]));
  const titleGroup = (t: string | null) => (t ? t.split(/\s+/).slice(0, 2).join(" ") : undefined);
  const outcomes = aps
    .filter((a) => a.inviteSentAt || (a.branch === "CONNECTED" && a.stage !== "QUEUED"))
    .map((a) => ({
      features: featuresOf({ titleGroup: titleGroup(a.prospect.title), segment: a.segmentId ? segName.get(a.segmentId) : undefined, degree: a.prospect.degree ?? undefined, source: a.prospect.source.toLowerCase() }),
      success: a.branch === "CONNECTED" ? !!a.repliedAt : !!a.connectedAt,
    }));
  const model = learn(outcomes);
  const top = insights(model);

  // A/B: aynı adımda birden fazla onaylı varyant varsa karşılaştır
  const variants = await prisma.template.findMany({ where: { step: { agentId: c.id }, status: "APPROVED" }, include: { step: true, messages: { select: { prospectId: true } } } });
  const byStep = new Map<string, typeof variants>();
  for (const v of variants) byStep.set(`${v.stepId}|${v.segmentId}|${v.lang}`, [...(byStep.get(`${v.stepId}|${v.segmentId}|${v.lang}`) ?? []), v]);
  const apBy = new Map((await prisma.agentProspect.findMany({ where: { agentId: c.id }, select: { prospectId: true, connectedAt: true, repliedAt: true } })).map((a) => [a.prospectId, a]));
  const ab = [...byStep.values()]
    .filter((list) => list.length >= 2)
    .map((list) => {
      const isInvite = list[0]!.step.type === "INVITE";
      const stats = list.map((v) => ({ id: v.variant, sent: v.messages.length, success: v.messages.filter((m) => (isInvite ? apBy.get(m.prospectId)?.connectedAt : apBy.get(m.prospectId)?.repliedAt)).length }));
      return { label: STEP_LABEL[list[0]!.step.type], cmp: compareVariants(stats[0]!, stats[1]!, isInvite ? "kabul" : "cevap"), stats };
    });

  return (
    <div className="grid g2">
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
      <div className="stack">
        <div className="card">
          <div className="card-h"><h2>Sonuçlardan öğrenilenler</h2><span className="sub">{outcomes.length} sonuç üzerinden</span></div>
          <div className="card-b tight">
            <ul className="list">
              {top.map((s) => (
                <li key={s.feature}>
                  <span className={`tag ${s.liftPts > 0 ? "t-good" : "t-warn"}`}>{s.liftPts > 0 ? "+" : ""}{s.liftPts} puan</span>
                  <span>{FEATURE_TEXT(s.feature)}: %{Math.round(s.rate * 100)} ({s.n} kişi; ortalama %{Math.round(model.baseRate * 100)}).{s.liftPts > 0 ? " Bu kişiler öne alınıyor." : ""}</span>
                </li>
              ))}
              {!top.length && <li className="sub">Anlamlı bir fark için daha fazla sonuç gerekiyor (her grupta en az 8 kişi).</li>}
            </ul>
          </div>
        </div>
        {ab.length > 0 && (
          <div className="card">
            <div className="card-h"><h2>A/B karşılaştırma</h2></div>
            <div className="card-b tight">
              <ul className="list">
                {ab.map((x, i) => (
                  <li key={i}>
                    <div><b>{x.label}</b><div className="sub">{x.stats.map((s) => `${s.id}: ${s.success}/${s.sent}`).join(" · ")}</div><div>{x.cmp.message}</div></div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
