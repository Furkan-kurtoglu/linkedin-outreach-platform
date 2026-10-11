import { resolveDays, type DaySchedule } from "@hfo/core";
import { prisma } from "@hfo/db";
import type { Metadata } from "next";
import { SubmitButton } from "@/components/SubmitButton";
import { requireContext } from "@/lib/context";
import { toScheduleConfig } from "@/lib/convert";
import { createAccount, saveLimits, togglePause } from "./actions";
import { ScheduleEditor } from "./ScheduleEditor";
import { TokenBox } from "./TokenBox";

export const metadata: Metadata = { title: "LinkedIn hesapları" };

const STATUS: Record<string, { text: string; tone: string }> = {
  CONNECTED: { text: "Bağlı", tone: "t-good" },
  NEEDS_LOGIN: { text: "Giriş gerekli", tone: "t-warn" },
  PAUSED: { text: "Duraklatıldı", tone: "t-warn" },
  DISCONNECTED: { text: "Bağlı değil", tone: "t-mute" },
};

const fmt = (d: Date) => d.toLocaleString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });

export default async function Page() {
  const ctx = await requireContext();
  const accounts = await prisma.linkedinAccount.findMany({ where: { workspaceId: ctx.workspace.id }, orderBy: { createdAt: "asc" } });
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  const dayStart = new Date(new Date().setHours(0, 0, 0, 0));

  return (
    <>
      <h1>LinkedIn hesapları</h1>
      <p className="lede">Her hesap, sahibinin bilgisayarındaki yerel çalışanla bağlanır. LinkedIn şifresi hiçbir yerde saklanmaz; bilgisayar kapalıyken bekleyen işler açılınca gönderilir.</p>

      {accounts.length === 0 && (
        <form action={createAccount} className="card" style={{ maxWidth: 560 }}>
          <div className="card-h"><h2>LinkedIn hesabı ekle</h2></div>
          <div className="card-b stack">
            <div className="field">
              <label htmlFor="displayName">Hesap adı</label>
              <input type="text" id="displayName" name="displayName" defaultValue={ctx.user.name ?? ""} placeholder="Ör. Furkan Kurtoğlu" />
              <span className="help">Panelde görünecek ad. LinkedIn bilgileri istenmez.</span>
            </div>
            <label className="check"><input type="checkbox" name="premium" /><span><b>Premium hesap</b><div className="sub">Davet notu sınırı 300 karakter olur, InMail kullanılabilir.</div></span></label>
            <SubmitButton>Hesabı ekle</SubmitButton>
          </div>
        </form>
      )}

      {await Promise.all(
        accounts.map(async (a) => {
          const cfg = toScheduleConfig(a);
          const s = (a.schedule ?? {}) as { mode?: "auto" | "manual" };
          const days: DaySchedule[] = resolveDays(cfg);
          const [invWeek, msgToday, pending] = await Promise.all([
            prisma.job.count({ where: { linkedinAccountId: a.id, type: "SEND_INVITE", status: "DONE", finishedAt: { gte: weekAgo } } }),
            prisma.job.count({ where: { linkedinAccountId: a.id, type: { in: ["SEND_MESSAGE", "SEND_INMAIL"] }, status: "DONE", finishedAt: { gte: dayStart } } }),
            prisma.agentProspect.count({ where: { stage: "INVITE_SENT", agent: { linkedinAccountId: a.id } } }),
          ]);
          const st = STATUS[a.status]!;
          const seen = a.runnerLastSeenAt ? Math.round((Date.now() - a.runnerLastSeenAt.getTime()) / 60_000) : null;
          return (
            <div key={a.id} className="stack" style={{ gap: 16 }}>
              <ScheduleEditor id={a.id} name={a.displayName} initial={{ mode: s.mode === "manual" ? "manual" : "auto", weekly: a.weeklyInvites, days }} />
              <div className="grid g2">
                <div className="card">
                  <div className="card-h">
                    <div>
                      <h2>{a.displayName}</h2>
                      <span className="sub">{a.premium ? "Premium" : "Standart"}{a.connectedAt ? ` · bağlandı ${fmt(a.connectedAt)}` : ""}</span>
                    </div>
                    <span className={`tag ${st.tone}`}>{st.text}</span>
                  </div>
                  <div className="card-b stack">
                    <div className="grid g3">
                      <div><div className="sub">Bu hafta davet</div><div style={{ font: "500 18px var(--mono)" }}>{invWeek + a.externalInvites7d}/{a.weeklyInvites}</div></div>
                      <div><div className="sub">Bugün mesaj</div><div style={{ font: "500 18px var(--mono)" }}>{msgToday}/{a.dailyMessageLimit}</div></div>
                      <div><div className="sub">Bekleyen davet</div><div style={{ font: "500 18px var(--mono)" }}>{pending}</div></div>
                    </div>
                    {(a.externalInvites7d > 0 || a.inmailCredits != null) && (
                      <p className="help" style={{ margin: 0 }}>
                        {a.externalInvites7d > 0 && `LinkedIn'den elle gönderdiğiniz ${a.externalInvites7d} davet bu haftanın bütçesinden düşüldü. `}
                        {a.inmailCredits != null && `Kalan InMail kredisi: ${a.inmailCredits}.`}
                      </p>
                    )}
                    <form action={saveLimits} className="stack">
                      <input type="hidden" name="id" value={a.id} />
                      <div className="field"><label htmlFor={`dn-${a.id}`}>Hesap adı</label><input type="text" id={`dn-${a.id}`} name="displayName" defaultValue={a.displayName} /></div>
                      <div className="field">
                        <label htmlFor={`dm-${a.id}`}>Günlük mesaj sınırı</label>
                        <input type="number" id={`dm-${a.id}`} name="dailyMessageLimit" defaultValue={a.dailyMessageLimit} min={10} max={150} style={{ maxWidth: 140 }} />
                        <span className="help">Kabulde giden mesajlar, takipler ve mevcut bağlantılara mesajlar. Davet hedefinden ayrıdır.</span>
                      </div>
                      <label className="check"><input type="checkbox" name="premium" defaultChecked={a.premium} /><span><b>Premium hesap</b><div className="sub">Çalışan bağlanınca kendisi de algılar.</div></span></label>
                      <label className="check"><input type="checkbox" name="warmup" defaultChecked={a.warmupEnabled} /><span><b>Isınma</b><div className="sub">İlk hafta hedefin üçte biri, ikinci hafta üçte ikisi gönderilir.</div></span></label>
                      <div className="row"><SubmitButton className="btn">Kaydet</SubmitButton></div>
                    </form>
                    <form action={togglePause}>
                      <input type="hidden" name="id" value={a.id} />
                      <SubmitButton className="btn" pendingText="Bekleyin…">{a.status === "PAUSED" ? "Gönderime devam et" : "24 saat duraklat"}</SubmitButton>
                    </form>
                  </div>
                </div>
                <div className="stack">
                  <div className="card">
                    <div className="card-h"><h2>Yerel çalışan</h2>{a.runnerTokenHash ? <span className={`tag ${seen != null && seen <= 20 ? "t-good" : "t-warn"}`}>{seen != null && seen <= 20 ? "Çalışıyor" : "Bağlı değil"}</span> : <span className="tag t-mute">Kurulmadı</span>}</div>
                    <div className="card-b stack">
                      {a.runnerTokenHash && (
                        <ul className="checks">
                          <li><span className={`dot ${seen != null && seen <= 20 ? "ok" : "warn"}`} />{seen == null ? "Henüz bağlanmadı" : `${a.runnerPlatform ?? "Bilgisayar"} · son sinyal ${seen < 1 ? "az önce" : `${seen} dakika önce`}`}</li>
                          <li><span className={`dot ${a.status === "CONNECTED" ? "ok" : "warn"}`} />{a.status === "NEEDS_LOGIN" ? "LinkedIn'e giriş gerekiyor (çalışanın açtığı pencerede)" : a.status === "PAUSED" ? `Duraklatıldı${a.pausedUntil ? ` · ${fmt(a.pausedUntil)}'e kadar` : ""}` : "LinkedIn oturumu açık"}</li>
                          {a.runnerVersion && <li><span className="dot ok" />Sürüm {a.runnerVersion}</li>}
                        </ul>
                      )}
                      <TokenBox id={a.id} hasToken={!!a.runnerTokenHash} />
                      <p className="help" style={{ margin: 0 }}>Kurulum: depodaki <b>KURULUM.md</b> dosyası (Windows ve Mac adımları).</p>
                    </div>
                  </div>
                  <div className="card">
                    <div className="card-h"><h2>Hesap sağlığı</h2></div>
                    <div className="card-b">
                      <ul className="checks">
                        <li><span className={`dot ${a.lastWarning && a.status === "PAUSED" ? "no" : "ok"}`} />{a.lastWarning && a.status === "PAUSED" ? a.lastWarning : "LinkedIn uyarısı yok"}</li>
                        <li><span className={`dot ${pending > 150 ? "warn" : "ok"}`} />{pending} bekleyen davet; {21} günü geçenler otomatik geri çekilir</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        }),
      )}
    </>
  );
}
