"use client";
import { useActionState } from "react";
import { rotateToken, type TokenState } from "./actions";

export function TokenBox({ id, hasToken }: { id: string; hasToken: boolean }) {
  const [state, action, pending] = useActionState<TokenState, FormData>(rotateToken, {});
  return (
    <form action={action} className="stack" style={{ gap: 8 }}>
      <input type="hidden" name="id" value={id} />
      {state.token ? (
        <>
          <span className="lbl">Bağlantı anahtarı</span>
          <div className="token">{state.token}</div>
          <p className="help" style={{ margin: 0 }}>
            Bu anahtarı çalışanı ilk açtığınızda isteyen kutuya yapıştırın. Bir daha gösterilmez; kaybederseniz yenisini oluşturun (eskisi geçersiz olur). Kimseyle paylaşmayın.
          </p>
        </>
      ) : (
        <p className="help" style={{ margin: 0 }}>
          {hasToken ? "Çalışan bağlı. Yeni bilgisayara kuracaksanız ya da anahtarı kaybettiyseniz yenileyin; eski anahtar geçersiz olur." : "Çalışanı bu hesaba bağlamak için bir anahtar oluşturun."}
        </p>
      )}
      <div className="row">
        <button className="btn" disabled={pending}>{pending ? "Oluşturuluyor…" : hasToken ? "Anahtarı yenile" : "Bağlantı anahtarı oluştur"}</button>
      </div>
    </form>
  );
}
