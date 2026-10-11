import Link from "next/link";
import { STAGE_LABEL } from "@/lib/convert";
import { SelectAll } from "./SelectAll";

export interface PersonRow {
  apId: string;
  prospectId: string;
  fullName: string;
  title: string | null;
  company: string | null;
  segment: string | null;
  degree: number | null;
  mutual: number | null;
  score: number | null;
  stage: string;
  next: string;
  reason: string | null;
}

const degTag = (d: number | null) => (d === 1 ? <span className="tag t-acc">1. derece</span> : d ? <span className="tag t-mute">{d}. derece</span> : null);

/** Kişi tablosu: seçim kutuları formun parçasıdır (toplu işlem düğmeleri aynı formda). */
export function PeopleTable({ rows, selectable = true }: { rows: PersonRow[]; selectable?: boolean }) {
  return (
    <div className="card scroll">
      <table>
        <thead>
          <tr>
            {selectable && <th className="sel"><SelectAll /></th>}
            <th>Kişi</th>
            <th>Kurum</th>
            <th>Bağlantı</th>
            <th className="num">Puan</th>
            <th>Durum</th>
            <th>Sıradaki adım</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            const st = STAGE_LABEL[p.stage] ?? { text: p.stage, tone: "t-mute" };
            return (
              <tr key={p.apId}>
                {selectable && (
                  <td className="sel"><input type="checkbox" name="ap" value={p.apId} aria-label={`${p.fullName} seç`} /></td>
                )}
                <td>
                  <Link className="link" href={`/kisiler/${p.prospectId}`}>{p.fullName}</Link>
                  {p.title && <div className="sub">{p.title}</div>}
                </td>
                <td>
                  {p.company ?? "—"}
                  {p.segment && <div className="sub">{p.segment}</div>}
                </td>
                <td>
                  {degTag(p.degree)}
                  {p.mutual ? <div className="sub">{p.mutual} ortak bağlantı</div> : null}
                </td>
                <td className="num">{p.score ?? "—"}</td>
                <td>
                  <span className={`tag ${st.tone}`}>{st.text}</span>
                  {p.reason && (p.stage === "NEEDS_REVIEW" || p.stage === "SKIPPED") && <div className="sub" style={{ maxWidth: 220 }}>{p.reason}</div>}
                </td>
                <td className="sub" style={{ minWidth: 170 }}>{p.next}</td>
              </tr>
            );
          })}
          {!rows.length && (
            <tr>
              <td colSpan={selectable ? 7 : 6} className="empty">Bu filtrede kimse yok.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
