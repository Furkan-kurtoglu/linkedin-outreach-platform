import type { Metadata } from "next";
import Link from "next/link";
import { SubmitButton } from "@/components/SubmitButton";
import { loadCampaign } from "@/lib/campaign";
import { requireContext } from "@/lib/context";
import { MAX_ACTIVE_AGENTS } from "@hfo/core";
import { prisma } from "@hfo/db";
import { setStatus } from "./actions";
import { FlowTab } from "./tabs/Flow";
import { InstitutionsTab } from "./tabs/Institutions";
import { MessagesTab } from "./tabs/Messages";
import { PeopleTab } from "./tabs/People";
import { OverviewTab } from "./tabs/Overview";
import { SECTIONS, SettingsTab, type Section } from "./tabs/settings/Settings";

export const metadata: Metadata = { title: "Kampanya" };

const TABS = [
  ["genel", "Genel bakış"],
  ["kisiler", "Kişiler"],
  ["kurumlar", "Kurumlar"],
  ["akis", "Akış"],
  ["mesajlar", "Mesajlar"],
  ["ayarlar", "Ayarlar"],
] as const;
type Tab = (typeof TABS)[number][0];

/** Eski adresler: sekme anahtarları ayarlar alt menüsüne taşındı. */
const LEGACY: Record<string, [Tab, Section | undefined]> = { hedefleme: ["ayarlar", "hedefleme"], secenekler: ["ayarlar", "secenekler"], sonuclar: ["genel", undefined] };

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireContext();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const c = await loadCampaign(ctx, id);
  const legacy = sp.sekme ? LEGACY[sp.sekme] : undefined;
  const tab: Tab = legacy?.[0] ?? (TABS.find(([k]) => k === sp.sekme)?.[0] ?? "genel");
  const section: Section = (SECTIONS.find(([k]) => k === (legacy?.[1] ?? sp.bolum))?.[0] ?? "genel") as Section;
  const optionsOn = [c.firstLineEnabled, c.calendarEnabled, c.englishEnabled, c.openProfileEnabled, c.inmailEnabled].filter(Boolean).length;
  const company = c.companyId ? await prisma.company.findUnique({ where: { id: c.companyId }, select: { name: true } }) : null;
  const accountCount = await prisma.targetAccount.count({ where: { agentId: c.id } });
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
          <p className="lede" style={{ margin: 0 }}>{company ? `${company.name} · ` : ""}Gönderen: {c.linkedinAccount.displayName} · haftalık bütçenin %{c.budgetSharePct}&apos;i</p>
        </div>
        <form action={setStatus} className="row">
          <input type="hidden" name="id" value={c.id} />
          <input type="hidden" name="to" value={c.status === "ACTIVE" ? "PAUSED" : "ACTIVE"} />
          <SubmitButton className={c.status === "ACTIVE" ? "btn" : "btn primary"} pendingText="Bekleyin…">
            {c.status === "ACTIVE" ? "Duraklat" : c.status === "DRAFT" ? "Kampanyayı başlat" : "Devam ettir"}
          </SubmitButton>
        </form>
      </div>
      {sp.uyari === "sinir" && (
        <div className="banner warning" role="alert">
          <span className="dot warn" style={{ marginTop: 6 }} />
          <div className="txt"><b>Aynı anda en fazla {MAX_ACTIVE_AGENTS} temsilci aktif olabilir</b><p>Başlatmak için önce aktif temsilcilerden birini duraklatın.</p></div>
        </div>
      )}
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
            {k === "ayarlar" && optionsOn > 0 && <> <span className="badge">{optionsOn}</span></>}
            {k === "kurumlar" && accountCount > 0 && <> <span className="badge">{accountCount}</span></>}
            {k === "kisiler" && reviewCount > 0 && <> <span className="badge">{reviewCount}</span></>}
          </Link>
        ))}
      </div>
      {tab === "genel" && <OverviewTab campaign={c} sp={sp} />}
      {tab === "akis" && <FlowTab campaign={c} sp={sp} />}
      {tab === "kisiler" && <PeopleTab campaign={c} sp={sp} />}
      {tab === "kurumlar" && <InstitutionsTab campaign={c} sp={sp} />}
      {tab === "mesajlar" && <MessagesTab campaign={c} sp={sp} />}
      {tab === "ayarlar" && <SettingsTab campaign={c} sp={sp} section={section} />}
    </>
  );
}
