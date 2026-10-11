import { prisma } from "@hfo/db";
import type { Metadata } from "next";
import Link from "next/link";
import { OPP_STAGES } from "@/lib/convert";
import { requireContext } from "@/lib/context";

export const metadata: Metadata = { title: "Fırsatlar" };

const fmtDate = (d: Date) => d.toLocaleDateString("tr-TR", { day: "numeric", month: "short", timeZone: "Europe/Istanbul" });

export default async function Page() {
  const ctx = await requireContext();
  const opps = await prisma.opportunity.findMany({ where: { workspaceId: ctx.workspace.id }, include: { prospect: { select: { id: true, fullName: true, company: true } } }, orderBy: { updatedAt: "desc" } });
  return (
    <>
      <h1>Fırsatlar</h1>
      <p className="lede">Cevap veren ve görüşmeye ilerleyen kişiler. Aşamayı ve sıradaki adımı kişi kartından güncelleyin.</p>
      <div className="board board5">
        {OPP_STAGES.map(([k, l]) => {
          const list = opps.filter((o) => o.stage === k);
          return (
            <div className="col" key={k}>
              <h3>{l}<span className="badge">{list.length}</span></h3>
              {list.map((o) => (
                <Link key={o.id} className="deal" href={`/kisiler/${o.prospect.id}`} style={{ color: "inherit", textDecoration: "none" }}>
                  <b>{o.prospect.fullName}</b>
                  {o.prospect.company && <p>{o.prospect.company}</p>}
                  {(o.nextStep || o.nextStepAt) && <p>{[o.nextStep, o.nextStepAt && fmtDate(o.nextStepAt)].filter(Boolean).join(" · ")}</p>}
                  {o.stage === "LOST" && o.lostReason && <p>{o.lostReason}</p>}
                </Link>
              ))}
              {!list.length && <p className="sub" style={{ padding: 4 }}>Boş</p>}
            </div>
          );
        })}
      </div>
    </>
  );
}
