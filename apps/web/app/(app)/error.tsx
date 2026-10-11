"use client";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="card" style={{ maxWidth: 560 }}>
      <div className="card-b stack">
        <h1 style={{ fontSize: 18 }}>Bir şeyler ters gitti</h1>
        <p className="help" style={{ margin: 0 }}>
          Sayfa yüklenemedi. Tekrar deneyin; sorun sürerse bu kodu paylaşın: <code>{error.digest ?? "—"}</code>
        </p>
        <div className="row">
          <button className="btn primary" onClick={reset}>Tekrar dene</button>
        </div>
      </div>
    </div>
  );
}
