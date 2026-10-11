"use client";
import { useActionState } from "react";
import { changePassword, type PwState } from "./password";

export function PasswordForm() {
  const [state, action, pending] = useActionState<PwState, FormData>(changePassword, {});
  return (
    <form action={action} className="card" id="sifre">
      <div className="card-h"><h2>Şifre</h2></div>
      <div className="card-b stack">
        <div className="field">
          <label htmlFor="pw1">Yeni şifre</label>
          <input type="password" id="pw1" name="password" autoComplete="new-password" minLength={10} required />
        </div>
        <div className="field">
          <label htmlFor="pw2">Yeni şifre (tekrar)</label>
          <input type="password" id="pw2" name="password2" autoComplete="new-password" minLength={10} required />
          <span className="help">En az 10 karakter. LinkedIn şifrenizi kullanmayın.</span>
        </div>
        {state.error && <p className="form-error">{state.error}</p>}
        {state.ok && <p className="form-ok">Şifre değiştirildi.</p>}
        <div className="row"><button className="btn" disabled={pending}>{pending ? "Kaydediliyor…" : "Şifreyi değiştir"}</button></div>
      </div>
    </form>
  );
}
