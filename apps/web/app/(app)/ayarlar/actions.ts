"use server";
import { EMAIL_EVENTS, MAX_NOTIFY_EMAILS, parseEmailList } from "@hfo/core";
import { prisma } from "@hfo/db";
import { revalidatePath } from "next/cache";
import { audit, requireContext } from "@/lib/context";
import { notifyWorkspace } from "@/lib/email";
import { applyCompanyExclusions } from "@/lib/institution-exclusions";

const lines = (v: FormDataEntryValue | null) =>
  [...new Set(String(v ?? "").split("\n").map((x) => x.trim()).filter(Boolean))];

export async function saveGeneral(form: FormData) {
  const ctx = await requireContext();
  const url = String(form.get("privacyNoticeUrl") ?? "").trim();
  const retention = Math.round(+String(form.get("retentionMonths")));
  await prisma.workspace.update({
    where: { id: ctx.workspace.id },
    data: {
      name: String(form.get("name") ?? "").trim() || ctx.workspace.name,
      privacyNoticeUrl: /^https:\/\/\S+$/.test(url) ? url : null,
      retentionMonths: [6, 12, 24].includes(retention) ? retention : 12,
      bannedPhrases: lines(form.get("bannedPhrases")),
      quietDays: lines(form.get("quietDays")).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)),
    },
  });
  await audit(ctx, "settings.general");
  revalidatePath("/ayarlar");
}

export async function saveExcluded(form: FormData) {
  const ctx = await requireContext();
  const wanted = lines(form.get("companies"));
  const current = await prisma.suppression.findMany({ where: { workspaceId: ctx.workspace.id, kind: "company" } });
  const remove = current.filter((c) => !wanted.includes(c.value)).map((c) => c.id);
  await prisma.suppression.deleteMany({ where: { id: { in: remove } } });
  for (const v of wanted.filter((w) => !current.some((c) => c.value === w))) {
    await prisma.suppression.create({ data: { workspaceId: ctx.workspace.id, kind: "company", value: v, reason: "Ayarlar'dan eklendi." } });
  }
  // Yeni hariç tutulan kurumlardaki sıradaki kişiler atlanır
  if (wanted.length) {
    await prisma.agentProspect.updateMany({
      where: { agent: { workspaceId: ctx.workspace.id }, stage: { in: ["QUEUED", "NEEDS_REVIEW"] }, prospect: { company: { in: wanted } } },
      data: { stage: "SKIPPED", skipReason: "Kurum hariç tutuldu." },
    });
  }
  await applyCompanyExclusions(ctx.workspace.id);
  await audit(ctx, "settings.excluded", { count: wanted.length });
  revalidatePath("/ayarlar");
}

export async function saveNotifications(form: FormData) {
  const ctx = await requireContext();
  const { emails, invalid } = parseEmailList(String(form.get("notifyEmails") ?? ""));
  const events = EMAIL_EVENTS.map(([k]) => k).filter((k) => form.get(`ev-${k}`) === "on");
  await prisma.workspace.update({
    where: { id: ctx.workspace.id },
    data: { notifyEmails: emails.slice(0, MAX_NOTIFY_EMAILS), notifyEvents: events },
  });
  await audit(ctx, "settings.notifications", { emails: emails.slice(0, MAX_NOTIFY_EMAILS), invalid, events });
  revalidatePath("/ayarlar");
}

export async function testNotification() {
  const ctx = await requireContext();
  const status = await notifyWorkspace(
    ctx.workspace.id,
    "test",
    {
      workspace: ctx.workspace.name,
      campaign: "Deneme kampanyası",
      personName: "Örnek Kişi",
      personTitle: "Genel Müdür",
      personCompany: "Örnek Kurum",
      linkedinUrl: "https://www.linkedin.com/in/ornek",
      message: "Bu bir deneme bildirimidir.",
    },
    { force: true },
  );
  await audit(ctx, "settings.notifications.test", { status });
  revalidatePath("/ayarlar");
}

export async function inviteMember(form: FormData) {
  const ctx = await requireContext();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return;
  await prisma.workspaceInvite.upsert({
    where: { workspaceId_email: { workspaceId: ctx.workspace.id, email } },
    update: {},
    create: { workspaceId: ctx.workspace.id, email, invitedBy: ctx.user.id },
  });
  await audit(ctx, "team.invite", { email });
  revalidatePath("/ayarlar");
}

export async function removeInvite(form: FormData) {
  const ctx = await requireContext();
  await prisma.workspaceInvite.deleteMany({ where: { id: String(form.get("id")), workspaceId: ctx.workspace.id, acceptedAt: null } });
  revalidatePath("/ayarlar");
}
