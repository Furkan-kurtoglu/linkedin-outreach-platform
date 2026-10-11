import type { Metadata } from "next";
import Link from "next/link";
import { SubmitButton } from "@/components/SubmitButton";
import { loadCampaign } from "@/lib/campaign";
import { requireContext } from "@/lib/context";
import { prisma } from "@hfo/db";
import { setStatus } from "./actions";
import { FlowTab } from "./tabs/Flow";
import { MessagesTab } from "./tabs/Messages";
import { OptionsTab } from "./tabs/Options";
import { PeopleTab } from "./tabs/People";
import { ResultsTab } from "./tabs/Results";
import { TargetingTab } from "./tabs/Targeting";

export const metadata: Metadata = { title: "Kampanya" };

const TABS = [
  ["akis", "Akış"],
  ["hedefleme", "Hedefleme"],
  ["kisiler", "Kişiler"],
  ["mesajlar", "Mesajlar"],
  ["secenekler", "Seçenekler"],
  ["sonuclar", "Sonuçlar"],
] as const;
type Tab = (typeof TABS)[number][0];

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireContext();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const c = await loadCampaign(ctx, id);
  const tab: Tab = (TABS.find(([k]) => k === sp.sekme)?.[0] ?? "akis") as Tab;
  const optionsOn = [c.firstLineEnabled, c.calendarEnabled, c.englishEnabled, c.openProfileEnabled, c.inmailEnabled].filter(Boolean).length;
  const reviewCount = await prisma.agentProspect.count({ where: { agentId: c.id, stage: "NEEDS_REVIEW" } });
  const [statusLabel, tone] = ({ ACTIVE: ["Aktif", "t-good"], PAUSED: ["Duraklatıldı", "t-mute"], DRAFT: ["Taslak", "t-warn"] } as const)[c.status];

  return (
    <>
      <div className="crumbs" style={{ marginBottom: 8 }}>
        <Link className="link" href="/kampanyalar">Kampanyalar</Link>
        <span>/</span>
        <b>{c.name}</b>
      </div>
      <div className="head">
        <div>
          <div className="row">
            <h1>{c.name}</h1>
            <span className={`tag ${tone}`}>{statusLabel}</span>
          </div>
          <p className="lede" style={{ margin: 0 }}>Gönderen: {c.linkedinAccount.displayName} · haftalık bütçenin %{c.budgetSharePct}&apos;i</p>
        </div>
        <form action={setStatus} className="row">
          <input type="hidden" name="id" value={c.id} />
          <input type="hidden" name="to" value={c.status === "ACTIVE" ? "PAUSED" : "ACTIVE"} />
          <SubmitButton className={c.status === "ACTIVE" ? "btn" : "btn primary"} pendingText="Bekleyin…">
            {c.status === "ACTIVE" ? "Duraklat" : c.status === "DRAFT" ? "Kampanyayı başlat" : "Devam ettir"}
          </SubmitButton>
        </form>
      </div>
      {sp.uyari === "onay" && (
        <div className="banner warning" role="alert">
          <span className="dot warn" style={{ marginTop: 6 }} />
          <div className="txt"><b>Başlatmak için en az bir metni onaylayın</b><p>Davet notu, kabulde mesaj ya da bağlantıya ilk mesaj onaylı olmalı. Yalnızca onaylı metinler gönderilir.</p></div>
        </div>
      )}
      <div className="tabs" role="tablist">
        {TABS.map(([k, l]) => (
          <Link key={k} className="tab" role="tab" aria-selected={tab === k} href={`/kampanyalar/${c.id}?sekme=${k}`}>
            {l}
            {k === "secenekler" && optionsOn > 0 && <> <span className="badge">{optionsOn}</span></>}
            {k === "kisiler" && reviewCount > 0 && <> <span className="badge">{reviewCount}</span></>}
          </Link>
        ))}
      </div>
      {tab === "akis" && <FlowTab campaign={c} sp={sp} />}
      {tab === "hedefleme" && <TargetingTab campaign={c} sp={sp} />}
      {tab === "kisiler" && <PeopleTab campaign={c} sp={sp} />}
      {tab === "mesajlar" && <MessagesTab campaign={c} sp={sp} />}
      {tab === "secenekler" && <OptionsTab campaign={c} sp={sp} />}
      {tab === "sonuclar" && <ResultsTab campaign={c} sp={sp} />}
    </>
  );
}
