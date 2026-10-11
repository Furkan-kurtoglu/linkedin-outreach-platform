import { prisma } from "@hfo/db";
import type { Metadata } from "next";
import Link from "next/link";
import { requireContext } from "@/lib/context";
import { WizardForm } from "./WizardForm";

export const metadata: Metadata = { title: "Yeni kampanya" };

export default async function Page() {
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
      <WizardForm accounts={accounts.map((a) => ({ id: a.id, name: a.displayName }))} />
    </>
  );
}
