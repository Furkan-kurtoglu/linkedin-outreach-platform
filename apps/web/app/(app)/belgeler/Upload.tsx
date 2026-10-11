"use client";
import { useActionState } from "react";
import { uploadFile, type UploadState } from "./actions";

export function Upload() {
  const [state, action, pending] = useActionState<UploadState, FormData>(uploadFile, {});
  return (
    <form action={action} className="stack">
      <div className="upload">
        <b style={{ color: "var(--fg)" }}>PDF yükle</b>
        <div className="sub">En fazla 10 MB.</div>
        <input type="file" name="file" accept="application/pdf" required style={{ marginTop: 10, maxWidth: "100%" }} aria-label="PDF dosyası" />
      </div>
      {state.error && <p className="form-error">{state.error}</p>}
      {state.ok && <p className="form-ok">{state.ok}</p>}
      <button className="btn primary" disabled={pending} style={{ alignSelf: "flex-start" }}>{pending ? "Yükleniyor…" : "Yükle"}</button>
      <p className="help" style={{ margin: 0 }}>Öneri: tek sayfalık, kuruma özel bir özet. Belge ekli mesajların cevap oranı kampanyanın Sonuçlar sekmesinde görünür.</p>
    </form>
  );
}
