"use server";
import { SAFE_LIMITS, validateSchedule, type DaySchedule, type ScheduleConfig } from "@hfo/core";
import { prisma, Prisma } from "@hfo/db";
import { revalidatePath } from "next/cache";
import { audit, requireContext } from "@/lib/context";
import { toScheduleConfig } from "@/lib/convert";
import { newRunnerToken } from "@/lib/runner-auth";

async function ownAccount(id: string) {
  const ctx = await requireContext();
  const acc = await prisma.linkedinAccount.findFirst({ where: { id, workspaceId: ctx.workspace.id } });
  if (!acc) throw new Error("Hesap bulunamadı.");
  return { ctx, acc };
}

export async function createAccount(form: FormData) {
  const ctx = await requireContext();
  const displayName = String(form.get("displayName") ?? "").trim() || ctx.user.name || "LinkedIn hesabım";
  const premium = form.get("premium") === "on";
  const days: DaySchedule[] = Array.from({ length: 7 }, (_, d) => ({
    enabled: true,
    windows: d === 0 || d === 6 ? [{ startMin: 600, endMin: 840 }] : [{ startMin: 540, endMin: 720 }, { startMin: 810, endMin: 1110 }],
  }));
  await prisma.linkedinAccount.create({
    data: { workspaceId: ctx.workspace.id, displayName, premium, weeklyInvites: 180, schedule: { days, minGapMin: 4, maxGapMin: 20, mode: "auto" } as unknown as Prisma.InputJsonValue },
  });
  await audit(ctx, "account.create", { displayName });
  revalidatePath("/hesaplar");
}

export interface TokenState {
  token?: string;
  error?: string;
}

/** Yeni bağlantı anahtarı üretir; eskisi geçersiz olur. Anahtar yalnızca bu yanıtta görünür. */
export async function rotateToken(_: TokenState, form: FormData): Promise<TokenState> {
  const { ctx, acc } = await ownAccount(String(form.get("id")));
  const { token, hash } = newRunnerToken();
  await prisma.linkedinAccount.update({ where: { id: acc.id }, data: { runnerTokenHash: hash } });
  await audit(ctx, "account.token", { accountId: acc.id });
  revalidatePath("/", "layout");
  return { token };
}

export interface ScheduleState {
  ok?: boolean;
  errors?: string[];
}

export async function saveSchedule(_: ScheduleState, form: FormData): Promise<ScheduleState> {
  const { ctx, acc } = await ownAccount(String(form.get("id")));
  let parsed: { mode: "auto" | "manual"; weekly: number; days: DaySchedule[]; minGapMin: number; maxGapMin: number };
  try {
    parsed = JSON.parse(String(form.get("schedule")));
  } catch {
    return { errors: ["Zamanlama okunamadı."] };
  }
  if (!Array.isArray(parsed.days) || parsed.days.length !== 7) return { errors: ["Yedi günün ayarı gerekli."] };
  const days: DaySchedule[] = parsed.days.map((d) => ({
    enabled: !!d.enabled,
    windows: (d.windows ?? []).map((w) => ({ startMin: Math.round(+w.startMin), endMin: Math.round(+w.endMin) })),
    invites: d.invites == null || Number.isNaN(+d.invites) ? undefined : Math.max(0, Math.round(+d.invites)),
  }));
  const weekly =
    parsed.mode === "manual" ? days.reduce((t, d) => t + (d.enabled ? (d.invites ?? 0) : 0), 0) : Math.max(0, Math.round(+parsed.weekly || 0));
  const config: ScheduleConfig = { ...toScheduleConfig(acc), weeklyInvites: weekly, days, minGapMin: 4, maxGapMin: 20 };
  const errors = validateSchedule(config).filter((i) => i.level === "error").map((i) => i.message);
  if (weekly > SAFE_LIMITS.weeklyMax) errors.push(`Haftalık toplam ${SAFE_LIMITS.weeklyMax}'ü geçemez.`);
  if (errors.length) return { errors };
  await prisma.linkedinAccount.update({
    where: { id: acc.id },
    data: { weeklyInvites: weekly, schedule: { days, minGapMin: 4, maxGapMin: 20, mode: parsed.mode } as unknown as Prisma.InputJsonValue },
  });
  // Planlanmış ama henüz gönderilmemiş davetler yeni saatlere göre yeniden planlanır
  await prisma.job.deleteMany({ where: { linkedinAccountId: acc.id, type: { in: ["SEND_INVITE", "VISIT_PROFILE"] }, status: "PENDING" } });
  await prisma.linkedinAccount.update({ where: { id: acc.id }, data: { lastPlannedAt: null } });
  await audit(ctx, "account.schedule", { weekly, mode: parsed.mode });
  revalidatePath("/hesaplar");
  return { ok: true };
}

export async function saveLimits(form: FormData) {
  const { ctx, acc } = await ownAccount(String(form.get("id")));
  const dailyMessageLimit = Math.min(150, Math.max(10, Math.round(+String(form.get("dailyMessageLimit")) || 80)));
  const premium = form.get("premium") === "on";
  const warmupEnabled = form.get("warmup") === "on";
  const displayName = String(form.get("displayName") ?? "").trim() || acc.displayName;
  await prisma.linkedinAccount.update({ where: { id: acc.id }, data: { dailyMessageLimit, premium, warmupEnabled, displayName } });
  await audit(ctx, "account.limits", { dailyMessageLimit, premium, warmupEnabled });
  revalidatePath("/hesaplar");
}

export async function togglePause(form: FormData) {
  const { ctx, acc } = await ownAccount(String(form.get("id")));
  const pause = acc.status !== "PAUSED";
  await prisma.linkedinAccount.update({
    where: { id: acc.id },
    data: pause
      ? { status: "PAUSED", pausedUntil: new Date(Date.now() + 24 * 3_600_000), lastWarning: "Elle duraklatıldı." }
      : { status: acc.runnerLastSeenAt ? "CONNECTED" : "NEEDS_LOGIN", pausedUntil: null, lastWarning: null },
  });
  await audit(ctx, pause ? "account.pause" : "account.resume", { accountId: acc.id });
  revalidatePath("/", "layout");
}
