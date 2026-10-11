import "server-only";
import { prisma, Prisma, type Workspace, type Role } from "@hfo/db";
import { redirect } from "next/navigation";
import { cache } from "react";
import { env } from "./env";
import { supabaseServer } from "./supabase";

export interface Ctx {
  user: { id: string; email: string; name: string | null };
  workspace: Workspace;
  role: Role;
}

/** E-posta kayıt olabilir mi: izin listesinde ya da bir ekibe davet edilmiş olmalı. */
export async function emailAllowed(email: string): Promise<boolean> {
  const list = env.allowedEmails();
  const e = email.trim().toLowerCase();
  if (!list.length || list.includes(e)) return true;
  const invite = await prisma.workspaceInvite.findFirst({ where: { email: e, acceptedAt: null } });
  return !!invite;
}

/**
 * Giriş yapmış kullanıcı ve çalışma alanı. İlk girişte kullanıcı kaydı açılır; davet varsa
 * davet eden ekibe katılır, yoksa kendi çalışma alanı oluşturulur.
 */
export const requireContext = cache(async (): Promise<Ctx> => {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) redirect("/giris");
  const email = user.email.toLowerCase();

  const dbUser = await prisma.user.upsert({
    where: { id: user.id },
    update: {},
    create: { id: user.id, email, name: (user.user_metadata?.name as string | undefined) ?? null },
  });

  let m = await prisma.membership.findFirst({ where: { userId: user.id }, include: { workspace: true } });
  if (!m) {
    if (!(await emailAllowed(email))) {
      await supabase.auth.signOut();
      redirect("/giris?hata=izin");
    }
    const invite = await prisma.workspaceInvite.findFirst({ where: { email, acceptedAt: null } });
    if (invite) {
      await prisma.$transaction([
        prisma.membership.create({ data: { workspaceId: invite.workspaceId, userId: user.id, role: "MEMBER" } }),
        prisma.workspaceInvite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } }),
      ]);
    } else {
      const ws = await prisma.workspace.create({ data: { name: dbUser.name ? `${dbUser.name} çalışma alanı` : "Çalışma alanım" } });
      await prisma.membership.create({ data: { workspaceId: ws.id, userId: user.id, role: "OWNER" } });
    }
    m = await prisma.membership.findFirst({ where: { userId: user.id }, include: { workspace: true } });
    if (!m) throw new Error("Çalışma alanı oluşturulamadı.");
  }
  return { user: { id: user.id, email, name: dbUser.name }, workspace: m.workspace, role: m.role };
});

/** İşlem kaydı (geri alma verisiyle birlikte). */
export async function audit(ctx: Ctx, action: string, details?: object, undoData?: object) {
  return prisma.auditLog.create({
    data: {
      workspaceId: ctx.workspace.id,
      actor: ctx.user.id,
      action,
      details: (details ?? undefined) as Prisma.InputJsonValue | undefined,
      undoData: (undoData ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}
