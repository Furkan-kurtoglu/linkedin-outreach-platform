"use server";
import { prisma, type OpportunityStage } from "@hfo/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { audit, requireContext } from "@/lib/context";
import { applyBulk } from "@/lib/bulk";
import { urlHash } from "@/lib/results";

const STAGES: OpportunityStage[] = ["NEW", "MEETING_SET", "PROPOSAL", "WON", "LOST"];

async function ownProspect(id: string) {
  const ctx = await requireContext();
  const p = await prisma.prospect.findFirst({ where: { id, workspaceId: ctx.workspace.id } });
  if (!p) throw new Error("Kişi bulunamadı.");
  return { ctx, p };
}

export async function addNote(form: FormData) {
  const { ctx, p } = await ownProspect(String(form.get("prospectId")));
  const body = String(form.get("body") ?? "").trim().slice(0, 4000);
  if (body) await prisma.note.create({ data: { workspaceId: ctx.workspace.id, prospectId: p.id, authorId: ctx.user.id, body } });
  revalidatePath(`/kisiler/${p.id}`);
}

export async function saveOpportunity(form: FormData) {
  const { ctx, p } = await ownProspect(String(form.get("prospectId")));
  const stage = String(form.get("stage")) as OpportunityStage;
  const date = String(form.get("nextStepAt") ?? "");
  const data = {
    stage: STAGES.includes(stage) ? stage : "NEW",
    nextStep: String(form.get("nextStep") ?? "").trim() || null,
    nextStepAt: /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T09:00:00+03:00`) : null,
    lostReason: String(form.get("lostReason") ?? "").trim() || null,
  };
  const existing = await prisma.opportunity.findFirst({ where: { prospectId: p.id } });
  if (existing) await prisma.opportunity.update({ where: { id: existing.id }, data });
  else await prisma.opportunity.create({ data: { ...data, workspaceId: ctx.workspace.id, prospectId: p.id } });
  await audit(ctx, "opportunity.save", { prospectId: p.id, stage: data.stage });
  revalidatePath(`/kisiler/${p.id}`);
  revalidatePath("/firsatlar");
}

export async function personAction(form: FormData) {
  const { ctx, p } = await ownProspect(String(form.get("prospectId")));
  const aps = await prisma.agentProspect.findMany({ where: { prospectId: p.id }, select: { id: true } });
  await applyBulk(ctx, String(form.get("op")), aps.map((a) => a.id));
  revalidatePath(`/kisiler/${p.id}`);
  revalidatePath("/", "layout");
}

/** KVKK silme talebi: kişi ve yazışmaları silinir; tekrar bulunmaması için yalnızca profil linkinin özeti kalır. */
export async function erasePerson(form: FormData) {
  const { ctx, p } = await ownProspect(String(form.get("prospectId")));
  const apIds = (await prisma.agentProspect.findMany({ where: { prospectId: p.id }, select: { id: true } })).map((a) => a.id);
  await prisma.$transaction([
    prisma.suppression.upsert({
      where: { workspaceId_kind_value: { workspaceId: ctx.workspace.id, kind: "person", value: urlHash(p.linkedinUrl) } },
      update: { reason: "KVKK silme talebi" },
      create: { workspaceId: ctx.workspace.id, kind: "person", value: urlHash(p.linkedinUrl), reason: "KVKK silme talebi" },
    }),
    prisma.job.updateMany({ where: { agentProspectId: { in: apIds } }, data: { status: "CANCELLED", payload: {}, draftText: null } }),
    prisma.prospect.delete({ where: { id: p.id } }),
  ]);
  await audit(ctx, "person.erase", {});
  redirect("/kampanyalar");
}
