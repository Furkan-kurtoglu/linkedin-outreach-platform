import { describe, expect, it } from "vitest";
import {
  DEFAULT_PERSONALIZATION,
  DEFAULT_SCHEDULE,
  allocateInvites,
  buildFirstLine,
  calendarSentence,
  canReinvite,
  chooseCampaign,
  chooseLanguage,
  countExternalInvites,
  defaultSequence,
  detectLanguage,
  dispatchTime,
  generateTemplates,
  messagesRemainingToday,
  nextAction,
  nextOpenSlot,
  optionalValues,
  pickMessagesForToday,
  renderForPerson,
  renderTemplate,
  rulesFromAnswers,
  type PersonalizationOptions,
  type ScheduleConfig,
  type WizardAnswers,
} from "./index";

const tr = (h: number, m = 0, day = 12) => new Date(Date.UTC(2026, 9, day, h - 3, m)); // İstanbul saati -> UTC
const localHM = (d: Date) => {
  const x = new Date(d.getTime() + 3 * 3_600_000);
  return x.getUTCHours() * 60 + x.getUTCMinutes();
};

const cfg: ScheduleConfig = {
  ...DEFAULT_SCHEDULE,
  days: Array.from({ length: 7 }, (_, d) => ({
    enabled: d !== 0,
    windows: [{ startMin: 540, endMin: 720 }, { startMin: 810, endMin: 1110 }],
  })),
};

describe("gönderim saatleri", () => {
  it("açık saatte hemen gönderir", () => {
    const at = tr(10, 15);
    expect(nextOpenSlot(at, cfg)!.getTime()).toBe(at.getTime());
  });

  it("gece kabul edilen davetin mesajını ertesi sabaha bırakır", () => {
    const night = tr(23, 0, 12); // Pazartesi 23:00
    const t = dispatchTime("accepted_message", night, cfg, [], () => 0.5)!;
    const m = localHM(t);
    expect(m).toBeGreaterThanOrEqual(540);
    expect(m).toBeLessThanOrEqual(560);
    expect(new Date(t.getTime() + 3 * 3_600_000).getUTCDate()).toBe(13);
  });

  it("öğle arasında gelen işi 13:30'a bırakır", () => {
    const t = dispatchTime("follow_up", tr(12, 40), cfg, [], () => 0)!;
    expect(localHM(t)).toBeGreaterThanOrEqual(810);
  });

  it("kapalı günü ve tatili atlar", () => {
    const sat = tr(19, 0, 17); // Cumartesi akşam -> Pazar kapalı -> Pazartesi
    const t = nextOpenSlot(sat, cfg)!;
    expect(new Date(t.getTime() + 3 * 3_600_000).getUTCDay()).toBe(1);
    const beforeHoliday = tr(19, 0, 28); // 28 Ekim akşamı -> 29 Ekim resmî tatil -> 30 Ekim
    const t2 = nextOpenSlot(beforeHoliday, cfg)!;
    expect(new Date(t2.getTime() + 3 * 3_600_000).getUTCDate()).toBe(30);
  });
});

describe("bütçeler", () => {
  it("günlük mesaj sınırını uygular, öncelikliyi önce gönderir", () => {
    expect(messagesRemainingToday(80, 78)).toBe(2);
    const items = [
      { id: "takip", priority: 5, dueAt: tr(9) },
      { id: "kabul", priority: 1, dueAt: tr(11) },
      { id: "takip2", priority: 5, dueAt: tr(10) },
    ];
    const { today, later } = pickMessagesForToday(items, 2);
    expect(today.map((x) => x.id)).toEqual(["kabul", "takip"]);
    expect(later).toHaveLength(1);
  });

  it("davetleri kampanyalara payları oranında böler", () => {
    const m = allocateInvites(26, [
      { id: "hastane", sharePct: 50, demand: 100 },
      { id: "klinik", sharePct: 25, demand: 100 },
      { id: "sigorta", sharePct: 25, demand: 100 },
    ]);
    expect(m.get("hastane")).toBe(13);
    expect((m.get("klinik") ?? 0) + (m.get("sigorta") ?? 0)).toBe(13);
  });

  it("bekleyeni az olan kampanyanın payını diğerlerine aktarır", () => {
    const m = allocateInvites(26, [
      { id: "hastane", sharePct: 50, demand: 100 },
      { id: "sigorta", sharePct: 50, demand: 3 },
    ]);
    expect(m.get("sigorta")).toBe(3);
    expect(m.get("hastane")).toBe(23);
  });

  it("LinkedIn'den elle gönderilen davetleri sayar", () => {
    const now = tr(12);
    const n = countExternalInvites(
      [
        { profileUrl: "https://www.linkedin.com/in/a", sentAt: tr(10) },
        { profileUrl: "https://tr.linkedin.com/in/B/", sentAt: tr(10) },
        { profileUrl: "https://www.linkedin.com/in/c", sentAt: new Date(now.getTime() - 9 * 86_400_000) },
      ],
      ["https://www.linkedin.com/in/b"],
      now,
    );
    expect(n).toBe(1);
  });
});

describe("kişi kilidi", () => {
  const m = [
    { campaignId: "hastane", fitScore: 80, verdict: "uygun" as const },
    { campaignId: "klinik", fitScore: 88, verdict: "uygun" as const },
  ];
  it("en uygun kampanyaya alır", () => {
    const d = chooseCampaign(m, {}, tr(10));
    expect(d.ok && d.campaignId).toBe("klinik");
  });
  it("başka kampanyada aktifse almaz", () => {
    expect(chooseCampaign(m, { activeCampaignId: "hastane" }, tr(10)).ok).toBe(false);
  });
  it("yakında yazışılan kişiyi 90 gün almaz", () => {
    expect(chooseCampaign(m, { lastEndedAt: new Date(tr(10).getTime() - 30 * 86_400_000) }, tr(10)).ok).toBe(false);
  });
  it("geri çekilen davetten sonra 21 gün bekler", () => {
    const w = tr(10);
    expect(canReinvite(w, new Date(w.getTime() + 10 * 86_400_000))).toBe(false);
    expect(canReinvite(w, new Date(w.getTime() + 22 * 86_400_000))).toBe(true);
  });
});

describe("seçenekli adımlar", () => {
  it("kapalıyken InMail ve açık profil devreye girmez", () => {
    const s = defaultSequence();
    expect(nextAction(s, { degree: 2, withdrawnAt: tr(9), sent: [], fitScore: 95, inmailCreditsLeft: 5 }, tr(10)).kind).toBe("done");
    expect(nextAction(s, { degree: 2, openProfile: true, sent: [] }, tr(10)).kind).toBe("visit");
  });
  it("açıkken: geri çekilen yüksek puanlıya InMail, açık profile davetsiz mesaj", () => {
    const s = defaultSequence();
    s.inmail!.enabled = true;
    s.openProfile!.enabled = true;
    expect(nextAction(s, { degree: 2, withdrawnAt: tr(9), sent: [], fitScore: 95, inmailCreditsLeft: 5 }, tr(10)).kind).toBe("inmail");
    expect(nextAction(s, { degree: 2, withdrawnAt: tr(9), sent: [], fitScore: 60, inmailCreditsLeft: 5 }, tr(10)).kind).toBe("done");
    expect(nextAction(s, { degree: 2, withdrawnAt: tr(9), sent: [], fitScore: 95, inmailCreditsLeft: 0 }, tr(10)).kind).toBe("done");
    const a = nextAction(s, { degree: 3, openProfile: true, sent: [] }, tr(10));
    expect(a.kind).toBe("message");
  });
});

describe("kişiselleştirme", () => {
  const on: PersonalizationOptions = {
    firstLine: { enabled: true, sources: ["mutual", "post", "school"] },
    calendar: { enabled: true, url: "https://calendar.app.google/ornek" },
    english: { enabled: true },
  };

  it("kapalıyken hiçbir şey eklemez", () => {
    expect(buildFirstLine({ mutualName: "Ahmet Yılmaz" }, DEFAULT_PERSONALIZATION)).toBe(undefined);
    expect(calendarSentence(DEFAULT_PERSONALIZATION)).toBe(undefined);
  });

  it("ortak bağlantıyı, yoksa ilgili paylaşımı kullanır; ilgisiz paylaşımı kullanmaz", () => {
    expect(buildFirstLine({ mutualName: "Ahmet Yılmaz" }, on)).toContain("Ahmet Yılmaz");
    expect(buildFirstLine({ recentPostText: "Tamamlayıcı sağlık sigortasında yeni dönem" }, on)).toContain("sağlık sigortası");
    expect(buildFirstLine({ recentPostText: "Hafta sonu maratonu koştum" }, on)).toBe(undefined);
  });

  it("değişken boşsa mesajdan iz bırakmadan çıkar", () => {
    const t = "Merhaba {hitap}, {ilk_cumle?} özel hastanelerde hızlandıran HeAlthFintel'in kurucusuyum.";
    expect(renderTemplate(t, { hitap: "Ali Okyay" }).text).toBe("Merhaba Ali Okyay, özel hastanelerde hızlandıran HeAlthFintel'in kurucusuyum.");
    const full = renderTemplate(t, { hitap: "Ali Okyay", ilk_cumle: buildFirstLine({ mutualName: "Ahmet Yılmaz" }, on) }).text;
    expect(full).toBe("Merhaba Ali Okyay, ortak bağlantımız Ahmet Yılmaz üzerinden profilinize denk geldim. Özel hastanelerde hızlandıran HeAlthFintel'in kurucusuyum.");
  });

  it("davet notu sınırı aşılırsa önce ilk cümleyi bırakır", () => {
    const answers: WizardAnswers = {
      productPhrase: "özel hastanelerde hasta kabul ve sigorta doğrulamayı hızlandıran",
      companyName: "HeAlthFintel", senderRole: "kurucusuyum", audience: "hastaneler", problem: "x",
      benefits: ["b"], proofs: [], proofKind: "yok", figures: [], goal: "pilot", tone: "resmi", salutation: "ad_soyad",
      bannedPhrases: [], excludedCompanies: [], link: "https://www.healthfintel.com.tr/",
      tractionLine: "Kurumlarla pilot anlaşmalarına başladık",
    };
    const set = generateTemplates(answers, { premium: false, firstLine: true, calendar: true });
    expect(set.invite).toContain("{ilk_cumle?}");
    expect(set.message).toContain("{takvim_linki?}");
    const r = renderForPerson(set.invite, { hitap: "Ayşe Nur Karabudak Yılmaz", ...optionalValues({ mutualName: "Mehmet Ali Karadeniz" }, on, "tr") }, "invite_note", rulesFromAnswers(answers, false));
    expect(r.ok).toBe(true);
    expect(r.droppedOptional).toEqual(["ilk_cumle"]);
  });

  it("dili profilden tanır, seçenek kapalıysa hep Türkçe", () => {
    expect(detectLanguage("International Patient Services Manager at Private Hospital")).toBe("en");
    expect(detectLanguage("Hasta Hizmetleri Müdürü")).toBe("tr");
    expect(detectLanguage("Hastane Muduru")).toBe("tr");
    expect(chooseLanguage("Head of International Patient Services", DEFAULT_PERSONALIZATION, true)).toBe("tr");
    expect(chooseLanguage("Head of International Patient Services", on, false)).toBe("tr");
    expect(chooseLanguage("Head of International Patient Services", on, true)).toBe("en");
  });
});
