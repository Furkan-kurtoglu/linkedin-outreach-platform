import { MAX_ACTIVE_AGENTS } from "@hfo/core";
import { prisma } from "@hfo/db";
import type { Metadata } from "next";
import Link from "next/link";
import { SubmitButton } from "@/components/SubmitButton";
import { requireContext } from "@/lib/context";
import { CompanyForm } from "./CompanyForm";
import { deleteCompany } from "./actions";

export const metadata: Metadata = { title: "Şirketler" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireContext();
  const sp = await searchParams;
  const [companies, activeTotal] = await Promise.all([
    prisma.company.findMany({
      where: { workspaceId: ctx.workspace.id },
      orderBy: { createdAt: "asc" },
      include: { agents: { select: { id: true, name: true, status: true } } },
    }),
    prisma.agent.count({ where: { workspaceId: ctx.workspace.id, status: "ACTIVE" } }),
  ]);
  const note = sp.eklendi ? "Şirket eklendi." : sp.kaydedildi ? "Değişiklikler kaydedildi." : sp.silindi ? "Şirket silindi." : null;

  return (
    <>
      <div className="head">
        <div>
          <h1>Şirketler</h1>
          <p className="lede" style={{ margin: 0 }}>Birden fazla şirket için çalışabilirsiniz; her şirketin kendi temsilcileri (kampanyaları) olur. Aynı anda en fazla {MAX_ACTIVE_AGENTS} temsilci aktif olabilir: şu an {activeTotal}/{MAX_ACTIVE_AGENTS}.</p>
        </div>
      </div>
      {note && <div className="banner"><div className="txt"><b>{note}</b></div></div>}
      {sp.uyari === "dolu" && (
        <div className="banner warning" role="alert">
          <span className="dot warn" style={{ marginTop: 6 }} />
          <div className="txt"><b>Temsilcisi olan şirket silinemez</b><p>Önce şirketin kampanyalarını silin.</p></div>
        </div>
      )}
      <div className="stack" style={{ gap: 16 }}>
        {companies.map((c) => (
          <div key={c.id} className="card">
            <div className="card-h">
              <div>
                <h2>{c.name}</h2>
                <span className="sub">{c.agents.length} temsilci · {c.agents.filter((a) => a.status === "ACTIVE").length} aktif</span>
              </div>
              <Link className="btn primary sm" href={`/kampanyalar/yeni?sirket=${c.id}`}>Bu şirkete temsilci ekle</Link>
            </div>
            <div className="card-b stack">
              {c.agents.length > 0 && (
                <div className="row">
                  {c.agents.map((a) => (
                    <Link key={a.id} className="tag t-mute" href={`/kampanyalar/${a.id}`}>{a.name}{a.status === "ACTIVE" ? " · aktif" : ""}</Link>
                  ))}
                </div>
              )}
              <details>
                <summary className="link">Şirket bilgilerini düzenle</summary>
                <div style={{ marginTop: 12, maxWidth: 560 }}><CompanyForm company={{ id: c.id, name: c.name, website: c.website, description: c.description }} /></div>
              </details>
              <form action={deleteCompany}>
                <input type="hidden" name="id" value={c.id} />
                <SubmitButton className="btn quiet danger sm" pendingText="Siliniyor…" disabled={c.agents.length > 0} title={c.agents.length > 0 ? "Temsilcisi olan şirket silinemez" : undefined}>Şirketi sil</SubmitButton>
              </form>
            </div>
          </div>
        ))}
        <div className="card" style={{ maxWidth: 620 }}>
          <div className="card-h"><h2>{companies.length ? "Yeni şirket ekle" : "İlk şirketinizi ekleyin"}</h2></div>
          <div className="card-b"><CompanyForm /></div>
        </div>
      </div>
    </>
  );
}
