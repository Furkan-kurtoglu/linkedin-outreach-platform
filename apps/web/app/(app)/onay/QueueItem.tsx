"use client";
import { useActionState } from "react";
import { approveJob, skipJob, type QueueState } from "./actions";

export function QueueItem(props: { jobId: string; text: string | null; editable: boolean; rows: number; label: string; issue: string | null }) {
  const [state, action, pending] = useActionState<QueueState, FormData>(approveJob, {});
  return (
    <form action={action} className="stack">
      <input type="hidden" name="jobId" value={props.jobId} />
      {props.issue && <p className="form-error" style={{ margin: 0 }}>Kural denetimi durdurdu: {props.issue} Metni düzeltip onaylayın.</p>}
      {props.editable ? (
        <textarea name="text" defaultValue={props.text ?? ""} style={{ minHeight: props.rows }} aria-label={props.label} placeholder="Notsuz davet" />
      ) : (
        <p className="sub" style={{ margin: 0 }}>{props.label}</p>
      )}
      {state.error && <p className="form-error" role="alert" style={{ margin: 0 }}>{state.error}</p>}
      <div className="row">
        <button className="btn primary" disabled={pending}>{pending ? "Onaylanıyor…" : "Onayla"}</button>
        <button className="btn" formAction={skipJob} disabled={pending}>Bu kişiyi atla</button>
      </div>
    </form>
  );
}
