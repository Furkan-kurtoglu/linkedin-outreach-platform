"use client";
import Link from "next/link";
import { useActionState } from "react";
import { signIn, signUp, type AuthState } from "./actions";

export function AuthForm({ mode, next, notice }: { mode: "in" | "up"; next?: string; notice?: string }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(mode === "in" ? signIn : signUp, {});
  return (
    <div className="login">
      <div className="card">
        <form className="card-b stack" action={action}>
          <div className="logo" style={{ padding: 0 }}>
            <i>H</i>Outreach Platformu
          </div>
          <h1 style={{ fontSize: 18 }}>{mode === "in" ? "Giriş yap" : "Hesap oluştur"}</h1>
          {notice && <p className="form-error">{notice}</p>}
          {mode === "up" && (
            <div className="field">
              <label htmlFor="name">Ad soyad</label>
              <input type="text" id="name" name="name" autoComplete="name" required />
            </div>
          )}
          <div className="field">
            <label htmlFor="email">E-posta</label>
            <input type="email" id="email" name="email" autoComplete="email" required />
          </div>
          <div className="field">
            <label htmlFor="password">Şifre</label>
            <input type="password" id="password" name="password" autoComplete={mode === "in" ? "current-password" : "new-password"} minLength={mode === "up" ? 10 : undefined} required />
            {mode === "up" && <span className="help">En az 10 karakter. LinkedIn şifrenizi kullanmayın.</span>}
            {mode === "in" && <Link className="link" href="/sifremi-unuttum" style={{ fontSize: 12, alignSelf: "flex-start" }}>Şifremi unuttum</Link>}
          </div>
          {next && <input type="hidden" name="sonra" value={next} />}
          {state.error && <p className="form-error" role="alert">{state.error}</p>}
          {state.info && <p className="form-ok" role="status">{state.info}</p>}
          <button className="btn primary" style={{ justifyContent: "center" }} disabled={pending}>
            {pending ? "Bekleyin…" : mode === "in" ? "Giriş yap" : "Hesap oluştur"}
          </button>
          <p className="help" style={{ margin: 0 }}>
            {mode === "in" ? (
              <>
                Hesabınız yok mu? <Link className="link" href="/kayit">Kayıt olun</Link>. Her kullanıcı yalnızca kendi ekibinin verisini görür.
              </>
            ) : (
              <>
                Hesabınız var mı? <Link className="link" href="/giris">Giriş yapın</Link>.
              </>
            )}
          </p>
        </form>
      </div>
    </div>
  );
}
