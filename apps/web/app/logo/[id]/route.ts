import { prisma } from "@hfo/db";
import { requireContext } from "@/lib/context";

/** Şirket logosunu (veritabanında data URI olarak durur) görüntü olarak sunar; yalnızca kendi çalışma alanındaki şirketler. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext();
  const { id } = await params;
  const c = await prisma.company.findFirst({ where: { id, workspaceId: ctx.workspace.id }, select: { logo: true } });
  const m = c?.logo?.match(/^data:(image\/(?:png|jpeg|webp|svg\+xml));base64,(.+)$/);
  if (!m) return new Response(null, { status: 404 });
  return new Response(Buffer.from(m[2]!, "base64"), {
    headers: {
      "content-type": m[1]!,
      "cache-control": "private, max-age=604800",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'",
      "x-content-type-options": "nosniff",
    },
  });
}
