"use client";
import { useActionState } from "react";
import { sendReply, type ReplyState } from "./actions";

export function ReplyBox({ prospectId, draft }: { prospectId: string; draft: string }) {
  const [state, action, pending] = useActionState<ReplyState, FormData>(sendReply, {});
  return (
    <form action={action} className="stack" style={{ padding: "0 16px 16px" }}>
      <input type="hidden" name="prospectId" value={prospectId} />
      <label className="lbl" htmlFor="reply">Yanıt</label>
      <textarea id="reply" name="text" defaultValue={draft} key={prospectId} style={{ minHeight: 90 }} />
      <span className="help">Önerilen taslak; düzenleyip gönderin. Yanıtlar kendiliğinden gitmez.</span>
      {state.error && <p className="form-error">{state.error}</p>}
      {state.ok && <p className="form-ok">{state.ok}</p>}
      <div className="row"><button className="btn primary" disabled={pending}>{pending ? "Sıraya alınıyor…" : "Gönder"}</button></div>
    </form>
  );
}
