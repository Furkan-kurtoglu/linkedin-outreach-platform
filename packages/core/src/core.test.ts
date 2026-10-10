import { describe, expect, it } from "vitest";
import {
  DEFAULT_SCHEDULE,
  acceptedMessageTime,
  dailyQuotas,
  invitesRemainingToday,
  normalizeName,
  planInviteTimes,
  prepareMessage,
  warmupBudget,
  type TemplateRules,
} from "./index";

const rules: TemplateRules = {
  bannedPhrases: ["öğrenmek isterim", "bağlantıda kalmak isterim", "20 dakika"],
  excludedCompanies: ["Acıbadem"],
  requiredLink: "https://www.healthfintel.com.tr/",
  premium: true,
};

describe("normalizeName", () => {
  it("LinkedIn'deki büyük harfli soyadları düzeltir", () => {
    expect(normalizeName("Huri CALAYIR")).toBe("Huri Calayır");
    expect(normalizeName("Ozan BAL")).toBe("Ozan Bal");
    expect(normalizeName("Ali okyay")).toBe("Ali Okyay");
    expect(normalizeName("  ismail   ercins ")).toBe("İsmail Ercins");
  });
});

describe("prepareMessage", () => {
  const note =
    "Merhaba {ad_soyad}, özel hastanelerde hasta kabul ve sigorta doğrulamayı hızlandıran HeAlthFintel'in kurucusuyum. Kurumlarla pilot anlaşmalarına başladık, sizinle de görüşmek isteriz.";

  it("geçerli davet notunu onaylar", () => {
    const r = prepareMessage(note, { ad_soyad: "Huri Calayır" }, "invite_note", rules);
    expect(r.ok).toBe(true);
    expect(r.text.startsWith("Merhaba Huri Calayır,")).toBe(true);
  });

  it("eksik değişkenle mesaj göndermez", () => {
    const r = prepareMessage(note, {}, "invite_note", rules);
    expect(r.ok).toBe(false);
    expect(r.issues[0]?.code).toBe("missing_variable");
  });

  it("yasak ifadeyi yakalar", () => {
    const r = prepareMessage(
      "Merhaba {ad_soyad}, sizinle Bağlantıda Kalmak İsterim.",
      { ad_soyad: "Ozan Bal" },
      "invite_note",
      rules,
    );
    expect(r.issues.some((i) => i.code === "banned_phrase")).toBe(true);
  });

  it("hariç tutulan kurumu yakalar", () => {
    const r = prepareMessage("Merhaba, Acıbadem ekibine selamlar.", {}, "invite_note", rules);
    expect(r.issues.some((i) => i.code === "excluded_company")).toBe(true);
  });

  it("Premium olmayan hesapta 200 karakter sınırını uygular", () => {
    const long = "a".repeat(250);
    expect(prepareMessage(long, {}, "invite_note", { ...rules, premium: true }).ok).toBe(true);
    expect(prepareMessage(long, {}, "invite_note", { ...rules, premium: false }).ok).toBe(false);
  });

  it("detay mesajında web sitesi linkini zorunlu tutar", () => {
    const r = prepareMessage("Bağlantı için teşekkürler.", {}, "message", rules);
    expect(r.issues.some((i) => i.code === "missing_link")).toBe(true);
  });
});

describe("davet bütçesi", () => {
  it("180 daveti 7 güne tam olarak dağıtır", () => {
    const q = dailyQuotas(180, DEFAULT_SCHEDULE.activeDays);
    const total = [...q.values()].reduce((a, b) => a + b, 0);
    expect(total).toBe(180);
    expect(Math.max(...q.values()) - Math.min(...q.values())).toBeLessThanOrEqual(1);
  });

  it("son 7 gün sınırını aşmaz", () => {
    const left = invitesRemainingToday({
      config: DEFAULT_SCHEDULE,
      weeklyBudget: 180,
      localDay: 2,
      sentToday: 0,
      sentLast7Days: 175,
    });
    expect(left).toBe(5);
  });

  it("ısınma döneminde bütçeyi azaltır", () => {
    expect(warmupBudget(180, 0)).toBe(60);
    expect(warmupBudget(180, 1)).toBe(120);
    expect(warmupBudget(180, 3)).toBe(180);
  });

  it("davetleri mesai penceresi içine yayar", () => {
    // 08:00 İstanbul = 05:00 UTC
    const now = new Date(Date.UTC(2026, 9, 12, 5, 0));
    let seed = 0.37;
    const rng = () => (seed = (seed * 9301 + 49297) % 233280 / 233280);
    const times = planInviteTimes({ now, count: 26, config: DEFAULT_SCHEDULE, rng });
    expect(times.length).toBeGreaterThan(20);
    for (const t of times) {
      const localMin = ((t.getUTCHours() * 60 + t.getUTCMinutes() + 180) % 1440);
      expect(localMin).toBeGreaterThanOrEqual(DEFAULT_SCHEDULE.windowStartMin);
      expect(localMin).toBeLessThanOrEqual(DEFAULT_SCHEDULE.windowEndMin);
    }
    for (let i = 1; i < times.length; i++) {
      const gap = (times[i]!.getTime() - times[i - 1]!.getTime()) / 60_000;
      expect(gap).toBeGreaterThanOrEqual(DEFAULT_SCHEDULE.minGapMin);
    }
  });

  it("kabulden sonra mesajı 1-5 dakika içinde planlar", () => {
    const at = new Date(Date.UTC(2026, 9, 12, 11, 0));
    const t = acceptedMessageTime(at, () => 0.5);
    const delay = (t.getTime() - at.getTime()) / 60_000;
    expect(delay).toBeGreaterThanOrEqual(1);
    expect(delay).toBeLessThanOrEqual(5);
  });
});
