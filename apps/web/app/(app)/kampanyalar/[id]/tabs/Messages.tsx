import { prisma } from "@hfo/db";
import Link from "next/link";
import { STEP_LABEL, toPersonalization } from "@/lib/convert";
import { addSlots } from "../actions";
import { MessageEditor, type EditorStep, type EditorTemplate } from "./MessageEditor";
import type { TabProps } from "./types";

export async function MessagesTab({ campaign: c, sp }: TabProps) {
  const ws = await prisma.workspace.findUniqueOrThrow({ where: { id: c.workspaceId } });
  const excluded = (await prisma.suppression.findMany({ where: { workspaceId: ws.id, kind: "company" }, select: { value: true } })).map((s) => s.value);
  const visible = c.steps.filter((s) => (s.type === "INMAIL" ? c.inmailEnabled : s.type === "OPEN_MESSAGE" ? c.openProfileEnabled : true));
  const templates = await prisma.template.findMany({ where: { step: { agentId: c.id } }, orderBy: { version: "desc" } });

  // Sürüm başına gönderim ve sonuç (davet notu: kabul, mesaj: cevap)
  const msgs = await prisma.message.findMany({ where: { templateId: { in: templates.map((t) => t.id) } }, select: { templateId: true, prospectId: true } });
  const aps = await prisma.agentProspect.findMany({ where: { agentId: c.id, prospectId: { in: [...new Set(msgs.map((m) => m.prospectId))] } }, select: { prospectId: true, connectedAt: true, repliedAt: true } });
  const apBy = new Map(aps.map((a) => [a.prospectId, a]));
  const stepType = new Map(c.steps.map((s) => [s.id, s.type]));
  const stats: Record<string, { sent: number; success: number }> = {};
  for (const m of msgs) {
    const t = templates.find((x) => x.id === m.templateId)!;
    const s = (stats[t.id] ??= { sent: 0, success: 0 });
    s.sent++;
    const ap = apBy.get(m.prospectId);
    if (stepType.get(t.stepId) === "INVITE" ? ap?.connectedAt : ap?.repliedAt) s.success++;
  }

  const steps: EditorStep[] = visible.map((s) => ({
    id: s.id,
    type: s.type,
    branch: s.branch,
    label: STEP_LABEL[s.type],
    sub: s.type === "INVITE" ? "Bağlantı daveti ile" : s.type === "ACCEPTED_MESSAGE" ? "Kabulden hemen sonra" : s.type === "CONNECTED_MESSAGE" ? "Davet yok" : s.type === "OPEN_MESSAGE" ? "Açık profile, davetsiz" : s.type === "INMAIL" ? "Geri çekilen davetten sonra" : `${Math.round(s.delayHours / 24)} gün sonra`,
    attachment: s.attachment?.name ?? null,
  }));
  const tpls: EditorTemplate[] = templates.map((t) => ({ id: t.id, stepId: t.stepId, segmentId: t.segmentId, lang: t.lang, variant: t.variant, version: t.version, status: t.status, body: t.body, sent: stats[t.id]?.sent ?? 0, success: stats[t.id]?.success ?? 0 }));
  const opts = toPersonalization(c);
  const approvedBodies = templates.filter((t) => t.status === "APPROVED");
  const missingFirst = c.firstLineEnabled && approvedBodies.some((t) => stepType.get(t.stepId) === "INVITE" && !t.body.includes("{ilk_cumle?}"));
  const missingCal = c.calendarEnabled && approvedBodies.some((t) => stepType.get(t.stepId) === "ACCEPTED_MESSAGE" && !t.body.includes("{takvim_linki?}"));

  return (
    <>
      {sp.eklendi && <p className="form-ok" style={{ marginBottom: 12 }}>{sp.eklendi} metne değişken eklendi; yeni sürümler taslak olarak bekliyor. Onaylayınca gönderimde kullanılır.</p>}
      {(missingFirst || missingCal) && (
        <div className="banner warning">
          <span className="dot warn" style={{ marginTop: 6 }} />
          <div className="txt">
            <b>{missingFirst ? "Kişiye özel ilk cümle açık ama davet notunda {ilk_cumle?} yok" : "Takvim linki açık ama kabulde mesajda {takvim_linki?} yok"}</b>
            <p>Değişken metne eklenmedikçe seçenek mesajları değiştirmez.</p>
          </div>
          <form action={addSlots}>
            <input type="hidden" name="id" value={c.id} />
            <input type="hidden" name="kind" value={missingFirst ? "firstLine" : "calendar"} />
            <button className="btn sm">Metinlere ekle</button>
          </form>
        </div>
      )}
      <MessageEditor
        campaignId={c.id}
        steps={steps}
        segments={c.segments.map((s) => ({ id: s.id, name: s.name }))}
        templates={tpls}
        initialStepId={sp.adim}
        premium={c.linkedinAccount.premium}
        rules={{ bannedPhrases: [...new Set([...ws.bannedPhrases, ...c.bannedPhrases])], excludedCompanies: excluded, requiredLink: c.requiredLink ?? undefined, premium: c.linkedinAccount.premium }}
        options={{ firstLine: opts.firstLine.enabled, calendar: opts.calendar.enabled, calendarUrl: opts.calendar.url, english: opts.english.enabled }}
        aiEnabled={!!process.env.GEMINI_API_KEY}
      />
      <p className="help" style={{ marginTop: 12 }}>
        Belge eklemek için <Link className="link" href={`/kampanyalar/${c.id}?sekme=akis`}>Akış</Link> sekmesini kullanın. Değişkenler: {"{hitap}"} kişinin adı soyadı, {"{kurum}"} kurumu.
      </p>
    </>
  );
}
