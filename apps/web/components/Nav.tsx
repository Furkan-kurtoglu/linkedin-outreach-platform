"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS: ({ href: string; label: string; badge?: "queue" | "inbox" } | { group: string })[] = [
  { href: "/", label: "Genel bakış" },
  { group: "Çalışma" },
  { href: "/kampanyalar", label: "Kampanyalar" },
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
  const active = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`) || (href === "/kampanyalar" && path.startsWith("/kisiler/")));
  return (
    <nav className="side" aria-label="Ana menü">
      <div className="logo">
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
  );
}
