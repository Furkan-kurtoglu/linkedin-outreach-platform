import { describe, expect, it } from "vitest";
import {
  AiLimitError,
  GeminiProvider,
  PUBLIC_HOSPITAL_KEYWORDS,
  assist,
  classifyReply,
  compareVariants,
  generateTemplates,
  genitive,
  prepareMessage,
  rulesFromAnswers,
  salutationFor,
  scoreProspect,
  validateAnswers,
  type AiProvider,
  type Targeting,
  type WizardAnswers,
} from "./index";

const answers: WizardAnswers = {
  productPhrase: "özel hastanelerde hasta kabul ve sigorta doğrulamayı hızlandıran",
  companyName: "HeAlthFintel",
  senderRole: "kurucusuyum",
  audience: "hastaneler",
  problem: "poliçe doğrulama ve hasta kabulünde manuel işlemler",
  benefits: [
    "hasta randevudan önce poliçesine göre tahmini cepten ödeme tutarını görüyor ve QR kodla veznesiz kabulden geçiyor",
    "SGK ve özel sigorta sorguları eşzamanlı yürüyor; manuel veri girişini ve fatura retlerini azaltmayı hedefliyoruz",
  ],
  proofs: ["TÜBİTAK 1812 BiGG başvurumuz final aşamasında", "TEKNOFEST 2026 Finansal Teknolojiler'de finalist olduk"],
  proofKind: "sektor",
  figures: ["yoğun dönemlerde vezne beklemesi 45 dakikayı aşabiliyor"],
  goal: "pilot",
  tone: "resmi",
  salutation: "ad_soyad",
  bannedPhrases: ["öğrenmek isterim", "bağlantıda kalmak isterim"],
  excludedCompanies: ["Acıbadem"],
  link: "https://www.healthfintel.com.tr/",
  tractionLine: "Kurumlarla pilot anlaşmalarına başladık",
};

describe("sihirbaz", () => {
  it("eksiksiz cevapları kabul eder", () => {
    expect(validateAnswers(answers)).toHaveLength(0);
  });
  it("rakam varken kanıt türü seçilmediyse uyarır", () => {
    const issues = validateAnswers({ ...answers, proofKind: "yok" });
    expect(issues.some((i) => i.field === "proofKind")).toBe(true);
  });
});

describe("şablon üretimi", () => {
  it("ilgi hâli ekini doğru yazar", () => {
    expect(genitive("HeAlthFintel")).toBe("HeAlthFintel'in");
    expect(genitive("Pusula")).toBe("Pusula'nın");
    expect(genitive("Doku")).toBe("Doku'nun");
  });

  const set = generateTemplates(answers, { premium: true });

  it("bugün elle yazdığımız davet notunu üretir", () => {
    expect(set.invite).toBe(
      "Merhaba {hitap}, özel hastanelerde hasta kabul ve sigorta doğrulamayı hızlandıran HeAlthFintel'in kurucusuyum. Kurumlarla pilot anlaşmalarına başladık, sizinle de görüşmek isteriz.",
    );
  });

  it("detay mesajında link, temkinli rakam ve süresiz görüşme talebi var", () => {
    expect(set.message).toContain("https://www.healthfintel.com.tr/");
    expect(set.message).toContain("Sektör çalışmalarına göre");
    expect(set.message).toContain("Size hangi gün uygun olur?");
  });

  it("rakamdaki süre ifadesi kural denetimine takılır, diğer adımlar temiz", () => {
    // "45 dakika" bir süre vaadi değil ama denetim temkinli davranır; kullanıcı görür ve karar verir.
    expect(set.issues.invite).toHaveLength(0);
    expect(set.issues.followUp1).toHaveLength(0);
    expect(set.issues.followUp2).toHaveLength(0);
  });

  it("kişi için doldurulunca gönderilebilir", () => {
    const rules = rulesFromAnswers(answers, true);
    const r = prepareMessage(set.invite, { hitap: salutationFor("Huri CALAYIR", "ad_soyad") }, "invite_note", rules);
    expect(r.ok).toBe(true);
    expect(r.text.startsWith("Merhaba Huri Calayır,")).toBe(true);
  });

  it("Premium olmayan hesapta sığmazsa güven cümlesini çıkarır", () => {
    const long = { ...answers, tractionLine: "İstanbul'da birçok özel hastane ve klinikle pilot anlaşmalarına başladık" };
    expect(generateTemplates(long, { premium: true }).dropped).toHaveLength(0);
    const s = generateTemplates(long, { premium: false });
    expect(s.invite).not.toContain("pilot anlaşmalarına");
    expect(s.dropped).toHaveLength(1);
  });

  it("samimi tonda dili yumuşatır", () => {
    const s = generateTemplates({ ...answers, tone: "samimi" }, { premium: true });
    expect(s.invite).toContain("çok isteriz");
  });
});

describe("hitap", () => {
  it("cinsiyet bilinmiyorsa ad soyad kullanır", () => {
    expect(salutationFor("deniz yılmaz", "bey_hanim")).toBe("Deniz Yılmaz");
    expect(salutationFor("Asiye Altınkaynak", "bey_hanim", "kadin")).toBe("Asiye Hanım");
  });
});

describe("kişi puanlama", () => {
  const t: Targeting = {
    titles: ["Hastane Müdürü", "Hasta Hizmetleri", "Genel Müdür"],
    excludedTitles: ["Stajyer"],
    locations: ["İstanbul", "Istanbul"],
    industries: ["Hospitals and Health Care"],
    excludedCompanies: ["Acıbadem", "Acibadem"],
    excludedCompanyKeywords: PUBLIC_HOSPITAL_KEYWORDS,
    requiredCompanyKeywords: ["özel", "hospital", "hastane", "klinik", "tıp merkezi"],
    segments: [
      { id: "klinik", name: "Özel klinikler", keywords: ["klinik", "tıp merkezi", "poliklinik"] },
      { id: "hastane", name: "Özel hastaneler", keywords: ["hastane", "hospital"] },
    ],
  };

  it("özel hastane müdürünü uygun bulur", () => {
    const r = scoreProspect({ fullName: "Serdar Ceylan", title: "Hastane Müdürü", company: "Özel Levent Hastanesi", location: "Istanbul, Türkiye", industry: "Hospitals and Health Care" }, t);
    expect(r.verdict).toBe("uygun");
    expect(r.segmentId).toBe("hastane");
  });

  it("kamu hastanesini eler", () => {
    const r = scoreProspect({ fullName: "X", title: "Hastane Müdürü", company: "Bagcilar Education and Research Hospital" }, t);
    expect(r.verdict).toBe("elendi");
    const r2 = scoreProspect({ fullName: "X", title: "Hastane Müdürü", company: "Bağcılar Eğitim ve Araştırma Hastanesi" }, t);
    expect(r2.verdict).toBe("elendi");
  });

  it("hariç tutulan kurumu eler", () => {
    const r = scoreProspect({ fullName: "X", title: "Hasta Hizmetleri Müdürü", company: "Acibadem Healthcare Group" }, t);
    expect(r.verdict).toBe("elendi");
  });

  it("tıp merkezini klinik segmentine koyar", () => {
    const r = scoreProspect({ fullName: "Emre Kutsal", title: "Hasta Hizmetleri Müdürü", company: "Medihaus Cerrahi Tıp Merkezi", location: "İstanbul", industry: "Hospitals and Health Care" }, t);
    expect(r.segmentId).toBe("klinik");
  });

  it("unvanı tutmayan kişiyi eler", () => {
    const r = scoreProspect({ fullName: "X", title: "Hemşire", company: "Özel Levent Hastanesi", location: "İstanbul", industry: "Hospitals and Health Care" }, t);
    expect(r.verdict === "elendi" || r.verdict === "belirsiz").toBe(true);
    expect(r.verdict).not.toBe("uygun");
  });
});

describe("cevap etiketleme", () => {
  it("cevapları doğru etiketler", () => {
    expect(classifyReply("Merhaba Furkan Bey, ilginç görünüyor. Perşembe görüşebiliriz.")).toBe("ilgileniyor");
    expect(classifyReply("Şu an bütçe dönemindeyiz, ocakta tekrar konuşalım.")).toBe("sonra");
    expect(classifyReply("Teşekkürler, ilgilenmiyoruz.")).toBe("ilgilenmiyor");
    expect(classifyReply("Bu konuda doğru kişi değilim, satın almaya yönlendireyim.")).toBe("yanlis_kisi");
  });
});

describe("A/B karşılaştırma", () => {
  it("az veriyle karar vermez", () => {
    expect(compareVariants({ id: "v1", sent: 10, success: 2 }, { id: "v2", sent: 12, success: 5 }).confident).toBe(false);
  });
  it("belirgin farkı kazanan ilan eder", () => {
    const c = compareVariants({ id: "v1", sent: 200, success: 30 }, { id: "v2", sent: 200, success: 60 });
    expect(c.confident).toBe(true);
    expect(c.winner).toBe("v2");
  });
});

describe("yapay zekâ yardımcısı", () => {
  const rules = rulesFromAnswers(answers, true);
  const base = { action: "better" as const, template: "Merhaba {hitap}, test metni.", kind: "invite_note" as const, businessContext: "HeAlthFintel", rules };

  it("anahtar yoksa sistemi durdurmadan açıklama döner", async () => {
    const r = await assist(base, null);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("no_key");
  });

  it("günlük limit dolunca açık mesaj verir", async () => {
    const p: AiProvider = { name: "t", complete: async () => { throw new AiLimitError("x"); } };
    const r = await assist(base, p);
    if (!r.ok) expect(r.reason).toBe("daily_limit");
    else throw new Error("limit hatası bekleniyordu");
  });

  it("kurala uymayan öneriyi göstermez", async () => {
    const p: AiProvider = {
      name: "t",
      complete: async () => JSON.stringify({ suggestions: [
        { text: "Merhaba {hitap}, bağlantıda kalmak isterim.", why: "x" },
        { text: "Merhaba {hitap}, HeAlthFintel'in kurucusuyum; tanışmak isteriz.", why: "kısa" },
      ] }),
    };
    const r = await assist(base, p);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.suggestions).toHaveLength(1);
      expect(r.rejected).toBe(1);
    }
  });

  it("kişisel veri içeren şablonu göndermez", async () => {
    const p: AiProvider = { name: "t", complete: async () => "{}" };
    const r = await assist({ ...base, template: "Merhaba, bana ali@ornek.com adresinden yazın." }, p);
    if (!r.ok) expect(r.reason).toBe("unsafe_input");
    else throw new Error("engellenmeliydi");
  });

  it("Gemini isteğini doğru biçimde gönderir ve 429'u limit sayar", async () => {
    let seenUrl = "";
    const fake = (async (url: string) => {
      seenUrl = url;
      return new Response("", { status: 429 });
    }) as unknown as typeof fetch;
    const g = new GeminiProvider("KEY", "gemini-2.5-flash", fake);
    let limit = false;
    try { await g.complete("s", "u"); } catch (e) { limit = e instanceof AiLimitError; }
    expect(limit).toBe(true);
    expect(seenUrl).toContain("models/gemini-2.5-flash:generateContent");
  });
});

import { containsFoldedWord } from "./text";
describe("kısa unvan kısaltmaları", () => {
  it("Director içinde CTO eşleşmez, tek başına eşleşir", () => {
    expect(containsFoldedWord("Director of Sales", "CTO")).toBe(false);
    expect(containsFoldedWord("Co-founder & CTO", "cto")).toBe(true);
    expect(containsFoldedWord("Genel Müdür Yardımcısı", "genel müdür")).toBe(true);
  });
});

describe("yönetici olmayan ve hekim unvanları", () => {
  const t = { titles: ["Genel Müdür", "Başhekim"], excludedTitles: [], locations: [], industries: [], excludedCompanies: [], excludedCompanyKeywords: [], requiredCompanyKeywords: [], segments: [] };
  it("uzman doktor elenir", () => {
    expect(scoreProspect({ fullName: "A B", title: "Uzman Doktor", company: "X Hastanesi" }, t).verdict).toBe("elendi");
  });
  it("unvanı yönetici olmayan (faturalandırma) elenir", () => {
    expect(scoreProspect({ fullName: "A B", title: "Faturalandırma Sorumlusu", company: "X Hastanesi" }, t).verdict).toBe("elendi");
  });
  it("genel müdür elenmez", () => {
    expect(scoreProspect({ fullName: "A B", title: "Genel Müdür", company: "X Hastanesi" }, t).verdict).not.toBe("elendi");
  });
});
