"use server";
import { checkMessage, nextOpenSlot, type JobPayload } from "@hfo/core";
import { prisma, Prisma } from "@hfo/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { audit, requireContext, type Ctx } from "@/lib/context";
import { toRules, toScheduleConfig } from "@/lib/convert";
import { planAccount } from "@/lib/planner";

export interface QueueState {
  error?: string;
}

async function approveOne(ctx: Ctx, jobId: string, editedText?: string): Promise<string | null> {
  const job = await prisma.job.findFirst({ where: { id: jobId, status: "AWAITING_APPROVAL", linkedinAccount: { workspaceId: ctx.workspace.id } }, include: { linkedinAccount: true } });
  if (!job) return "Bu iş artık onay beklemiyor.";
  const payload = job.payload as unknown as JobPayload;
  const ap = job.agentProspectId ? await prisma.agentProspect.findUnique({ where: { id: job.agentProspectId }, include: { agent: true, prospect: true } }) : null;
  const text = editedText?.replace(/\r\n/g, "\n").trim();

  let next: JobPayload = payload;
  if (ap && (payload.type === "SEND_INVITE" || payload.type === "SEND_MESSAGE" || payload.type === "SEND_INMAIL")) {
    const excluded = (await prisma.suppression.findMany({ where: { workspaceId: ctx.workspace.id, kind: "company" }, select: { value: true } })).map((s) => s.value);
    const rules = toRules(ap.agent, ctx.workspace, job.linkedinAccount, excluded);
    const step = payload.stepId ? await prisma.sequenceStep.findUnique({ where: { id: payload.stepId } }) : null;
    const body = text ?? (payload.type === "SEND_INVITE" ? (payload.note ?? "") : payload.text);
    if (/\{[a-z_]+\??\}/.test(body)) return "Metinde doldurulmamış değişken var.";
    if (body || payload.type !== "SEND_INVITE") {
      const issues = checkMessage(body, payload.type === "SEND_INVITE" ? "invite_note" : "message", step?.type === "FOLLOW_UP" || payload.type === "SEND_INMAIL" ? { ...rules, requiredLink: undefined } : rules);
      if (issues.length) return issues.map((i) => i.message).join(" ");
    }
    next = payload.type === "SEND_INVITE" ? { ...payload, note: body || undefined } : { ...payload, text: body };
  }
  const now = new Date();
  const runAfter = job.runAfter > now ? job.runAfter : (nextOpenSlot(now, toScheduleConfig(job.linkedinAccount), ctx.workspace.quietDays) ?? now);
  await prisma.job.update({
    where: { id: job.id },
    data: { status: "PENDING", payload: next as unknown as Prisma.InputJsonValue, draftText: text ?? job.draftText, runAfter, approvedAt: now, approvedBy: ctx.user.id, lastError: null },
  });
  return null;
}

export async function approveJob(_: QueueState, form: FormData): Promise<QueueState> {
  const ctx = await requireContext();
  const id = String(form.get("jobId"));
  const err = await approveOne(ctx, id, form.has("text") ? String(form.get("text")) : undefined);
  if (err) return { error: err };
  await audit(ctx, "queue.approve", { jobId: id });
  revalidatePath("/", "layout");
  return {};
}

export async function skipJob(form: FormData) {
  const ctx = await requireContext();
  const job = await prisma.job.findFirst({ where: { id: String(form.get("jobId")), status: "AWAITING_APPROVAL", linkedinAccount: { workspaceId: ctx.workspace.id } } });
  if (job) {
    await prisma.job.update({ where: { id: job.id }, data: { status: "CANCELLED", lastError: "Elle atlandı." } });
    if (job.agentProspectId) await prisma.agentProspect.update({ where: { id: job.agentProspectId }, data: { stage: "SKIPPED", skipReason: "Onay kuyruğunda atlandı." } });
    await audit(ctx, "queue.skip", { jobId: job.id });
  }
  revalidatePath("/", "layout");
}

export async function approveAll() {
  const ctx = await requireContext();
  const jobs = await prisma.job.findMany({ where: { status: "AWAITING_APPROVAL", lastError: null, linkedinAccount: { workspaceId: ctx.workspace.id } }, select: { id: true }, take: 200 });
  let n = 0;
  for (const j of jobs) if (!(await approveOne(ctx, j.id))) n++;
  await audit(ctx, "queue.approveAll", { count: n });
  revalidatePath("/", "layout");
}

/** Seçilen taslakları toplu onaylar; kural hatası olanlar atlanır ve sayılır. */
export async function approveSelected(form: FormData) {
  const ctx = await requireContext();
  const ids = form.getAll("ids").map(String).slice(0, 300);
  let n = 0;
  let failed = 0;
  for (const id of ids) {
    if (await approveOne(ctx, id)) failed++;
    else n++;
  }
  await audit(ctx, "queue.approveSelected", { count: n, failed });
  revalidatePath("/", "layout");
  redirect(`/onay?onaylandi=${n}&hatali=${failed}`);
}

/** Onaylı metinlerden taslakları hemen hazırlar (çalışanın açılmasını beklemeden). */
export async function prepareDrafts() {
  const ctx = await requireContext();
  const accounts = await prisma.linkedinAccount.findMany({ where: { workspaceId: ctx.workspace.id, status: { in: ["CONNECTED", "NEEDS_LOGIN"] } }, select: { id: true } });
  for (const a of accounts) await planAccount(a.id, { force: true });
  revalidatePath("/", "layout");
  redirect("/onay?hazirlandi=1");
}
