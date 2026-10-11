import Link from "next/link";

export default function NotFound() {
  return (
    <div className="login">
      <div className="card">
        <div className="card-b stack">
          <h1 style={{ fontSize: 18 }}>Sayfa bulunamadı</h1>
          <p className="help" style={{ margin: 0 }}>Aradığınız kayıt silinmiş ya da bu çalışma alanına ait olmayabilir.</p>
          <Link className="btn primary" href="/" style={{ alignSelf: "flex-start" }}>Genel bakışa dön</Link>
        </div>
      </div>
    </div>
  );
}
