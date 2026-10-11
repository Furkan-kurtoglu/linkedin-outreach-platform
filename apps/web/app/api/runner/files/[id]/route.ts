import { prisma } from "@hfo/db";
import { runnerAccount, unauthorized } from "@/lib/runner-auth";
import { FILES_BUCKET, supabaseAdmin } from "@/lib/supabase";

/** Mesaja eklenecek belge için 5 dakikalık indirme linki (yalnızca kendi çalışma alanından). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const account = await runnerAccount(req);
  if (!account) return unauthorized();
  const { id } = await params;
  const file = await prisma.fileAsset.findFirst({ where: { id, workspaceId: account.workspaceId } });
  if (!file) return Response.json({ error: "Belge bulunamadı." }, { status: 404 });
  const { data, error } = await supabaseAdmin().storage.from(FILES_BUCKET).createSignedUrl(file.storagePath, 300);
  if (error || !data) return Response.json({ error: "Belge linki oluşturulamadı." }, { status: 500 });
  return Response.json({ url: data.signedUrl, name: file.name, sizeBytes: file.sizeBytes });
}
