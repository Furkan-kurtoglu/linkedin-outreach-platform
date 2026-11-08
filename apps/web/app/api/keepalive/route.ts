import { prisma } from "@hfo/db";

/**
 * Supabase ücretsiz planı, bir hafta boyunca yeterli veritabanı hareketi olmazsa
 * projeyi duraklatır; proje duraklayınca Vercel yayını "Resource provisioning failed"
 * ile düşer. Bu uç nokta günde bir kez gerçek bir sorgu atarak projeyi etkin tutar.
 *
 * Vercel Cron tarafından çağrılır (bkz. vercel.json). `CRON_SECRET` tanımlıysa
 * yalnızca Vercel'in gönderdiği `Authorization: Bearer <CRON_SECRET>` başlığını kabul eder.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Yetkisiz.", { status: 401 });
  }

  // Supabase "etkinlik" olarak gerçek sorguları sayar; birkaç sorgu gönderiyoruz.
  await prisma.$queryRaw`SELECT 1`;
  const workspaces = await prisma.workspace.count();
  await prisma.$queryRaw`SELECT now()`;
  return Response.json({ ok: true, at: new Date().toISOString(), workspaces });
}
