import { prisma } from "@hfo/db";
import type { Metadata } from "next";
import { STEP_LABEL } from "@/lib/convert";
import { requireContext } from "@/lib/context";
import { deleteFile } from "./actions";
import { Upload } from "./Upload";

export const metadata: Metadata = { title: "Belgeler" };

const size = (b: number) => `${(b / 1_048_576).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} MB`;

export default async function Page() {
  const ctx = await requireContext();
  const files = await prisma.fileAsset.findMany({ where: { workspaceId: ctx.workspace.id }, orderBy: { createdAt: "desc" }, include: { steps: { include: { agent: { select: { name: true } } } } } });
  return (
    <>
      <h1>Belgeler</h1>
      <p className="lede">Kabulde giden mesaja ya da takip mesajlarına eklenebilen PDF&apos;ler. LinkedIn davet notuna belge eklenemez.</p>
      <div className="grid g-main">
        <div className="card scroll">
          <table>
            <thead><tr><th>Belge</th><th className="num">Boyut</th><th>Kullanıldığı yer</th><th /></tr></thead>
            <tbody>
              {files.map((f) => (
                <tr key={f.id}>
                  <td><a className="link" href={`/belgeler/${f.id}`} target="_blank" rel="noopener noreferrer">{f.name}</a></td>
                  <td className="num">{size(f.sizeBytes)}</td>
                  <td className="sub">{f.steps.map((s) => `${s.agent.name} · ${STEP_LABEL[s.type]}`).join(", ") || "—"}</td>
                  <td style={{ textAlign: "right" }}>
                    <form action={deleteFile}><input type="hidden" name="id" value={f.id} /><button className="btn sm quiet">Sil</button></form>
                  </td>
                </tr>
              ))}
              {!files.length && <tr><td colSpan={4} className="empty">Henüz belge yok.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="card"><div className="card-b"><Upload /></div></div>
      </div>
    </>
  );
}
