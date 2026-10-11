import { prisma } from "@hfo/db";
import { NextResponse } from "next/server";
import { requireContext } from "@/lib/context";
import { FILES_BUCKET, supabaseAdmin } from "@/lib/supabase";

/** Belgeyi önizleme: kısa süreli imzalı linke yönlendirir. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext();
  const { id } = await params;
  const f = await prisma.fileAsset.findFirst({ where: { id, workspaceId: ctx.workspace.id } });
  if (!f) return new Response("Bulunamadı", { status: 404 });
  const { data } = await supabaseAdmin().storage.from(FILES_BUCKET).createSignedUrl(f.storagePath, 120);
  if (!data) return new Response("Link oluşturulamadı", { status: 500 });
  return NextResponse.redirect(data.signedUrl);
}
