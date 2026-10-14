import { institutionKey } from "@hfo/core";
import { prisma } from "@hfo/db";
import Link from "next/link";
import { KIND_LABEL } from "@/lib/institution-filter";
import type { TabProps } from "./types";

const PAGE = 50;
const ORIGIN: Record<string, string> = { manual: "Elle", kurum: "Kurum Ar-Ge", import: "İçe aktarma", search: "Şirket araması" };

/** Kampanyanın hedef kurum listesi: hangi kurumlar eklendi, türü, ili ve ne zaman tarandı. */
export async function InstitutionsTab({ campaign: c, sp }: TabProps) {
  const page = Math.max(1, Math.round(+(sp.sayfa ?? 1)) || 1);
  const q = (sp.ara ?? "").slice(0, 80);
  const where = { agentId: c.id, ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}) };
  const [rows, total, all] = await Promise.all([
    prisma.targetAccount.findMany({ where, orderBy: [{ createdAt: "desc" }, { name: "asc" }], take: PAGE, skip: (page - 1) * PAGE }),
    prisma.targetAccount.count({ where }),
    prisma.targetAccount.count({ where: { agentId: c.id } }),
  ]);
  const insts = rows.length
    ? await prisma.institution.findMany({ where: { workspaceId: c.workspaceId, name: { in: rows.map((r) => r.name) } }, select: { name: true, kind: true, city: true, size: true } })
    : [];
  const byName = new Map(insts.map((i) => [institutionKey(i.name, undefined), i]));
  const base = `/kampanyalar/${c.id}?sekme=kurumlar${q ? `&ara=${encodeURIComponent(q)}` : ""}`;
  return (
    <>
      <div className="row between" style={{ marginBottom: 12 }}>
        <p className="sub" style={{ margin: 0 }}>
          Bu kampanyanın hedef kurumları: <b>{all}</b>. Kişi bulma, her turda bu listeden en uzun süredir taranmayan 40 kurumu tarar.
        </p>
        <Link className="btn sm" href="/kurumlar">Kurum Ar-Ge&apos;den ekle</Link>
      </div>
      <form method="get" className="row" style={{ marginBottom: 12 }} role="search">
        <input type="hidden" name="sekme" value="kurumlar" />
        <input type="search" name="ara" defaultValue={q} placeholder="Kurum adı ara" aria-label="Kurum ara" style={{ maxWidth: 280 }} />
        <button className="btn sm">Ara</button>
        {q && <Link className="link" href={`/kampanyalar/${c.id}?sekme=kurumlar`}>Temizle</Link>}
        <span className="sub">{total} kurum</span>
      </form>
      {all === 0 ? (
        <p className="sub">Henüz hedef kurum yok. Kurum Ar-Ge sayfasında kurumları seçip bu kampanyaya ekleyin.</p>
      ) : (
        <table className="tbl">
          <thead>
            <tr><th>Kurum</th><th>Tür</th><th>İl</th><th>Kaynak</th><th>Son tarama</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const i = byName.get(institutionKey(r.name, undefined));
              return (
                <tr key={r.id}>
                  <td>{r.linkedinUrl ? <a className="link" href={r.linkedinUrl} target="_blank" rel="noreferrer">{r.name}</a> : r.name}</td>
                  <td>{i ? KIND_LABEL[i.kind] ?? i.kind : "—"}</td>
                  <td>{i?.city ?? "—"}</td>
                  <td>{ORIGIN[r.origin] ?? r.origin}</td>
                  <td>{r.lastSearchedAt ? r.lastSearchedAt.toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" }) : "Henüz taranmadı"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {total > PAGE && (
        <div className="pager">
          <span className="sub">{(page - 1) * PAGE + 1}–{Math.min(total, page * PAGE)} / {total}</span>
          {page > 1 && <Link className="btn sm" href={`${base}&sayfa=${page - 1}`}>Önceki</Link>}
          {page * PAGE < total && <Link className="btn sm" href={`${base}&sayfa=${page + 1}`}>Sonraki</Link>}
        </div>
      )}
    </>
  );
}
