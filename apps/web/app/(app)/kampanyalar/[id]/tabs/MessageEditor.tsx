"use client";
import { buildFirstLine, calendarSentence, prepareMessage, renderForPerson, type AssistAction, type Suggestion, type TemplateRules } from "@hfo/core";
import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { assistTemplate, saveTemplate, type SaveTemplateState } from "../actions";

export interface EditorStep {
  id: string;
  type: string;
  branch: string;
  label: string;
  sub: string;
  attachment: string | null;
}
export interface EditorTemplate {
  id: string;
  stepId: string;
  segmentId: string | null;
  lang: string;
  variant: string;
  version: number;
  status: string;
  body: string;
  sent: number;
  success: number;
}

/** Kelime bazında fark (öneriyi mevcut metinle karşılaştırmak için) */
function wordDiff(a: string, b: string) {
  const A = a.split(/(\s+)/), B = b.split(/(\s+)/);
  const n = A.length, m = B.length;
  const dp = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i]![j] = A[i] === B[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
  const out: React.ReactNode[] = [];
  let i = 0, j = 0, k = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { out.push(A[i]); i++; j++; }
    else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) out.push(<del key={k++}>{A[i++]}</del>);
    else out.push(<ins key={k++}>{B[j++]}</ins>);
  }
  while (i < n) out.push(<del key={k++}>{A[i++]}</del>);
  while (j < m) out.push(<ins key={k++}>{B[j++]}</ins>);
  return out;
}

const SAMPLE = { hitap: "Elif Demirtaş", kurum: "Özel Örnek Hastanesi" };

export function MessageEditor(props: {
  campaignId: string;
  steps: EditorStep[];
  segments: { id: string; name: string }[];
  templates: EditorTemplate[];
  initialStepId?: string;
  premium: boolean;
  rules: TemplateRules;
  options: { firstLine: boolean; calendar: boolean; calendarUrl?: string; english: boolean };
  aiEnabled: boolean;
}) {
  const { steps, templates, options } = props;
  const [stepId, setStepId] = useState(steps.find((s) => s.id === props.initialStepId)?.id ?? steps[0]?.id ?? "");
  const [segmentId, setSegmentId] = useState<string>("");
  const [lang, setLang] = useState<"tr" | "en">("tr");
  const [variant, setVariant] = useState("A");
  const step = steps.find((s) => s.id === stepId);
  const key = (t: EditorTemplate) => t.stepId === stepId && (t.segmentId ?? "") === segmentId && t.lang === lang && t.variant === variant;
  const versions = templates.filter(key).sort((a, b) => b.version - a.version);
  const approved = versions.find((t) => t.status === "APPROVED");
  const draft = versions.find((t) => t.status === "DRAFT");
  const fallback = templates.find((t) => t.stepId === stepId && t.segmentId === null && t.lang === lang && t.variant === "A" && t.status !== "ARCHIVED");
  const initial = (draft ?? approved)?.body ?? (segmentId || variant !== "A" ? (fallback?.body ?? "") : "");
  const [text, setText] = useState(initial);
  const [sugg, setSugg] = useState<Suggestion[] | null>(null);
  const [aiMsg, setAiMsg] = useState<string | null>(null);
  const [ask, setAsk] = useState("");
  const [aiPending, startAi] = useTransition();
  const [state, action, pending] = useActionState<SaveTemplateState, FormData>(saveTemplate, {});
  const ta = useRef<HTMLTextAreaElement>(null);
  const caret = useRef<number | null>(null);

  useEffect(() => {
    setText(initial);
    setSugg(null);
    setAiMsg(null);
    caret.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepId, segmentId, lang, variant, initial]);

  const kind = step?.type === "INVITE" ? "invite_note" : "message";
  const rules: TemplateRules = step?.type === "FOLLOW_UP" || step?.type === "INMAIL" ? { ...props.rules, requiredLink: undefined } : props.rules;
  const optVals = useMemo(() => {
    const o = { firstLine: { enabled: options.firstLine, sources: ["mutual" as const] }, calendar: { enabled: options.calendar, url: options.calendarUrl }, english: { enabled: options.english } };
    return { ilk_cumle: buildFirstLine({ mutualName: "Ahmet Yılmaz" }, o, lang), takvim_linki: calendarSentence(o, lang) };
  }, [options, lang]);
  const preview = renderForPerson(text, { ...SAMPLE, ...optVals }, kind, rules);
  const strict = prepareMessage(text, { ...SAMPLE, ...optVals }, kind, rules);
  const vars = [...text.matchAll(/\{([a-z_]+)(\?)?\}/g)];
  const unknown = vars.filter((m) => !["hitap", "kurum", "ilk_cumle", "takvim_linki"].includes(m[1]!));
  const limit = kind === "invite_note" ? (props.premium ? 300 : 200) : 8000;
  const checks = [
    ...strict.issues.filter((i) => i.code !== "too_long" || !preview.ok).map((i) => ({ ok: false, msg: i.message })),
    { ok: /\{hitap\}/.test(text), msg: /\{hitap\}/.test(text) ? "Kişiye adıyla hitap ediliyor" : "{hitap} yok; kişiye adıyla hitap edilmiyor" },
    { ok: !unknown.length, msg: unknown.length ? `Tanımsız değişken: ${unknown[0]![0]}` : "Değişkenler tanımlı" },
    ...(preview.droppedOptional.length ? [{ ok: true, msg: "Uzun isimli kişilerde ilk cümle sığmazsa çıkarılır" }] : []),
  ];
  const blocking = checks.some((c) => !c.ok && !c.msg.startsWith("{hitap}"));

  const insert = (v: string) => {
    const pos = caret.current ?? text.length;
    const next = text.slice(0, pos) + v + text.slice(pos);
    setText(next);
    caret.current = pos + v.length;
    ta.current?.focus();
  };

  const runAi = (a: AssistAction, instruction?: string) =>
    startAi(async () => {
      setAiMsg(null);
      setSugg(null);
      const r = await assistTemplate({ id: props.campaignId, stepId, body: text, action: a, instruction });
      if (r.ok) setSugg(r.suggestions);
      else setAiMsg(r.message);
    });

  const newBranch = (b: string) => steps.filter((s) => s.branch === b);
  const group = (title: string, list: EditorStep[]) =>
    list.length ? (
      <>
        <div className="grp">{title}</div>
        {list.map((s) => {
          const has = templates.some((t) => t.stepId === s.id && t.status === "APPROVED");
          return (
            <button key={s.id} type="button" aria-current={s.id === stepId} onClick={() => { setStepId(s.id); setVariant("A"); }}>
              <b>{s.label}</b>
              <span>{s.sub}{has ? "" : " · onay bekliyor"}</span>
            </button>
          );
        })}
      </>
    ) : null;

  if (!step) return <div className="card empty">Bu kampanyada mesaj adımı yok.</div>;
  const variants = [...new Set(templates.filter((t) => t.stepId === stepId && (t.segmentId ?? "") === segmentId && t.lang === lang && t.status !== "ARCHIVED").map((t) => t.variant))].sort();
  if (!variants.includes("A")) variants.unshift("A");

  return (
    <>
      <div className="row between" style={{ marginBottom: 14 }}>
        <div className="row">
          {props.segments.length > 0 && (
            <>
              <span className="lbl">Segment</span>
              <div className="seg" role="group" aria-label="Segment">
                <button type="button" aria-pressed={segmentId === ""} onClick={() => setSegmentId("")}>Genel</button>
                {props.segments.map((s) => (
                  <button type="button" key={s.id} aria-pressed={segmentId === s.id} onClick={() => setSegmentId(s.id)}>{s.name}</button>
                ))}
              </div>
            </>
          )}
          {options.english && (
            <>
              <span className="lbl">Dil</span>
              <div className="seg" role="group" aria-label="Dil">
                <button type="button" aria-pressed={lang === "tr"} onClick={() => setLang("tr")}>Türkçe</button>
                <button type="button" aria-pressed={lang === "en"} onClick={() => setLang("en")}>İngilizce</button>
              </div>
            </>
          )}
        </div>
        <span className="help">Gönderilen, onaylı sürümdür. Segment ya da dil metni yoksa genel Türkçe metin gider.</span>
      </div>
      <div className="editor">
        <div className="card">
          <div className="card-b" style={{ padding: 8 }}>
            <div className="steplist">
              {group("Yeni kişiler", newBranch("NEW_PERSON").filter((s) => s.type !== "OPEN_MESSAGE" && s.type !== "INMAIL"))}
              {group("Mevcut bağlantılar", newBranch("CONNECTED"))}
              {group("Seçenekli", steps.filter((s) => s.type === "OPEN_MESSAGE" || s.type === "INMAIL"))}
            </div>
          </div>
        </div>

        <form action={action} className="card">
          <input type="hidden" name="id" value={props.campaignId} />
          <input type="hidden" name="stepId" value={stepId} />
          <input type="hidden" name="segmentId" value={segmentId} />
          <input type="hidden" name="lang" value={lang} />
          <input type="hidden" name="variant" value={variant} />
          <div className="card-h">
            <div>
              <h2>{step.label}{variant !== "A" ? ` · Varyant ${variant}` : ""}</h2>
              <span className="sub">{segmentId ? props.segments.find((s) => s.id === segmentId)?.name : "Genel"}{lang === "en" ? " · İngilizce" : ""}{versions[0] ? ` · sürüm ${versions[0].version}` : ""}</span>
            </div>
            <span className={`tag ${draft || text !== (approved?.body ?? "") ? "t-warn" : approved ? "t-good" : "t-mute"}`}>
              {text !== (approved?.body ?? "") || draft ? "Taslak" : approved ? "Onaylı" : "Metin yok"}
            </span>
          </div>
          <div className="card-b stack">
            {variants.length > 1 || variant !== "A" ? (
              <div className="row">
                <span className="lbl">Varyant</span>
                <div className="seg" role="group" aria-label="Varyant">
                  {variants.map((v) => (
                    <button type="button" key={v} aria-pressed={variant === v} onClick={() => setVariant(v)}>{v}</button>
                  ))}
                </div>
                <span className="help">Onaylı varyantlar kişilere eşit dağıtılır; Sonuçlar sekmesinde karşılaştırılır.</span>
              </div>
            ) : null}
            {lang === "en" && !initial && <p className="help" style={{ margin: 0 }}>Bu adımın İngilizce metni yok; İngilizce profillere Türkçe metin gider. Aşağıya yazıp onaylayın.</p>}
            <textarea
              ref={ta}
              name="body"
              value={text}
              lang={lang}
              spellCheck={false}
              aria-label="Mesaj metni"
              onChange={(e) => setText(e.target.value)}
              onSelect={(e) => (caret.current = e.currentTarget.selectionStart)}
              style={{ minHeight: kind === "invite_note" ? 120 : 240 }}
            />
            <div className="meta">
              <span className={preview.text.length > limit ? "over" : undefined}>{preview.text.length} / {limit} karakter</span>
              <span className="tools">
                <span className="sub">Değişken:</span>
                <button type="button" className="var" onClick={() => insert("{hitap}")}>{"{hitap}"}</button>
                <button type="button" className="var" onClick={() => insert("{kurum}")}>{"{kurum}"}</button>
                {options.firstLine && <button type="button" className="var" title="Kişiye özel ilk cümle; bilgi yoksa görünmez" onClick={() => insert("{ilk_cumle?}")}>{"{ilk_cumle?}"}</button>}
                {options.calendar && <button type="button" className="var" title="Randevu cümlesi" onClick={() => insert("{takvim_linki?}")}>{"{takvim_linki?}"}</button>}
              </span>
            </div>
            {step.attachment && <span className="file" style={{ margin: 0 }}>PDF · {step.attachment}</span>}
            {kind === "invite_note" && <p className="help" style={{ margin: 0 }}>LinkedIn davet notuna belge eklenemez. Belgeyi kabulde giden mesaja ekleyin.</p>}

            <div>
              <span className="lbl">Düzenleme yardımı</span>
              <p className="help" style={{ margin: "2px 0 8px" }}>
                {props.aiEnabled ? "İsteğe bağlı. Yalnızca şablon metni gönderilir; kişi bilgisi gönderilmez. Kurallara uymayan öneri gösterilmez." : "Kapalı. Açmak için Gemini anahtarını panelin ortam ayarlarına ekleyin (Ayarlar sayfasında anlatılıyor)."}
              </p>
              <div className="tools">
                <button type="button" className="btn sm" disabled={!props.aiEnabled || aiPending} onClick={() => runAi("better")}>Netleştir</button>
                <button type="button" className="btn sm" disabled={!props.aiEnabled || aiPending} onClick={() => runAi("shorter")}>Kısalt</button>
                <button type="button" className="btn sm" disabled={!props.aiEnabled || aiPending} onClick={() => runAi("alternatives")}>3 alternatif</button>
              </div>
              <div className="add" style={{ maxWidth: "none" }}>
                <input type="text" value={ask} onChange={(e) => setAsk(e.target.value)} placeholder="Kendi isteğiniz: ör. görünürlük vurgusunu öne al" aria-label="Düzenleme isteği" disabled={!props.aiEnabled} />
                <button type="button" className="btn sm" disabled={!props.aiEnabled || aiPending || !ask.trim()} onClick={() => runAi("custom", ask)}>Uygula</button>
              </div>
              {aiPending && <p className="help">Öneriler hazırlanıyor…</p>}
              {aiMsg && <p className="form-error">{aiMsg}</p>}
              {sugg?.map((s, i) => (
                <div className="sugg" key={i}>
                  <span className="help">{s.why}</span>
                  <div className="diff" style={{ marginTop: 8 }}>{wordDiff(text, s.text)}</div>
                  <div className="row" style={{ marginTop: 10 }}>
                    <button type="button" className="btn sm primary" onClick={() => { setText(s.text); setSugg(null); }}>Kullan</button>
                    {i === sugg.length - 1 && <button type="button" className="btn sm quiet" onClick={() => setSugg(null)}>Kapat</button>}
                  </div>
                </div>
              ))}
            </div>

            <div className="row" style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
              <button className="btn primary" name="approve" value="1" disabled={pending || blocking || !text.trim()}>Bu sürümü onayla</button>
              <button className="btn" name="approve" value="0" disabled={pending || !text.trim()}>Taslak kaydet</button>
              {variant === "A" && approved && !segmentId && (
                <button type="button" className="btn quiet" onClick={() => setVariant(String.fromCharCode(65 + variants.length))} disabled={variants.length >= 3}>
                  A/B varyantı ekle
                </button>
              )}
              {blocking && <span className="form-error">Onaylamak için kural denetimindeki kırmızı maddeyi düzeltin. Taslak olarak her zaman kaydedebilirsiniz.</span>}
              {state.ok && <span className="form-ok">{state.ok}</span>}
              {state.error && <span className="form-error">{state.error}</span>}
            </div>
          </div>
        </form>

        <div className="stack side-col">
          <div className="card">
            <div className="card-h"><h2>Önizleme</h2></div>
            <div className="card-b">
              <div className="preview-h">
                <span className="avatar">ED</span>
                <div><b>Elif Demirtaş</b><div className="sub">Hasta Hizmetleri Müdürü · Özel Örnek Hastanesi</div></div>
              </div>
              <div className="bubble">{preview.text || "—"}</div>
              {step.attachment && <div className="file">PDF · {step.attachment}</div>}
              {options.firstLine && <p className="help" style={{ marginBottom: 0 }}>Örnekte ortak bağlantı &quot;Ahmet Yılmaz&quot;. Bilgisi bulunamayan kişide ilk cümle hiç görünmez.</p>}
            </div>
          </div>
          <div className="card">
            <div className="card-h"><h2>Kural denetimi</h2></div>
            <div className="card-b">
              <ul className="checks">
                {checks.map((c, i) => (
                  <li key={i}><span className={`dot ${c.ok ? "ok" : c.msg.startsWith("{hitap}") ? "warn" : "no"}`} />{c.msg}</li>
                ))}
                {!strict.issues.length && <li><span className="dot ok" />Yasak ifade, hariç kurum ve süre vaadi yok</li>}
              </ul>
            </div>
          </div>
          <div className="card">
            <div className="card-h"><h2>Sürümler</h2></div>
            <div className="card-b tight scroll">
              <table>
                <thead><tr><th>Sürüm</th><th>Durum</th><th className="num">Gönderim</th><th className="num">{kind === "invite_note" ? "Kabul" : "Cevap"}</th></tr></thead>
                <tbody>
                  {versions.map((v) => (
                    <tr key={v.id}>
                      <td>v{v.version}</td>
                      <td><span className={`tag ${v.status === "APPROVED" ? "t-good" : v.status === "DRAFT" ? "t-warn" : "t-mute"}`}>{v.status === "APPROVED" ? "Onaylı" : v.status === "DRAFT" ? "Taslak" : "Arşiv"}</span></td>
                      <td className="num">{v.sent || "—"}</td>
                      <td className="num">{v.sent ? `%${Math.round((v.success / v.sent) * 100)}` : "—"}</td>
                    </tr>
                  ))}
                  {!versions.length && <tr><td colSpan={4} className="sub">Henüz sürüm yok.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
