"use server";
import { ATTACHMENT_RULES } from "@hfo/core";
import { prisma } from "@hfo/db";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { audit, requireContext } from "@/lib/context";
import { FILES_BUCKET, supabaseAdmin } from "@/lib/supabase";

export interface UploadState {
  ok?: string;
  error?: string;
}

export async function uploadFile(_: UploadState, form: FormData): Promise<UploadState> {
  const ctx = await requireContext();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Bir PDF seçin." };
  if (file.size > ATTACHMENT_RULES.maxBytes) return { error: `Belge ${Math.round(ATTACHMENT_RULES.maxBytes / 1_048_576)} MB'den büyük olamaz.` };
  const buf = Buffer.from(await file.arrayBuffer());
  // Uzantıya değil içeriğe bakılır: PDF dosyaları "%PDF-" ile başlar
  if (buf.subarray(0, 5).toString("latin1") !== "%PDF-") return { error: "Yalnızca PDF yüklenebilir." };
  const name = file.name.replace(/[\\/:*?"<>|]+/g, "-").slice(0, 120) || "belge.pdf";
  const path = `${ctx.workspace.id}/${randomUUID()}.pdf`;
  const { error } = await supabaseAdmin().storage.from(FILES_BUCKET).upload(path, buf, { contentType: "application/pdf", upsert: false });
  if (error) return { error: "Belge yüklenemedi. Supabase'de \"belgeler\" adlı depolama alanının oluşturulduğundan emin olun." };
  await prisma.fileAsset.create({ data: { workspaceId: ctx.workspace.id, name, mimeType: "application/pdf", sizeBytes: file.size, storagePath: path } });
  await audit(ctx, "file.upload", { name });
  revalidatePath("/belgeler");
  return { ok: `${name} yüklendi. Kampanyanın Akış sekmesinden mesaja ekleyebilirsiniz.` };
}

export async function deleteFile(form: FormData) {
  const ctx = await requireContext();
  const f = await prisma.fileAsset.findFirst({ where: { id: String(form.get("id")), workspaceId: ctx.workspace.id }, include: { steps: true } });
  if (!f) return;
  await prisma.sequenceStep.updateMany({ where: { attachmentId: f.id }, data: { attachmentId: null } });
  await supabaseAdmin().storage.from(FILES_BUCKET).remove([f.storagePath]);
  await prisma.fileAsset.delete({ where: { id: f.id } });
  await audit(ctx, "file.delete", { name: f.name });
  revalidatePath("/belgeler");
}
