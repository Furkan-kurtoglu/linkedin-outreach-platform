"use client";
import { SAFE_LIMITS, dailyPlan, formatMin, parseTime, validateSchedule, DEFAULT_SCHEDULE, type DaySchedule } from "@hfo/core";
import { useActionState, useMemo, useState } from "react";
import { saveSchedule, type ScheduleState } from "./actions";

/** Ekranda Pazartesi ile başlar; veride 0=Pazar. */
const ORDER = [1, 2, 3, 4, 5, 6, 0];
const NAMES = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];

interface Win {
  a: string;
  b: string;
}
interface Day {
  on: boolean;
  w: Win[];
  inv?: number;
}

export function ScheduleEditor({ id, name, initial }: { id: string; name: string; initial: { mode: "auto" | "manual"; weekly: number; days: DaySchedule[] } }) {
  const [mode, setMode] = useState(initial.mode);
  const [weekly, setWeekly] = useState(initial.weekly);
  const [days, setDays] = useState<Day[]>(
    initial.days.map((d) => ({ on: d.enabled, w: d.windows.map((x) => ({ a: formatMin(x.startMin), b: formatMin(x.endMin) })), inv: d.invites })),
  );
  const [state, action, pending] = useActionState<ScheduleState, FormData>(saveSchedule, {});

  const toCore = (ds: Day[], m = mode): DaySchedule[] =>
    ds.map((d) => ({
      enabled: d.on,
      windows: d.w.map((x) => ({ startMin: parseTime(x.a) ?? -1, endMin: parseTime(x.b) ?? -1 })),
      invites: m === "manual" ? (d.inv ?? 0) : d.inv,
    }));
  const coreDays = toCore(days);
  const weeklyEff = mode === "manual" ? coreDays.reduce((t, d) => t + (d.enabled ? (d.invites ?? 0) : 0), 0) : weekly;
  const config = { ...DEFAULT_SCHEDULE, weeklyInvites: weeklyEff, days: coreDays };
  const plan = dailyPlan(config);
  const total = [...plan.values()].reduce((a, b) => a + b, 0);
  const badTime = days.some((d) => d.on && d.w.some((x) => parseTime(x.a) == null || parseTime(x.b) == null));
  const issues = useMemo(() => {
    const list = badTime ? [{ level: "error" as const, message: "Saatleri SS:DD biçiminde yazın (ör. 09:30)." }] : validateSchedule(config);
    if (mode === "manual" && weeklyEff > SAFE_LIMITS.weeklyMax) list.push({ level: "error", message: `Haftalık toplam ${weeklyEff}; ${SAFE_LIMITS.weeklyMax}'ü geçemez.` });
    return list;
  }, [JSON.stringify(config), badTime, mode, weeklyEff]); // eslint-disable-line react-hooks/exhaustive-deps
  const hasError = issues.some((i) => i.level === "error");

  const upd = (i: number, f: (d: Day) => Day) => setDays((ds) => ds.map((d, k) => (k === i ? f(d) : d)));
  const switchMode = (m: "auto" | "manual") => {
    if (m === mode) return;
    if (m === "manual") setDays((ds) => ds.map((d, i) => ({ ...d, inv: d.on ? (plan.get(i) ?? 0) : d.inv })));
    else {
      setWeekly(Math.min(SAFE_LIMITS.weeklyMax, total || 180));
      setDays((ds) => ds.map((d) => ({ ...d, inv: undefined })));
    }
    setMode(m);
  };
  const preset = (p: "weekdays" | "all" | "copy") =>
    setDays((ds) =>
      ds.map((d, i) => {
        if (p === "weekdays") return { ...d, on: i >= 1 && i <= 5 };
        if (p === "all") return { ...d, on: true, w: d.w.length ? d.w : [{ a: "09:00", b: "18:30" }] };
        const mon = ds[1]!;
        return i !== 1 && d.on ? { ...d, w: mon.w.map((x) => ({ ...x })), inv: mode === "manual" ? mon.inv : d.inv } : d;
      }),
    );

  return (
    <form action={action} className="card">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="schedule" value={JSON.stringify({ mode, weekly: weeklyEff, days: coreDays, minGapMin: 4, maxGapMin: 20 })} />
      <div className="card-h">
        <div>
          <h2>Davet zamanlaması · {name}</h2>
          <span className="sub">Hangi gün, hangi saatlerde, kaç davet gideceğini belirleyin. Mesajlar da aynı saatlerde gönderilir.</span>
        </div>
        <div className="row">
          <button type="button" className="btn sm" onClick={() => preset("weekdays")}>Hafta içi</button>
          <button type="button" className="btn sm" onClick={() => preset("all")}>Her gün</button>
          <button type="button" className="btn sm" onClick={() => preset("copy")}>Pazartesiyi tüm açık günlere uygula</button>
        </div>
      </div>
      <div className="card-b stack">
        <div className="row" style={{ gap: 20, alignItems: "flex-end" }}>
          <div className="field">
            <span className="lbl">Hedef</span>
            <div className="seg" role="group" aria-label="Hedef türü">
              <button type="button" aria-pressed={mode === "auto"} onClick={() => switchMode("auto")}>Haftalık hedef</button>
              <button type="button" aria-pressed={mode === "manual"} onClick={() => switchMode("manual")}>Gün gün hedef</button>
            </div>
          </div>
          {mode === "auto" ? (
            <>
              <div className="field">
                <label htmlFor="wk">Haftalık davet</label>
                <input type="number" id="wk" min={0} max={SAFE_LIMITS.weeklyMax} value={weekly} onChange={(e) => setWeekly(Math.max(0, +e.target.value || 0))} style={{ width: 110 }} />
              </div>
              <p className="help" style={{ margin: "0 0 6px", maxWidth: "44ch" }}>
                Gün hedefi boş bırakılan açık günler haftalık hedeften eşit pay alır. LinkedIn sınırı haftada yaklaşık {SAFE_LIMITS.weeklyMax}.
              </p>
            </>
          ) : (
            <p className="help" style={{ margin: "0 0 6px", maxWidth: "52ch" }}>Her günün davet sayısını siz belirlersiniz. Haftalık toplam {SAFE_LIMITS.weeklyMax}&apos;ü geçemez.</p>
          )}
          <div style={{ marginLeft: "auto", textAlign: "right" }}>
            <div className="sub">Haftalık toplam</div>
            <div style={{ font: "500 22px var(--mono)" }}>{total}</div>
          </div>
        </div>
        <div className="scroll">
          <table className="sched">
            <thead>
              <tr>
                <th>Gün</th>
                <th>Açık</th>
                <th className="num">Davet</th>
                <th>Saat aralıkları</th>
              </tr>
            </thead>
            <tbody>
              {ORDER.map((i) => {
                const d = days[i]!;
                return (
                  <tr key={i}>
                    <td><b>{NAMES[i]}</b></td>
                    <td>
                      <input type="checkbox" checked={d.on} onChange={(e) => upd(i, (x) => ({ ...x, on: e.target.checked }))} aria-label={`${NAMES[i]} açık`} style={{ accentColor: "var(--accent)", width: 16, height: 16 }} />
                    </td>
                    <td className="num">
                      {d.on ? (
                        <>
                          <input
                            type="number"
                            min={0}
                            max={SAFE_LIMITS.dailyMax}
                            value={d.inv ?? ""}
                            placeholder={String(plan.get(i) ?? 0)}
                            onChange={(e) => upd(i, (x) => ({ ...x, inv: e.target.value === "" ? undefined : Math.max(0, +e.target.value) }))}
                            style={{ width: 76, textAlign: "right" }}
                            aria-label={`${NAMES[i]} davet hedefi`}
                          />
                          {mode === "auto" && <div className="sub">{d.inv == null ? "otomatik" : <button type="button" className="link" style={{ fontSize: 12 }} onClick={() => upd(i, (x) => ({ ...x, inv: undefined }))}>otomatiğe al</button>}</div>}
                        </>
                      ) : (
                        <span className="sub">0</span>
                      )}
                    </td>
                    <td>
                      {d.on ? (
                        <div className="row" style={{ gap: 6 }}>
                          {d.w.map((w, k) => (
                            <span className="win" key={k}>
                              <input type="text" inputMode="numeric" value={w.a} aria-label={`${NAMES[i]} başlangıç ${k + 1}`} onChange={(e) => upd(i, (x) => ({ ...x, w: x.w.map((y, j) => (j === k ? { ...y, a: e.target.value } : y)) }))} />
                              <span>–</span>
                              <input type="text" inputMode="numeric" value={w.b} aria-label={`${NAMES[i]} bitiş ${k + 1}`} onChange={(e) => upd(i, (x) => ({ ...x, w: x.w.map((y, j) => (j === k ? { ...y, b: e.target.value } : y)) }))} />
                              <button type="button" aria-label="Aralığı sil" onClick={() => upd(i, (x) => ({ ...x, w: x.w.filter((_, j) => j !== k) }))}>×</button>
                            </span>
                          ))}
                          {d.w.length < 3 && (
                            <button
                              type="button"
                              className="btn sm quiet"
                              onClick={() =>
                                upd(i, (x) => {
                                  const last = x.w.at(-1);
                                  const s = last ? Math.min(23 * 60, (parseTime(last.b) ?? 600) + 60) : 540;
                                  return { ...x, w: [...x.w, { a: formatMin(s), b: formatMin(Math.min(23 * 60 + 59, s + 120)) }] };
                                })
                              }
                            >
                              Aralık ekle
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="sub">Gönderim yok</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <ul className="checks">
          {issues.length ? (
            issues.map((x, k) => (
              <li key={k}>
                <span className={`dot ${x.level === "error" ? "no" : "warn"}`} />
                {x.message}
              </li>
            ))
          ) : (
            <li>
              <span className="dot ok" />
              Ayarlar güvenli aralıkta.
            </li>
          )}
          {state.errors?.map((e, k) => (
            <li key={`s${k}`}>
              <span className="dot no" />
              {e}
            </li>
          ))}
        </ul>
        <div className="row">
          <button className="btn primary" disabled={hasError || pending}>{pending ? "Kaydediliyor…" : "Kaydet"}</button>
          {state.ok && !pending && <span className="form-ok">Kaydedildi. Bekleyen davetler yeni saatlere göre planlanacak.</span>}
          {hasError && <span className="help">Kaydetmek için kırmızı işaretli sorunları düzeltin.</span>}
        </div>
      </div>
    </form>
  );
}
