import { toCsv } from "@hfo/core";
import { prisma } from "@hfo/db";
import { STAGE_LABEL } from "@/lib/convert";
import { requireContext } from "@/lib/context";
import { filterWhere, personRows } from "@/lib/people";

/** Kampanyanın kişi listesi; Excel'de Türkçe karakterlerle doğru açılır. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext();
  const { id } = await params;
  const agent = await prisma.agent.findFirst({ where: { id, workspaceId: ctx.workspace.id } });
  if (!agent) return new Response("Bulunamadı", { status: 404 });
  const url = new URL(req.url);
  const filtre = url.searchParams.get("filtre") ?? undefined;
  const rows = await personRows(filterWhere(agent.id, filtre, ctx.workspace.id, url.searchParams.get("ara") ?? undefined), 10_000);
  const csv = toCsv(
    [
      { key: "fullName", title: "Ad Soyad" },
      { key: "title", title: "Unvan" },
      { key: "company", title: "Kurum" },
      { key: "segment", title: "Segment" },
      { key: "degree", title: "Derece" },
      { key: "score", title: "Puan" },
      { key: "stage", title: "Durum" },
      { key: "next", title: "Sıradaki adım" },
    ],
    rows.map((r) => ({ ...r, stage: STAGE_LABEL[r.stage]?.text ?? r.stage })) as unknown as Record<string, unknown>[],
  );
  const name = `${agent.name.replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase()}-kisiler.csv`;
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="kisiler.csv"; filename*=UTF-8''${encodeURIComponent(name)}`,
    },
  });
}
