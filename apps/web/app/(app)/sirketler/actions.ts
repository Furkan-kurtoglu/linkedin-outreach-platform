"use server";
import { prisma } from "@hfo/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { audit, requireContext } from "@/lib/context";

const clean = (v: FormDataEntryValue | null) => String(v ?? "").trim();

function parseWebsite(raw: string): { ok: true; value: string | null } | { ok: false } {
  if (!raw) return { ok: true, value: null };
  const v = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const u = new URL(v);
    if (!u.hostname.includes(".")) return { ok: false };
    return { ok: true, value: u.toString() };
  } catch {
    return { ok: false };
  }
}

export interface CompanyState {
  error?: string;
}

export async function createCompany(_: CompanyState, form: FormData): Promise<CompanyState> {
  const ctx = await requireContext();
  const name = clean(form.get("name"));
  if (name.length < 2) return { error: "Şirket adı en az 2 karakter olmalı." };
  if (name.length > 80) return { error: "Şirket adı 80 karakteri geçemez." };
  const web = parseWebsite(clean(form.get("website")));
  if (!web.ok) return { error: "Web sitesi adresi geçersiz." };
  const exists = await prisma.company.findUnique({ where: { workspaceId_name: { workspaceId: ctx.workspace.id, name } } });
  if (exists) return { error: "Bu adla bir şirket zaten var." };
  const c = await prisma.company.create({
    data: { workspaceId: ctx.workspace.id, name, website: web.value, description: clean(form.get("description")).slice(0, 400) || null },
  });
  await audit(ctx, "company.create", { companyId: c.id, name });
  revalidatePath("/sirketler");
  redirect("/sirketler?eklendi=1");
}

export async function updateCompany(_: CompanyState, form: FormData): Promise<CompanyState> {
  const ctx = await requireContext();
  const id = clean(form.get("id"));
  const company = await prisma.company.findFirst({ where: { id, workspaceId: ctx.workspace.id } });
  if (!company) return { error: "Şirket bulunamadı." };
  const name = clean(form.get("name"));
  if (name.length < 2 || name.length > 80) return { error: "Şirket adı 2–80 karakter olmalı." };
  const web = parseWebsite(clean(form.get("website")));
  if (!web.ok) return { error: "Web sitesi adresi geçersiz." };
  const clash = await prisma.company.findFirst({ where: { workspaceId: ctx.workspace.id, name, NOT: { id } } });
  if (clash) return { error: "Bu adla başka bir şirket var." };
  await prisma.company.update({ where: { id }, data: { name, website: web.value, description: clean(form.get("description")).slice(0, 400) || null } });
  await audit(ctx, "company.update", { companyId: id, name });
  revalidatePath("/sirketler");
  redirect("/sirketler?kaydedildi=1");
}

export async function deleteCompany(form: FormData) {
  const ctx = await requireContext();
  const id = clean(form.get("id"));
  const company = await prisma.company.findFirst({ where: { id, workspaceId: ctx.workspace.id }, include: { _count: { select: { agents: true } } } });
  if (!company) redirect("/sirketler");
  if (company._count.agents > 0) redirect("/sirketler?uyari=dolu");
  await prisma.company.delete({ where: { id } });
  await audit(ctx, "company.delete", { name: company.name });
  revalidatePath("/sirketler");
  redirect("/sirketler?silindi=1");
}
