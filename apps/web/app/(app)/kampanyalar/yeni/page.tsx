import { prisma } from "@hfo/db";
import type { Metadata } from "next";
import Link from "next/link";
import { requireContext } from "@/lib/context";
import { WizardForm } from "./WizardForm";
import { PRESETS } from "./presets";

export const metadata: Metadata = { title: "Yeni kampanya" };

export default async function Page({ searchParams }: { searchParams: Promise<{ hazir?: string }> }) {
  const { hazir } = await searchParams;
  const preset = PRESETS.find((p) => p.id === hazir);
  const ctx = await requireContext();
  const accounts = await prisma.linkedinAccount.findMany({ where: { workspaceId: ctx.workspace.id }, select: { id: true, displayName: true } });
  return (
    <>
      <div className="crumbs" style={{ marginBottom: 8 }}>
        <Link className="link" href="/kampanyalar">Kampanyalar</Link>
        <span>/</span>
        <b>Yeni kampanya</b>
      </div>
      <h1>Yeni kampanya</h1>
      <p className="lede">Sorulara verdiğiniz cevaplardan mesaj taslakları hazırlanır. Taslakları sonra düzenleyip onaylarsınız.</p>
      <div className="row" style={{ gap: 8, flexWrap: "wrap", margin: "12px 0" }}>
        <span className="sub">Hazır başlangıç:</span>
        {PRESETS.map((p) => (
          <Link key={p.id} className={`btn${preset?.id === p.id ? " primary" : ""}`} href={`/kampanyalar/yeni?hazir=${p.id}`} title={p.hint}>{p.label}</Link>
        ))}
        {preset && <Link className="link" href="/kampanyalar/yeni">Temizle</Link>}
      </div>
      <WizardForm key={preset?.id ?? "bos"} initial={preset?.values} accounts={accounts.map((a) => ({ id: a.id, name: a.displayName }))} />
    </>
  );
}
