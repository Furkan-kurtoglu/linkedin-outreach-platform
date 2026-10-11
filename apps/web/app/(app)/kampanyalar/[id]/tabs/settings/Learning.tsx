import { compareVariants, insights } from "@hfo/core";
import { prisma } from "@hfo/db";
import { STEP_LABEL } from "@/lib/convert";
import { pooledModel } from "@/lib/learning-model";
import type { TabProps } from "../types";

const FEATURE_TEXT = (f: string) => {
  const [k, v] = f.split(":");
  return k === "segment" ? `"${v}" segmenti` : k === "derece" ? `${v}. derece bağlantılar` : k === "kaynak" ? `"${v}" kaynağından gelenler` : `"${v}" unvanlı kişiler`;
};
const SOURCE = { CONNECTIONS: "Mevcut bağlantılar", ACCOUNTS: "Hedef kurum listesi", SEARCH: "LinkedIn araması", ENGAGERS: "Gönderi etkileşimleri", IMPORT: "İçe aktarma" } as const;

export async function LearningSection({ campaign: c }: TabProps) {
  const aps = await prisma.agentProspect.findMany({
    where: { agentId: c.id },
    select: { stage: true, inviteSentAt: true, connectedAt: true, repliedAt: true, branch: true, segmentId: true, replyLabel: true, skipReason: true, createdAt: true, prospect: { select: { title: true, company: true, degree: true, source: true } } },
  });

  // Olumlu sonuç, terfi edilen ve elenen adaylar
  const interested = aps.filter((a) => a.replyLabel === "INTERESTED");
  const promoted = aps.filter((a) => a.stage !== "SKIPPED" && a.stage !== "NEEDS_REVIEW").length;
  const rejected = aps.filter((a) => a.stage === "SKIPPED");
  const reasons = new Map<string, number>();
  for (const r of rejected) {
    const k = (r.skipReason ?? "Neden yazılmadı").slice(0, 90);
    reasons.set(k, (reasons.get(k) ?? 0) + 1);
  }
  const topReasons = [...reasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const examples = rejected.filter((r) => r.prospect.title).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 6);
  const roles = new Map<string, number>();
  for (const i of interested) {
    const t = i.prospect.title?.split(/\s+/).slice(0, 3).join(" ");
    if (t) roles.set(t, (roles.get(t) ?? 0) + 1);
  }

  // Kaynak verimi: kaynaktan gelenlerin kaçı uygun bulundu
  const bySource = new Map<string, { total: number; ok: number }>();
  for (const a of aps) {
    const k = a.prospect.source;
    const v = bySource.get(k) ?? { total: 0, ok: 0 };
    v.total++;
    if (a.stage !== "SKIPPED") v.ok++;
    bySource.set(k, v);
  }

  // Sonuçlardan öğrenilenler: tüm temsilcilerin ortak verisi (kendi sonuçların iki kat ağırlıklı)
  const pooled = await pooledModel(c.workspaceId, c.id);
  const model = pooled.model;
  const top = insights(model);

  // A/B
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
    <div className="stack" style={{ gap: 16 }}>
      <div className="stat5 stat3">
        <div className="stat"><div className="sub">Olumlu sonuç</div><div className="v">{interested.length}</div><div className="sub">İlgilendiğini yazan kişi</div></div>
        <div className="stat"><div className="sub">Akışa alınan</div><div className="v">{promoted}</div><div className="sub">Uygun bulunan aday</div></div>
        <div className="stat"><div className="sub">Elenen</div><div className="v">{rejected.length}</div><div className="sub">Kurallara uymayan aday</div></div>
      </div>
      <div className="grid g2">
        <div className="card">
          <div className="card-h"><h2>Olumlu sonuçlardaki unvanlar</h2></div>
          <div className="card-b tight">
            <ul className="list">
              {[...roles.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([t, n]) => (
                <li key={t}><span style={{ flex: 1 }}>{t}</span><span className="num">{n}</span></li>
              ))}
              {!roles.size && <li className="sub">Henüz ilgilenen kişi yok.</li>}
            </ul>
          </div>
        </div>
        <div className="card">
          <div className="card-h"><h2>Kaynak verimi</h2><span className="sub">Bulunanların kaçı uygun çıktı</span></div>
          <div className="card-b tight">
            <ul className="list">
              {[...bySource.entries()].map(([k, v]) => (
                <li key={k}><span style={{ flex: 1 }}>{SOURCE[k as keyof typeof SOURCE] ?? k}</span><span className="num">%{Math.round((v.ok / v.total) * 100)} · {v.ok}/{v.total}</span></li>
              ))}
              {!bySource.size && <li className="sub">Henüz kişi bulunmadı.</li>}
            </ul>
          </div>
        </div>
        <div className="card">
          <div className="card-h"><h2>Elenme nedenleri</h2></div>
          <div className="card-b tight">
            <ul className="list">
              {topReasons.map(([r, n]) => (
                <li key={r}><span style={{ flex: 1 }}>{r}</span><span className="num">{n}</span></li>
              ))}
              {!topReasons.length && <li className="sub">Elenen aday yok.</li>}
            </ul>
          </div>
        </div>
        <div className="card">
          <div className="card-h"><h2>Elenen profil örnekleri</h2></div>
          <div className="card-b tight">
            <ul className="list">
              {examples.map((e, i) => (
                <li key={i}><div><b>{e.prospect.title}</b><div className="sub">{e.prospect.company ?? "Kurum yok"}</div></div></li>
              ))}
              {!examples.length && <li className="sub">Henüz örnek yok.</li>}
            </ul>
          </div>
        </div>
      </div>
      <div className="card">
        <div className="card-h"><h2>Sonuçlardan öğrenilenler</h2><span className="sub">{pooled.own} kendi + {pooled.others} diğer temsilcilerin sonucu</span></div>
        <div className="card-b tight">
          <ul className="list">
            {top.map((s) => (
              <li key={s.feature}>
                <span className={`tag ${s.liftPts > 0 ? "t-good" : "t-warn"}`}>{s.liftPts > 0 ? "+" : ""}{s.liftPts} puan</span>
                <span>{FEATURE_TEXT(s.feature)}: %{Math.round(s.rate * 100)} ({s.n} kişi; ortalama %{Math.round(model.baseRate * 100)}).{s.liftPts > 0 ? " Bu kişiler öne alınıyor." : ""}</span>
              </li>
            ))}
            {!top.length && <li className="sub">Anlamlı bir fark için daha fazla sonuç gerekiyor (her grupta en az 8 kişi).</li>}
            <li className="sub">{model.total < 30 ? `Öğrenilen katkı sıralamaya 30 sonuçtan sonra girer (şu an ${model.total}).` : "Öğrenilen katkı yeni bulunan adayların sıralamasına ±15 puana kadar ekleniyor."} Bu bir istatistiktir, yapay zekâ modeli değildir; tüm temsilcilerin sonuçlarından beslenir.</li>
          </ul>
        </div>
      </div>
      <div className="card">
        <div className="card-h"><div><h2>Davet notu deneyi</h2><span className="sub">Aynı adımda birden fazla onaylı metin varsa kişilere dönüşümlü gider ve sonuç karşılaştırılır. Metinleri Mesajlar sekmesinden ekleyin.</span></div></div>
        <div className="card-b tight">
          <ul className="list">
            {ab.map((x, i) => (
              <li key={i}><div><b>{x.label}</b><div className="sub">{x.stats.map((s) => `${s.id}: ${s.success}/${s.sent}`).join(" · ")}</div><div>{x.cmp.message}</div></div></li>
            ))}
            {!ab.length && <li className="sub">Henüz karşılaştırılan varyant yok.</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}
