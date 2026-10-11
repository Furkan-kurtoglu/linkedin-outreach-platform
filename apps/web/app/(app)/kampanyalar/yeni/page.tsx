import { prisma } from "@hfo/db";
import type { Metadata } from "next";
import Link from "next/link";
import { requireContext } from "@/lib/context";
import { companyBrands } from "@/lib/company";
import { SubmitButton } from "@/components/SubmitButton";
import { createPresetAgents } from "./actions";
import { WizardForm } from "./WizardForm";
import { PRESETS } from "./presets";

export const metadata: Metadata = { title: "Yeni kampanya" };

export default async function Page({ searchParams }: { searchParams: Promise<{ hazir?: string; sirket?: string; uyari?: string }> }) {
  const { hazir, sirket, uyari } = await searchParams;
  const preset = PRESETS.find((p) => p.id === hazir);
  const ctx = await requireContext();
  const companies = await prisma.company.findMany({ where: { workspaceId: ctx.workspace.id }, orderBy: { createdAt: "asc" }, select: { id: true, name: true } });
  const brands = await companyBrands(ctx.workspace.id);
  const company = companies.find((c) => c.id === sirket) ?? companies.find((c) => c.id === brands.active?.id) ?? companies[0];
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
      {uyari === "hesap" && (
        <div className="banner warning" role="alert">
          <div className="txt">
            <b>Önce bir LinkedIn hesabı ekleyin.</b>
            <p>Temsilciler bir hesabın davet bütçesini kullanır. Hesaplar sayfasından ekleyip yerel çalışanı bağladıktan sonra tekrar deneyin.</p>
          </div>
          <Link className="btn sm" href="/hesaplar">Hesaplar</Link>
        </div>
      )}
      <form action={createPresetAgents} className="card" style={{ marginBottom: 12 }}>
        <div className="card-b row between">
          <div className="txt" style={{ flex: "1 1 280px", minWidth: 0 }}>
            <b>HeAlthFintel için üç temsilciyi tek adımda kur</b>
            <p className="sub" style={{ margin: "2px 0 0" }}>Özel hastaneler, özel sağlık sigortası şirketleri ve butik klinikler taslak olarak oluşur; hiçbiri kendiliğinden başlamaz. Mesajları sonra inceleyip etkinleştirirsiniz.</p>
          </div>
          <SubmitButton className="btn primary" pendingText="Kuruluyor…">Üç temsilciyi kur</SubmitButton>
        </div>
      </form>
      <div className="row" style={{ gap: 8, flexWrap: "wrap", margin: "12px 0" }}>
        <span className="sub">Hazır başlangıç:</span>
        {PRESETS.map((p) => (
          <Link key={p.id} className={`btn${preset?.id === p.id ? " primary" : ""}`} href={`/kampanyalar/yeni?hazir=${p.id}${company ? `&sirket=${company.id}` : ""}`} title={p.hint}>{p.label}</Link>
        ))}
        {preset && <Link className="link" href={`/kampanyalar/yeni${company ? `?sirket=${company.id}` : ""}`}>Temizle</Link>}
      </div>
      <WizardForm key={`${preset?.id ?? "bos"}-${company?.id ?? ""}`} initial={{ ...(preset?.values ?? {}), ...(company ? { companyId: company.id, companyName: company.name } : {}) }} companies={companies} accounts={accounts.map((a) => ({ id: a.id, name: a.displayName }))} />
    </>
  );
}
