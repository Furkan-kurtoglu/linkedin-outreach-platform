import { prisma } from "@hfo/db";
import Link from "next/link";
import { PeopleTable } from "@/components/PeopleTable";
import { UndoBanner } from "@/components/UndoBanner";
import { FILTERS, filterWhere, personRows } from "@/lib/people";
import { bulkPeople } from "../actions";
import type { TabProps } from "./types";

const PAGE = 50;

export async function PeopleTab({ campaign: c, sp }: TabProps) {
  const filtre = sp.filtre ?? "tumu";
  const page = Math.max(1, Math.round(+(sp.sayfa ?? 1)) || 1);
  const where = filterWhere(c.id, filtre, c.workspaceId);
  const [rows, total] = await Promise.all([personRows(where, PAGE, (page - 1) * PAGE), prisma.agentProspect.count({ where })]);
  const base = `/kampanyalar/${c.id}?sekme=kisiler&filtre=${filtre}`;
  return (
    <>
      <UndoBanner auditId={sp.geri} workspaceId={c.workspaceId} back={base} />
      <div className="row between" style={{ marginBottom: 12 }}>
        <div className="seg" role="group" aria-label="Filtre" style={{ flexWrap: "wrap" }}>
          {FILTERS.map(([k, l]) => (
            <Link key={k} href={`/kampanyalar/${c.id}?sekme=kisiler&filtre=${k}`} aria-pressed={filtre === k} className="seg-link" style={{ padding: "5px 12px", fontSize: 13, color: filtre === k ? "var(--bg)" : "var(--muted)", background: filtre === k ? "var(--fg)" : "var(--surface)", borderRight: "1px solid var(--line)", textDecoration: "none" }}>
              {l}
            </Link>
          ))}
        </div>
        <div className="row">
          <a className="btn sm" href={`/kampanyalar/${c.id}/csv?filtre=${filtre}`}>Listeyi CSV indir</a>
          <Link className="btn sm" href="/kisi-bulma">Kişi bul</Link>
        </div>
      </div>
      <form action={bulkPeople}>
        <input type="hidden" name="id" value={c.id} />
        <input type="hidden" name="filtre" value={filtre} />
        <div className="row" style={{ marginBottom: 10 }}>
          <span className="sub">Seçilenler:</span>
          <button className="btn sm" name="op" value="ok">Uygun say</button>
          <button className="btn sm" name="op" value="skip">Atla</button>
          <button className="btn sm" name="op" value="exclude">Kurumunu hariç tut</button>
          <button className="btn sm quiet" name="op" value="never">Bir daha yazma</button>
        </div>
        <PeopleTable rows={rows} />
      </form>
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
