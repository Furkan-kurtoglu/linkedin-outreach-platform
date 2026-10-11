import "server-only";
import { capFirst, genitive, generateTemplates, stripEnd, type GeneratedSet, type WizardAnswers } from "@hfo/core";
import { prisma, type Prisma } from "@hfo/db";
import { notFound } from "next/navigation";
import type { Ctx } from "./context";

export async function loadCampaign(ctx: Ctx, id: string) {
  const agent = await prisma.agent.findFirst({
    where: { id, workspaceId: ctx.workspace.id },
    include: { steps: { orderBy: [{ branch: "asc" }, { order: "asc" }], include: { attachment: true } }, segments: true, linkedinAccount: true, targetAccounts: { orderBy: { createdAt: "asc" } } },
  });
  if (!agent) notFound();
  return agent;
}

export type Campaign = Awaited<ReturnType<typeof loadCampaign>>;

/** InMail metni: geri çekilen davetten sonra tek seferlik, kısa tanışma */
export function inmailBody(a: WizardAnswers): string {
  const who = `${genitive(a.companyName.trim())} ${a.senderRole.trim()}`;
  const link = a.link?.trim();
  return [
    `Merhaba {hitap}, birkaç hafta önce bağlantı isteği göndermiştim; ulaşmamış olabilir diye kısaca buradan yazıyorum. ${capFirst(stripEnd(a.productPhrase))} ${who}.`,
    link ? `Detaylar: ${link}` : "",
    "Uygun olursanız online bir görüşmede kısaca anlatmak isterim.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Varsayılan akış adımları ve sihirbazdan üretilen taslak metinler (onay bekler). */
export async function createStepsAndDrafts(tx: Prisma.TransactionClient, agentId: string, a: WizardAnswers, set: GeneratedSet) {
  const steps: { branch: "NEW_PERSON" | "CONNECTED"; order: number; type: Prisma.SequenceStepCreateManyInput["type"]; delayHours: number; body?: string }[] = [
    { branch: "NEW_PERSON", order: 1, type: "INVITE", delayHours: 0, body: set.invite },
    { branch: "NEW_PERSON", order: 2, type: "ACCEPTED_MESSAGE", delayHours: 0, body: set.message },
    { branch: "NEW_PERSON", order: 3, type: "FOLLOW_UP", delayHours: 4 * 24, body: set.followUp1 },
    { branch: "NEW_PERSON", order: 4, type: "FOLLOW_UP", delayHours: 6 * 24, body: set.followUp2 },
    { branch: "NEW_PERSON", order: 90, type: "OPEN_MESSAGE", delayHours: 0, body: set.connectedMessage },
    { branch: "NEW_PERSON", order: 91, type: "INMAIL", delayHours: 0, body: inmailBody(a) },
    { branch: "CONNECTED", order: 1, type: "CONNECTED_MESSAGE", delayHours: 0, body: set.connectedMessage },
    { branch: "CONNECTED", order: 2, type: "FOLLOW_UP", delayHours: 5 * 24, body: set.followUp1 },
  ];
  for (const s of steps) {
    const step = await tx.sequenceStep.create({ data: { agentId, branch: s.branch, order: s.order, type: s.type, delayHours: s.delayHours } });
    if (s.body) await tx.template.create({ data: { stepId: step.id, body: s.body, status: "DRAFT", version: 1 } });
  }
}

export { generateTemplates };
