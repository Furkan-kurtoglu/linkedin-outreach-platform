import { describe, expect, it } from "vitest";
import { MAX_ACTIVE_AGENTS, buildTimeline, canActivateAgent, canUndo, deriveAlerts, onboardingProgress, toCsv, UNDO_WINDOW_MS } from "./index";

const now = new Date("2026-10-12T08:00:00Z");
const min = (n: number) => new Date(now.getTime() - n * 60_000);

describe("uyarılar", () => {
  const ok = { status: "CONNECTED" as const, runnerLastSeenAt: min(2), inSendingWindow: true, invitesLeftThisWeek: 50, pendingInvites: 10 };
  it("her şey yolundaysa uyarı yok", () => expect(deriveAlerts(ok, now)).toEqual([]));
  it("çalışan gönderim saatinde kapalıysa uyarır, saat dışında uyarmaz", () => {
    expect(deriveAlerts({ ...ok, runnerLastSeenAt: min(45) }, now).map((a) => a.kind)).toEqual(["RUNNER_OFFLINE"]);
    expect(deriveAlerts({ ...ok, runnerLastSeenAt: min(45), inSendingWindow: false }, now)).toEqual([]);
  });
  it("oturum düşmesi ve LinkedIn uyarısı", () => {
    expect(deriveAlerts({ ...ok, status: "NEEDS_LOGIN" }, now)[0]!.kind).toBe("SESSION_EXPIRED");
    const p = deriveAlerts({ ...ok, status: "PAUSED", pausedUntil: new Date(now.getTime() + 3_600_000) }, now);
    expect(p[0]!.kind).toBe("LINKEDIN_WARNING");
  });
  it("haftalık sınır dolunca bilgi verir", () => {
    expect(deriveAlerts({ ...ok, invitesLeftThisWeek: 0 }, now).map((a) => a.kind)).toEqual(["LIMIT_REACHED"]);
  });
});

describe("ilk giriş", () => {
  it("sıradaki adımı gösterir", () => {
    const p = onboardingProgress(["account", "schedule"]);
    expect(p.completed).toBe(2);
    expect(p.next).toBe("privacy");
    expect(onboardingProgress(p.steps.map((s) => s.key)).finished).toBe(true);
  });
});

describe("kişi geçmişi", () => {
  it("olayları yeniden eskiye sıralar", () => {
    const t = buildTimeline({
      createdAt: min(600), inviteSentAt: min(500), connectedAt: min(300),
      messages: [{ at: min(299), direction: "OUTBOUND", body: "Bağlantı için teşekkürler" }, { at: min(100), direction: "INBOUND", body: "Görüşelim" }],
      notes: [{ at: min(50), author: "Furkan", body: "Perşembe 14:00 demo" }],
      campaignName: "Özel hastaneler",
    });
    expect(t.map((e) => e.kind)).toEqual(["note", "reply", "message_sent", "connected", "invite_sent", "found"]);
  });
});

describe("geri alma", () => {
  it("süre içinde ve bir kez geri alınır", () => {
    expect(canUndo({ createdAt: min(5), undoData: { stage: "QUEUED" } }, now)).toBe(true);
    expect(canUndo({ createdAt: new Date(now.getTime() - UNDO_WINDOW_MS - 1), undoData: {} }, now)).toBe(false);
    expect(canUndo({ createdAt: min(5), undoData: {}, undoneAt: min(1) }, now)).toBe(false);
  });
});

describe("CSV", () => {
  it("Excel için BOM, noktalı virgül, tırnak ve formül koruması", () => {
    const csv = toCsv(
      [{ key: "ad", title: "Ad Soyad" }, { key: "kurum", title: "Kurum" }, { key: "not", title: "Not" }],
      [{ ad: "Ayşe Çınar", kurum: "Şifa; Hastanesi", not: '=HYPERLINK("x")' }],
    );
    expect(csv.startsWith("﻿Ad Soyad;Kurum;Not\r\n")).toBe(true);
    expect(csv).toContain('Ayşe Çınar;"Şifa; Hastanesi";"\'=HYPERLINK(""x"")"');
  });
});

describe("temsilci sınırı", () => {
  it("en fazla beş aktif temsilci", () => {
    expect(MAX_ACTIVE_AGENTS).toBe(5);
    expect(canActivateAgent(4)).toBe(true);
    expect(canActivateAgent(5)).toBe(false);
    expect(canActivateAgent(0, 1)).toBe(true);
  });
});
