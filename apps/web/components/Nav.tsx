"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { switchCompany } from "@/app/(app)/sirketler/actions";

const ITEMS: ({ href: string; label: string; badge?: "queue" | "inbox" } | { group: string })[] = [
  { href: "/", label: "Genel bakış" },
  { group: "Çalışma" },
  { href: "/sirketler", label: "Şirketler" },
  { href: "/kampanyalar", label: "Kampanyalar" },
  { href: "/analitik", label: "Analitik" },
  { href: "/kisi-bulma", label: "Kişi bulma" },
  { href: "/onay", label: "Onay kuyruğu", badge: "queue" },
  { href: "/gelen", label: "Gelen kutusu", badge: "inbox" },
  { href: "/firsatlar", label: "Fırsatlar" },
  { group: "Kaynaklar" },
  { href: "/belgeler", label: "Belgeler" },
  { href: "/hesaplar", label: "LinkedIn hesapları" },
  { href: "/ayarlar", label: "Ayarlar" },
];

interface Brand {
  id: string;
  name: string;
  logoV: number;
}

function Mark({ b }: { b: Brand }) {
  return b.logoV ? <img className="brand-img" src={`/logo/${b.id}?v=${b.logoV}`} alt="" width={28} height={28} /> : <i>{b.name.trim().charAt(0).toLocaleUpperCase("tr-TR") || "?"}</i>;
}

export function Nav({ brands, counts, runner, userName }: { brands: { list: Brand[]; active: Brand | null }; counts: { queue: number; inbox: number }; runner: { ok: boolean; text: string }; userName: string }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState(false);
  const active = brands.active;
  // Sayfa değişince çekmece kapanır; açıkken Esc kapatır ve arka plan kaymaz
  useEffect(() => {
    setOpen(false);
    setPick(false);
  }, [path]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.classList.add("lock");
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.classList.remove("lock");
    };
  }, [open]);
  const isActive = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`) || (href === "/kampanyalar" && path.startsWith("/kisiler/")));
  return (
    <>
    <header className="topbar">
      <div className="logo">{active ? <><Mark b={active} /><span className="brand-name">{active.name}</span></> : <span className="brand-name">Şirket seçilmedi</span>}</div>
      <button type="button" className="menu-btn" aria-expanded={open} aria-controls="ana-menu" onClick={() => setOpen((v) => !v)}>
        <span className="sr">{open ? "Menüyü kapat" : "Menüyü aç"}</span>
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          {open ? <path d="M4 4l12 12M16 4L4 16" /> : <path d="M3 5h14M3 10h14M3 15h14" />}
        </svg>
      </button>
    </header>
    <div className="scrim" data-open={open} onClick={() => setOpen(false)} aria-hidden="true" />
    <nav className="side" id="ana-menu" data-open={open} aria-label="Ana menü">
      <div className="brand">
        {active ? (
          <button type="button" className="logo brand-btn" aria-expanded={pick} aria-haspopup="true" disabled={brands.list.length < 2} onClick={() => setPick((v) => !v)} title={brands.list.length < 2 ? undefined : "Şirketi değiştir"}>
            <Mark b={active} />
            <span className="brand-name">{active.name}</span>
            {brands.list.length > 1 && <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3 5l4 4 4-4" /></svg>}
          </button>
        ) : (
          <Link className="logo brand-btn" href="/sirketler"><i>+</i><span className="brand-name">Şirket ekle</span></Link>
        )}
        {pick && (
          <div className="brand-menu" role="menu">
            {brands.list.map((b) => (
              <form key={b.id} action={switchCompany}>
                <input type="hidden" name="id" value={b.id} />
                <input type="hidden" name="back" value={path} />
                <button role="menuitemradio" aria-checked={b.id === active?.id} className="brand-item">
                  <Mark b={b} />
                  <span className="brand-name">{b.name}</span>
                </button>
              </form>
            ))}
            <Link className="brand-item" href="/sirketler">Şirketleri yönet</Link>
          </div>
        )}
      </div>
      {ITEMS.map((it) =>
        "group" in it ? (
          <div key={it.group} className="nav-group">
            {it.group}
          </div>
        ) : (
          <Link key={it.href} className="nav" href={it.href} aria-current={isActive(it.href) ? "page" : undefined}>
            {it.label}
            {it.badge && counts[it.badge] > 0 && <span className="badge on">{counts[it.badge]}</span>}
          </Link>
        ),
      )}
      <div className="side-foot">
        <span>
          <span className="status-dot" style={runner.ok ? undefined : { background: "var(--warn)" }} />
          {runner.text}
        </span>
        <span>{userName}</span>
        <form action="/cikis" method="post" className="nav-form">
          <button className="link" style={{ fontSize: 12 }}>
            Çıkış yap
          </button>
        </form>
      </div>
    </nav>
    </>
  );
}
