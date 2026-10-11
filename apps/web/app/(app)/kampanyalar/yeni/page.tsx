import { FUNCTION_LABEL, SIZE_STRATEGY_LABEL, parseStrategyFunctions, strategyFor, type StrategySize } from "@hfo/core";
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

export default async function Page({ searchParams }: { searchParams: Promise<{ hazir?: string; sirket?: string; uyari?: string; sektor?: string; islev?: string | string[]; boyut?: string }> }) {
  const { hazir, sirket, uyari, sektor, islev, boyut } = await searchParams;
  const size = (["kucuk", "orta", "buyuk", "hepsi"].includes(boyut ?? "") ? boyut : "hepsi") as StrategySize;
  const funcs = parseStrategyFunctions(islev);
  const plan = sektor?.trim() ? strategyFor({ sector: sektor, functions: funcs, size }) : null;
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
      <form method="get" className="card" style={{ marginBottom: 12 }}>
        {company && <input type="hidden" name="sirket" value={company.id} />}
        <div className="card-h"><h2>Sektörden strateji üret</h2><span className="sub">Gıda, otomotiv, enerji… her sektörde aynı yöntem</span></div>
        <div className="card-b stack">
          <p className="sub" style={{ margin: 0 }}>Sektörü, hangi bölümle konuşmak istediğinizi ve hedef şirket boyutunu seçin; hedef unvanlar, şirket arama sözcükleri ve hariç tutmalar aşağıdaki forma dolar. Sözlükte olmayan bir sektör yazarsanız yazdığınız sözcükten genel bir arama türetilir.</p>
          <div className="grid g2">
            <div className="field"><label htmlFor="st-sektor">Sektör</label><input type="text" id="st-sektor" name="sektor" defaultValue={sektor ?? ""} placeholder="ör. gıda, otomotiv, lojistik, enerji" /></div>
            <div className="field"><label htmlFor="st-boyut">Şirket boyutu</label><select id="st-boyut" name="boyut" defaultValue={size}>{Object.entries(SIZE_STRATEGY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          </div>
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="sub">Kiminle konuşmak istiyorsunuz? (birden çok seçilebilir)</legend>
            <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
              {Object.entries(FUNCTION_LABEL).map(([v, l]) => <label key={v} className="check" style={{ borderBottom: 0, padding: 0 }}><input type="checkbox" name="islev" value={v} defaultChecked={funcs.includes(v as keyof typeof FUNCTION_LABEL)} /><span>{l}</span></label>)}
            </div>
          </fieldset>
          <div className="row"><button className="btn primary">Strateji üret</button></div>
          {plan && (
            <div className="banner" role="status">
              <div className="txt">
                <b>{plan.sectorLabel}: {plan.titles.length} unvan, {plan.companyKeywords.length} şirket arama sözcüğü hazır{plan.known ? "" : " (genel kural)"}</b>
                {plan.notes.map((n) => <p key={n}>{n}</p>)}
                <p>Şirket arama sözcükleri: {plan.companyKeywords.join(" · ")}</p>
                <p><Link className="link" href={`/kurumlar?anahtar=${encodeURIComponent(plan.companyKeywords.join("\n"))}`}>Bu sözcüklerle LinkedIn'de şirket ara</Link> (Kurum Ar-Ge)</p>
              </div>
            </div>
          )}
        </div>
      </form>
      <div className="row" style={{ gap: 8, flexWrap: "wrap", margin: "12px 0" }}>
        <span className="sub">Hazır başlangıç:</span>
        {PRESETS.map((p) => (
          <Link key={p.id} className={`btn${preset?.id === p.id ? " primary" : ""}`} href={`/kampanyalar/yeni?hazir=${p.id}${company ? `&sirket=${company.id}` : ""}`} title={p.hint}>{p.label}</Link>
        ))}
        {preset && <Link className="link" href={`/kampanyalar/yeni${company ? `?sirket=${company.id}` : ""}`}>Temizle</Link>}
      </div>
      <WizardForm key={`${preset?.id ?? "bos"}-${company?.id ?? ""}-${plan ? `${sektor}-${size}-${funcs.join("")}` : ""}`} initial={{ ...(preset?.values ?? {}), ...(plan ? { titles: plan.titles.join("\n"), excludedTitles: plan.excludedTitles.join("\n"), requiredCompanyKeywords: plan.requiredCompanyKeywords.join("\n"), excludedCompanyKeywords: plan.excludedCompanyKeywords.join("\n") } : {}), ...(company ? { companyId: company.id, companyName: company.name } : {}) }} companies={companies} accounts={accounts.map((a) => ({ id: a.id, name: a.displayName }))} />
    </>
  );
}
