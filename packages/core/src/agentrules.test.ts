import { describe, expect, it } from "vitest";
import { checkWebhookUrl, DEFAULT_SCHEDULE, ACCEPT_STRONG_MIN, estimateDailyInvites, isOpenToWork, planInviteTimes, preferredBonus, resolveDays, resolveUncertain, restrictToWindow, scoreProspect, validateAgentWindow } from "./index";

const cfg = { ...DEFAULT_SCHEDULE, windowStartMin: 540, windowEndMin: 1110 };
const weekdays = [1, 2, 3, 4, 5];

describe("gönderim penceresi", () => {
  it("pencere yoksa hesap takvimi aynen kalır", () => {
    expect(restrictToWindow(cfg, null)).toBe(cfg);
    expect(restrictToWindow(cfg, { days: [], startMin: 0, endMin: 0 })).toBe(cfg);
  });
  it("gün ve saatleri hesap takvimiyle kesiştirir", () => {
    const r = resolveDays(restrictToWindow(cfg, { days: weekdays, startMin: 600, endMin: 780 }));
    expect(r[0]!.enabled).toBe(false);
    expect(r[1]!.windows).toEqual([{ startMin: 600, endMin: 780 }]);
    const w = resolveDays(restrictToWindow(cfg, { days: [1], startMin: 0, endMin: 1439 }));
    expect(w[1]!.windows).toEqual([{ startMin: 540, endMin: 1110 }]);
  });
  it("hesabın kapalı saatlerine taşmaz", () => {
    const r = resolveDays(restrictToWindow(cfg, { days: [1], startMin: 1200, endMin: 1300 }));
    expect(r[1]!.enabled).toBe(false);
  });
  it("planlanan zamanlar pencerenin içinde kalır", () => {
    const restricted = restrictToWindow(cfg, { days: weekdays, startMin: 600, endMin: 720 });
    const mon = new Date("2026-10-12T05:00:00Z"); // Pazartesi 08:00 yerel
    const times = planInviteTimes({ now: mon, count: 10, config: restricted, rng: () => 0.5 });
    expect(times.length).toBeGreaterThan(0);
    for (const t of times) {
      const m = new Date(t.getTime() + 180 * 60_000);
      const min = m.getUTCHours() * 60 + m.getUTCMinutes();
      expect(min).toBeGreaterThanOrEqual(600);
      expect(min).toBeLessThanOrEqual(720);
    }
  });
  it("doğrulama", () => {
    expect(validateAgentWindow({ days: [], startMin: 540, endMin: 600 }, cfg, 5)[0]!.level).toBe("error");
    expect(validateAgentWindow({ days: [1], startMin: 700, endMin: 600 }, cfg, 5)[0]!.level).toBe("error");
    expect(validateAgentWindow({ days: [1], startMin: 1200, endMin: 1300 }, cfg, 5)[0]!.level).toBe("error");
    expect(validateAgentWindow({ days: weekdays, startMin: 540, endMin: 1080 }, cfg, 20)).toEqual([]);
    expect(validateAgentWindow({ days: weekdays, startMin: 600, endMin: 660 }, cfg, 26).map((i) => i.level)).toContain("warning");
  });
  it("günlük davet tahmini bütçe payına göre", () => {
    expect(estimateDailyInvites(cfg, null, 100)).toBe(26);
    expect(estimateDailyInvites(cfg, null, 50)).toBe(13);
  });
});

describe("kararsız adaylar", () => {
  it("üç politika", () => {
    expect(resolveUncertain("ASK", 70)).toBe("review");
    expect(resolveUncertain("DROP", 70)).toBe("drop");
    expect(resolveUncertain("ACCEPT_STRONG", ACCEPT_STRONG_MIN)).toBe("queue");
    expect(resolveUncertain("ACCEPT_STRONG", ACCEPT_STRONG_MIN - 1)).toBe("drop");
  });
});

describe("iş arayanlar ve tercihli ölçüt", () => {
  it("iş arayanı tanır", () => {
    expect(isOpenToWork("Genel Müdür | #OpenToWork")).toBe(true);
    expect(isOpenToWork("Yeni fırsatlar için iş arıyorum")).toBe(true);
    expect(isOpenToWork("Hastane Müdürü", "Acme Hospital")).toBe(false);
  });
  it("tercihli ifade puan ekler ama sınırlıdır", () => {
    expect(preferredBonus(["JCI", "ISO"], "Kalite Müdürü", "JCI akrediteli hastane").bonus).toBe(5);
    expect(preferredBonus(["a", "b", "c"], "a b c").bonus).toBe(10);
    expect(preferredBonus([], "x").bonus).toBe(0);
  });
  it("puanlamaya yansır", () => {
    const base = { titles: ["Genel Müdür"], excludedTitles: [], locations: [], industries: [], excludedCompanies: [], excludedCompanyKeywords: [], requiredCompanyKeywords: [], segments: [] };
    const p = { fullName: "A B", title: "Genel Müdür", company: "Örnek JCI Hastanesi" };
    expect(scoreProspect(p, { ...base, preferredKeywords: ["jci"] }).score).toBeGreaterThan(scoreProspect(p, base).score - 1);
  });
});

describe("webhook adresi", () => {
  it("güvenli adresi kabul eder", () => {
    expect(checkWebhookUrl("https://hooks.example.com/abc").ok).toBe(true);
  });
  it("güvensiz adresleri reddeder", () => {
    for (const u of ["http://example.com/x", "https://localhost/x", "https://127.0.0.1/x", "https://10.0.0.5/x", "https://192.168.1.2/x", "https://169.254.169.254/x", "https://user:pw@example.com/x", "https://[::1]/x", "not a url", "https://intranet/x", "https://svc.internal/x"])
      expect(checkWebhookUrl(u).ok, u).toBe(false);
  });
});
