import { describe, expect, it } from "vitest";
import {
  buildCompanySearchUrl,
  buildPeopleSearchUrl,
  canonicalProfileUrl,
  dedupeCandidates,
  defaultSequence,
  featuresOf,
  generateTemplates,
  insights,
  isQuietDay,
  learn,
  learnedBoost,
  nextAction,
  planDiscovery,
  priorityScore,
  throttleByCompany,
  titleQueries,
  validateSequence,
  type Candidate,
  type Outcome,
  type ProspectState,
} from "./index";

describe("profil linki", () => {
  it("farklı yazımları tek biçime indirger", () => {
    expect(canonicalProfileUrl("https://tr.linkedin.com/in/Ali-Okyay-810202343/?originalSubdomain=tr")).toBe("https://www.linkedin.com/in/ali-okyay-810202343");
    expect(canonicalProfileUrl("https://www.linkedin.com/in/h%C3%BClya-abidino%C4%9Flu-1b83a3275")).toBe("https://www.linkedin.com/in/hülya-abidinoğlu-1b83a3275");
    expect(canonicalProfileUrl("https://example.com")).toBe(null);
  });

  it("aynı kişiyi tekilleştirir, en yakın dereceyi ve bağlantı kaynağını korur", () => {
    const list: Candidate[] = [
      { profileUrl: "https://www.linkedin.com/in/a-1", fullName: "A", degree: 2, source: "search" },
      { profileUrl: "https://tr.linkedin.com/in/A-1/", fullName: "A", degree: 1, title: "Hastane Müdürü", source: "connections" },
      { profileUrl: "https://www.linkedin.com/in/b-2", fullName: "B", source: "import" },
    ];
    const out = dedupeCandidates(list);
    expect(out).toHaveLength(2);
    const a = out.find((x) => x.fullName === "A")!;
    expect(a.degree).toBe(1);
    expect(a.title).toBe("Hastane Müdürü");
    expect(a.source).toBe("connections");
  });
});

describe("arama planı", () => {
  it("unvanları OR gruplarına böler", () => {
    expect(titleQueries(["Hastane Müdürü", "Başhekim"], 4)).toEqual(['"Hastane Müdürü" OR "Başhekim"']);
    expect(titleQueries(["a", "b", "c", "d", "e"], 4)).toHaveLength(2);
  });

  it("LinkedIn arama linkini kurar", () => {
    const url = buildPeopleSearchUrl({ keywords: '"Hastane Müdürü"', geoUrns: ["123"], network: [1] });
    expect(url).toContain("linkedin.com/search/results/people/");
    expect(url).toContain("network=%5B%22F%22%5D");
    expect(url).toContain("geoUrn=%5B%22123%22%5D");
    expect(buildCompanySearchUrl({ keywords: "özel hastane" })).toContain("/search/results/companies/");
  });

  it("önce bağlantıları, sonra hedef kurumları, sonra geniş aramayı planlar", () => {
    const steps = planDiscovery({
      titles: ["Hastane Müdürü", "Başhekim"],
      geoUrns: ["123"],
      industryIds: ["14"],
      targetAccounts: ["Özel Levent Hastanesi"],
      includeConnections: true,
      engagementPostUrls: [],
    });
    expect(steps[0]!.source).toBe("connections");
    expect(steps[1]!.source).toBe("accounts");
    expect(steps.at(-1)!.source).toBe("search");
  });

  it("kurum içi aramada kurum adı anahtar kelimeye yazılır, serbest metinli company parametresi kullanılmaz", () => {
    const steps = planDiscovery({ titles: ["Başhekim", "CEO"], geoUrns: [], industryIds: [], targetAccounts: ["Özel Levent Hastanesi"], includeConnections: false, engagementPostUrls: [] });
    const acc = steps.find((s) => s.source === "accounts")!;
    expect(decodeURIComponent(acc.url!)).toContain('("Başhekim" OR "CEO") AND "Özel Levent Hastanesi"');
    expect(acc.url).not.toContain("company=");
  });
});

describe("önceliklendirme", () => {
  it("mevcut bağlantıyı aynı uygunluktaki yabancıdan öne alır", () => {
    const base = { profileUrl: "x", fullName: "x", source: "search" as const };
    const conn = priorityScore({ candidate: { ...base, degree: 1 }, fitScore: 70 });
    const far = priorityScore({ candidate: { ...base, degree: 3 }, fitScore: 70 });
    expect(conn).toBeGreaterThan(far);
  });

  it("aynı kurumdan aynı anda en fazla belirli sayıda kişi seçer", () => {
    const list = [
      { company: "Özel Levent Hastanesi" },
      { company: "ÖZEL LEVENT HASTANESİ" },
      { company: "Özel Levent Hastanesi" },
      { company: "Türkiye Hastanesi" },
    ];
    const { selected, deferred } = throttleByCompany(list, 2);
    expect(selected).toHaveLength(3);
    expect(deferred).toHaveLength(1);
  });
});

describe("öğrenme", () => {
  it("az veriyle öncelik değiştirmez", () => {
    const m = learn([{ features: ["unvan:x"], success: true }]);
    expect(learnedBoost(m, ["unvan:x"])).toBe(0);
  });

  it("daha çok kabul eden grubu öne çeker", () => {
    const outcomes: Outcome[] = [];
    for (let i = 0; i < 20; i++) outcomes.push({ features: featuresOf({ titleGroup: "hasta-hizmetleri", degree: 2 }), success: i < 10 });
    for (let i = 0; i < 20; i++) outcomes.push({ features: featuresOf({ titleGroup: "genel-mudur", degree: 2 }), success: i < 2 });
    const m = learn(outcomes);
    expect(learnedBoost(m, ["unvan:hasta-hizmetleri"])).toBeGreaterThan(0);
    expect(learnedBoost(m, ["unvan:genel-mudur"]) < 0).toBe(true);
    expect(insights(m).length).toBeGreaterThan(0);
  });
});

describe("akış motoru", () => {
  const seq = defaultSequence();
  const t0 = new Date(Date.UTC(2026, 9, 12, 8, 0));
  const h = (n: number) => new Date(t0.getTime() + n * 3_600_000);

  it("varsayılan akış geçerli", () => {
    expect(validateSequence(seq)).toHaveLength(0);
  });

  it("davet notuna belge eklenmesine izin vermez", () => {
    const bad = defaultSequence();
    bad.newPersonSteps[0]!.attachment = { fileId: "f", name: "a.pdf", mimeType: "application/pdf", sizeBytes: 1000 };
    expect(validateSequence(bad).some((e) => e.includes("Davet notuna"))).toBe(true);
  });

  it("yeni kişi: ziyaret, bekleme, davet", () => {
    const p: ProspectState = { degree: 2, sent: [] };
    expect(nextAction(seq, p, t0).kind).toBe("visit");
    expect(nextAction(seq, { ...p, visitedAt: t0 }, h(2)).kind).toBe("wait");
    expect(nextAction(seq, { ...p, visitedAt: t0 }, h(13)).kind).toBe("invite");
  });

  it("kabul edilince detay mesajını hemen gönderir, belgeyi de taşır", () => {
    const s = defaultSequence();
    s.newPersonSteps[1]!.attachment = { fileId: "f1", name: "HeAlthFintel-tanitim.pdf", mimeType: "application/pdf", sizeBytes: 900_000 };
    const p: ProspectState = { degree: 2, invitedAt: t0, acceptedAt: h(5), sent: [] };
    const a = nextAction(s, p, h(5));
    expect(a.kind).toBe("message");
    if (a.kind === "message") {
      expect(a.stepId).toBe("accepted");
      expect(a.attachment?.name).toBe("HeAlthFintel-tanitim.pdf");
    }
  });

  it("mevcut bağlantıya davetsiz mesaj gönderir", () => {
    const a = nextAction(seq, { degree: 1, sent: [] }, t0);
    expect(a.kind).toBe("message");
    if (a.kind === "message") expect(a.stepId).toBe("conn");
  });

  it("takibi zamanında gönderir, cevap gelince durur", () => {
    const p: ProspectState = { degree: 2, invitedAt: t0, acceptedAt: h(1), sent: [{ stepId: "accepted", at: h(1) }] };
    expect(nextAction(seq, p, h(50)).kind).toBe("wait");
    const a = nextAction(seq, p, h(1 + 96));
    expect(a.kind).toBe("message");
    expect(nextAction(seq, { ...p, repliedAt: h(20) }, h(200)).kind).toBe("done");
  });

  it("kabul edilmeyen daveti 21 gün sonra geri çeker", () => {
    const p: ProspectState = { degree: 2, invitedAt: t0, sent: [] };
    expect(nextAction(seq, p, h(24 * 10)).kind).toBe("wait");
    expect(nextAction(seq, p, h(24 * 21)).kind).toBe("withdraw");
  });

  it("resmî tatilde gönderim yapmaz", () => {
    expect(isQuietDay(new Date(Date.UTC(2026, 9, 29)))).toBe(true);
    expect(isQuietDay(new Date(Date.UTC(2026, 9, 28)))).toBe(false);
    expect(isQuietDay(new Date(Date.UTC(2026, 2, 20)), ["2026-03-20"])).toBe(true);
  });
});

describe("mevcut bağlantı mesajı", () => {
  it("tanışıklık cümlesiyle açılır ve kurallardan geçer", () => {
    const s = generateTemplates(
      {
        productPhrase: "özel hastanelerde hasta kabul ve sigorta doğrulamayı hızlandıran",
        companyName: "HeAlthFintel",
        senderRole: "kurucusuyum",
        audience: "hastaneler",
        problem: "x",
        benefits: ["hasta randevudan önce tahmini tutarı görüyor"],
        proofs: [],
        proofKind: "yok",
        figures: [],
        goal: "pilot",
        tone: "resmi",
        salutation: "ad_soyad",
        bannedPhrases: [],
        excludedCompanies: [],
        link: "https://www.healthfintel.com.tr/",
      },
      { premium: true },
    );
    expect(s.connectedMessage.startsWith("Merhaba {hitap}, LinkedIn'de bağlantıdayız")).toBe(true);
    expect(s.issues.connectedMessage).toHaveLength(0);
  });
});
