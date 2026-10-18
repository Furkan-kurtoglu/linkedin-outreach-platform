import { prisma } from "@hfo/db";
import Link from "next/link";
import { BulkOps } from "@/components/BulkOps";
import { PeopleTable } from "@/components/PeopleTable";
import { UndoBanner } from "@/components/UndoBanner";
import { FILTERS, filterWhere, personRows } from "@/lib/people";
import { bulkPeople, reevaluateEliminated } from "../actions";
import type { TabProps } from "./types";

const PAGE = 50;

export async function PeopleTab({ campaign: c, sp }: TabProps) {
  const filtre = sp.filtre ?? "tumu";
  const page = Math.max(1, Math.round(+(sp.sayfa ?? 1)) || 1);
  const q = (sp.ara ?? "").slice(0, 80);
  const sort = sp.sirala === "yeni" ? "yeni" : "puan";
  const where = filterWhere(c.id, filtre, c.workspaceId, q);
  const [rows, total] = await Promise.all([personRows(where, PAGE, (page - 1) * PAGE, sort), prisma.agentProspect.count({ where })]);
  const extra = `${q ? `&ara=${encodeURIComponent(q)}` : ""}${sort === "yeni" ? "&sirala=yeni" : ""}`;
  const base = `/kampanyalar/${c.id}?sekme=kisiler&filtre=${filtre}${extra}`;
  return (
    <>
      <UndoBanner auditId={sp.geri} workspaceId={c.workspaceId} back={base} />
      {sp.geriAlinan !== undefined && <p className="notice" style={{ marginBottom: 12 }}>Yeniden değerlendirme bitti: {sp.geriAlinan} kişi elenenlerden çıkarıldı.</p>}
      {filtre === "elenen" && (
        <form action={reevaluateEliminated} className="row" style={{ marginBottom: 12, gap: 12 }}>
          <input type="hidden" name="id" value={c.id} />
          <button className="btn sm" type="submit">Elenenleri güncel kurallarla yeniden değerlendir</button>
          <span className="sub">Yanlış elenen yönetici unvanlı kişileri geri alır; elle atladıklarınıza dokunmaz.</span>
        </form>
      )}
      <div className="row between" style={{ marginBottom: 12 }}>
        <div className="seg" role="group" aria-label="Filtre" style={{ flexWrap: "wrap" }}>
          {FILTERS.map(([k, l]) => (
            <Link key={k} href={`/kampanyalar/${c.id}?sekme=kisiler&filtre=${k}${extra}`} aria-pressed={filtre === k} className="seg-link" style={{ padding: "5px 12px", fontSize: 13, color: filtre === k ? "var(--bg)" : "var(--muted)", background: filtre === k ? "var(--fg)" : "var(--surface)", borderRight: "1px solid var(--line)", textDecoration: "none" }}>
              {l}
            </Link>
          ))}
        </div>
        <div className="row">
          <a className="btn sm" href={`/kampanyalar/${c.id}/csv?filtre=${filtre}${q ? `&ara=${encodeURIComponent(q)}` : ""}`}>Listeyi CSV indir</a>
          <Link className="btn sm" href="/kisi-bulma">Kişi bul</Link>
        </div>
      </div>
      <form method="get" className="row" style={{ marginBottom: 12 }} role="search">
        <input type="hidden" name="sekme" value="kisiler" />
        <input type="hidden" name="filtre" value={filtre} />
        <input type="search" name="ara" defaultValue={q} placeholder="Ad, kurum ya da unvan ara" aria-label="Kişi ara" style={{ maxWidth: 280 }} />
        <select name="sirala" defaultValue={sort} aria-label="Sıralama" style={{ width: "auto" }}>
          <option value="puan">Puana göre</option>
          <option value="yeni">En yeni</option>
        </select>
        <button className="btn sm">Uygula</button>
        {q && <Link className="link" href={`/kampanyalar/${c.id}?sekme=kisiler&filtre=${filtre}`}>Temizle</Link>}
        <span className="sub">{total} kişi</span>
      </form>
      <form action={bulkPeople}>
        <input type="hidden" name="id" value={c.id} />
        <input type="hidden" name="filtre" value={filtre} />
        <div className="row" style={{ marginBottom: 10 }}>
          <span className="sub">Seçilenler:</span>
          <BulkOps ops={[{ value: "ok", label: "Uygun say" }, { value: "skip", label: "Atla" }, { value: "exclude", label: "Kurumunu hariç tut" }, { value: "never", label: "Bir daha yazma", quiet: true }]} />
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
