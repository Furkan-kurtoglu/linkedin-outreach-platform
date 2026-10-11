"use server";
import { checkMessage, nextOpenSlot, PRIORITY, type JobPayload } from "@hfo/core";
import { prisma, Prisma, type ReplyLabel } from "@hfo/db";
import { revalidatePath } from "next/cache";
import { audit, requireContext } from "@/lib/context";
import { toScheduleConfig } from "@/lib/convert";
import { urlHash } from "@/lib/results";

const LABELS: ReplyLabel[] = ["INTERESTED", "LATER", "NOT_INTERESTED", "WRONG_PERSON", "OTHER"];

export interface ReplyState {
  ok?: string;
  error?: string;
}

/** Yanıt gönderim sırasına alınır; yerel çalışan birkaç dakika içinde gönderir. */
export async function sendReply(_: ReplyState, form: FormData): Promise<ReplyState> {
  const ctx = await requireContext();
  const text = String(form.get("text") ?? "").replace(/\r\n/g, "\n").trim();
  if (!text) return { error: "Yanıt boş." };
  const ap = await prisma.agentProspect.findFirst({
    where: { prospectId: String(form.get("prospectId")), agent: { workspaceId: ctx.workspace.id } },
    orderBy: { createdAt: "desc" },
    include: { agent: { include: { linkedinAccount: true } }, prospect: true },
  });
  if (!ap) return { error: "Kişi bulunamadı." };
  const excluded = (await prisma.suppression.findMany({ where: { workspaceId: ctx.workspace.id, kind: "company" }, select: { value: true } })).map((s) => s.value);
  const issues = checkMessage(text, "message", { bannedPhrases: ctx.workspace.bannedPhrases, excludedCompanies: excluded, premium: ap.agent.linkedinAccount.premium });
  if (issues.length) return { error: issues.map((i) => i.message).join(" ") };
  const acc = ap.agent.linkedinAccount;
  const now = new Date();
  const payload: JobPayload = { type: "SEND_MESSAGE", profileUrl: ap.prospect.linkedinUrl, text };
  await prisma.job.create({
    data: {
      linkedinAccountId: acc.id,
      type: "SEND_MESSAGE",
      priority: PRIORITY.reply,
      runAfter: nextOpenSlot(now, toScheduleConfig(acc), ctx.workspace.quietDays) ?? now,
      payload: payload as unknown as Prisma.InputJsonValue,
      draftText: text,
      agentProspectId: ap.id,
      approvedAt: now,
      approvedBy: ctx.user.id,
    },
  });
  await audit(ctx, "inbox.reply", { prospectId: ap.prospectId });
  revalidatePath("/gelen");
  return { ok: "Yanıt gönderim sırasına alındı; gönderim saatleri içinde gider." };
}

export async function setLabel(form: FormData) {
  const ctx = await requireContext();
  const label = String(form.get("label")) as ReplyLabel;
  if (!LABELS.includes(label)) return;
  const prospectId = String(form.get("prospectId"));
  const prospect = await prisma.prospect.findFirst({ where: { id: prospectId, workspaceId: ctx.workspace.id } });
  if (!prospect) return;
  await prisma.agentProspect.updateMany({ where: { prospectId, stage: "REPLIED" }, data: { replyLabel: label } });
  if (label === "NOT_INTERESTED") {
    const value = urlHash(prospect.linkedinUrl);
    await prisma.suppression.upsert({ where: { workspaceId_kind_value: { workspaceId: ctx.workspace.id, kind: "person", value } }, update: {}, create: { workspaceId: ctx.workspace.id, kind: "person", value, reason: "İlgilenmediğini yazdı." } });
  }
  if (label === "INTERESTED" && !(await prisma.opportunity.findFirst({ where: { prospectId } }))) {
    await prisma.opportunity.create({ data: { workspaceId: ctx.workspace.id, prospectId } });
  }
  revalidatePath("/gelen");
}

export async function toOpportunity(form: FormData) {
  const ctx = await requireContext();
  const prospectId = String(form.get("prospectId"));
  const p = await prisma.prospect.findFirst({ where: { id: prospectId, workspaceId: ctx.workspace.id } });
  if (p && !(await prisma.opportunity.findFirst({ where: { prospectId } }))) {
    await prisma.opportunity.create({ data: { workspaceId: ctx.workspace.id, prospectId } });
  }
  revalidatePath("/gelen");
  revalidatePath("/firsatlar");
}
