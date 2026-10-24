"use client";
import Link from "next/link";
import { useActionState } from "react";
import { requestReset, type AuthState } from "../actions";

export default function Page() {
  const [state, action, pending] = useActionState<AuthState, FormData>(requestReset, {});
  return (
    <div className="login">
      <div className="card">
        <form className="card-b stack" action={action}>
          <div className="logo" style={{ padding: 0 }}><i>H</i>Outreach Platformu</div>
          <h1 style={{ fontSize: 18 }}>Şifremi unuttum</h1>
          <div className="field">
            <label htmlFor="email">E-posta</label>
            <input type="email" id="email" name="email" autoComplete="email" required />
          </div>
          {state.error && <p className="form-error" role="alert">{state.error}</p>}
          {state.info && <p className="form-ok" role="status">{state.info}</p>}
          <button className="btn primary" style={{ justifyContent: "center" }} disabled={pending}>{pending ? "Gönderiliyor…" : "Bağlantı gönder"}</button>
          <p className="help" style={{ margin: 0 }}><Link className="link" href="/giris">Girişe dön</Link></p>
        </form>
      </div>
    </div>
  );
}
