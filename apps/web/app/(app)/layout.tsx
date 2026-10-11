import { prisma } from "@hfo/db";
import Link from "next/link";
import { Nav } from "@/components/Nav";
import { requireContext } from "@/lib/context";
import { companyBrands } from "@/lib/company";
import { navCounts, workspaceAlerts } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireContext();
  const [counts, alerts, account, brands] = await Promise.all([
    navCounts(ctx.workspace.id),
    workspaceAlerts(ctx.workspace.id),
    prisma.linkedinAccount.findFirst({ where: { workspaceId: ctx.workspace.id }, orderBy: { createdAt: "asc" } }),
    companyBrands(ctx.workspace.id),
  ]);
  const seenMin = account?.runnerLastSeenAt ? Math.round((Date.now() - account.runnerLastSeenAt.getTime()) / 60_000) : null;
  const runner =
    !account || !account.runnerTokenHash
      ? { ok: false, text: "Yerel çalışan kurulmadı" }
      : seenMin != null && seenMin <= 20
        ? { ok: true, text: `Yerel çalışan bağlı${account.runnerPlatform ? ` · ${account.runnerPlatform}` : ""}` }
        : { ok: false, text: seenMin == null ? "Yerel çalışan hiç bağlanmadı" : `Yerel çalışan ${seenMin} dk önce görüldü` };

  return (
    <div className="app">
      <Nav brands={brands} counts={counts} runner={runner} userName={ctx.user.name ?? ctx.user.email} />
      <div style={{ minWidth: 0 }}>
        <main>
          {alerts.map((a, i) => (
            <div key={i} className={`banner ${a.severity}`} role="alert">
              <span className={`dot ${a.severity === "error" ? "no" : "warn"}`} style={{ marginTop: 6 }} />
              <div className="txt">
                <b>{a.message}</b>
                <p>{a.action}</p>
              </div>
              <Link className="btn sm" href="/hesaplar">
                Hesaba git
              </Link>
            </div>
          ))}
          {children}
        </main>
      </div>
    </div>
  );
}
