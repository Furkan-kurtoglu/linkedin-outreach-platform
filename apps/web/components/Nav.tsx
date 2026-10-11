"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

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

export function Nav({ counts, runner, userName }: { counts: { queue: number; inbox: number }; runner: { ok: boolean; text: string }; userName: string }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  // Sayfa değişince çekmece kapanır; açıkken Esc kapatır ve arka plan kaymaz
  useEffect(() => setOpen(false), [path]);
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
  const active = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`) || (href === "/kampanyalar" && path.startsWith("/kisiler/")));
  return (
    <>
    <header className="topbar">
      <div className="logo"><i>H</i>HeAlthFintel</div>
      <button type="button" className="menu-btn" aria-expanded={open} aria-controls="ana-menu" onClick={() => setOpen((v) => !v)}>
        <span className="sr">{open ? "Menüyü kapat" : "Menüyü aç"}</span>
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          {open ? <path d="M4 4l12 12M16 4L4 16" /> : <path d="M3 5h14M3 10h14M3 15h14" />}
        </svg>
      </button>
    </header>
    <div className="scrim" data-open={open} onClick={() => setOpen(false)} aria-hidden="true" />
    <nav className="side" id="ana-menu" data-open={open} aria-label="Ana menü">
      <div className="logo desk">
        <i>H</i>HeAlthFintel
      </div>
      {ITEMS.map((it) =>
        "group" in it ? (
          <div key={it.group} className="nav-group">
            {it.group}
          </div>
        ) : (
          <Link key={it.href} className="nav" href={it.href} aria-current={active(it.href) ? "page" : undefined}>
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
