import { estimateDailyInvites, formatMin, hasWindow, validateAgentWindow } from "@hfo/core";
import { SubmitButton } from "@/components/SubmitButton";
import { toScheduleConfig } from "@/lib/convert";
import { windowOf } from "@/lib/planner";
import { saveSending } from "../../actions";
import type { TabProps } from "../types";

const DAYS = [["1", "Pzt"], ["2", "Sal"], ["3", "Çar"], ["4", "Per"], ["5", "Cum"], ["6", "Cmt"], ["0", "Paz"]] as const;
const tm = (min: number) => formatMin(min);

export function SendingSection({ campaign: c, sp }: TabProps) {
  const win = windowOf(c);
  const cfg = toScheduleConfig(c.linkedinAccount);
  const days = win?.days ?? [1, 2, 3, 4, 5];
  const start = win?.startMin ?? 9 * 60;
  const end = win?.endMin ?? 18 * 60;
  const issues = win && hasWindow(win) ? validateAgentWindow(win, cfg, estimateDailyInvites(cfg, win, c.budgetSharePct)) : [];
  return (
    <form action={saveSending} className="card" style={{ maxWidth: 720 }}>
      <input type="hidden" name="id" value={c.id} />
      <div className="card-h"><div><h2>Gönderim</h2><span className="sub">Davetlerin ve mesajların hangi gün ve saatlerde gideceği.</span></div>{sp.kaydedildi && <span className="form-ok">Kaydedildi</span>}</div>
      <div className="card-b stack">
        {sp.uyari === "saat" && <p className="form-error">Başlangıç ve bitiş saatini ss:dd biçiminde girin.</p>}
        {sp.uyari === "pencere" && <p className="form-error">{sp.ayrinti ?? "Pencere kaydedilemedi."}</p>}
        <div className="radio">
          <label>
            <input type="radio" name="windowMode" value="account" defaultChecked={!win} />
            <span><b>Hesabın takvimini kullan</b><div className="sub">Hesaplar sayfasında ayarladığınız gün ve saatler.</div></span>
          </label>
          <label>
            <input type="radio" name="windowMode" value="own" defaultChecked={!!win} />
            <span><b>Bu kampanyaya özel pencere</b><div className="sub">Hesabın açık saatleriyle kesişen kısımda gönderilir; hesabın kapalı saatlerinde yine gönderilmez.</div></span>
          </label>
        </div>
        <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="lbl">Günler (kampanyaya özel pencere için)</legend>
          <div className="days">
            {DAYS.map(([v, l]) => (
              <label key={v}><input type="checkbox" name={`day-${v}`} defaultChecked={days.includes(+v)} />{l}</label>
            ))}
          </div>
          <div className="row" style={{ gap: 16 }}>
            <div className="field"><label htmlFor="start">Başlangıç</label><input type="time" id="start" name="start" defaultValue={tm(start)} style={{ width: 130 }} /></div>
            <div className="field"><label htmlFor="end">Bitiş</label><input type="time" id="end" name="end" defaultValue={tm(end)} style={{ width: 130 }} /></div>
            <div className="field"><span className="lbl">Saat dilimi</span><div style={{ padding: "7px 0" }}>İstanbul (GMT+3)</div></div>
          </div>
        </fieldset>
        {issues.length > 0 && (
          <ul className="checks">
            {issues.map((i, k) => (
              <li key={k}><span className={`dot ${i.level === "error" ? "no" : "warn"}`} />{i.message}</li>
            ))}
          </ul>
        )}
        <div className="field">
          <label htmlFor="share">Haftalık davet bütçesindeki payı (%)</label>
          <input type="number" id="share" name="share" min={5} max={100} step={5} defaultValue={c.budgetSharePct} style={{ maxWidth: 120 }} />
          <span className="help">Hesabın haftalık hedefi {c.linkedinAccount.weeklyInvites}; bu kampanyaya yaklaşık {Math.round((c.linkedinAccount.weeklyInvites * c.budgetSharePct) / 100)} davet düşer. Bekleyen kişisi az olan kampanyanın payı diğerlerine geçer.</span>
        </div>
        <div className="row"><SubmitButton>Kaydet</SubmitButton></div>
      </div>
    </form>
  );
}
