import { describe, expect, it } from "vitest";
import {
  AiLimitError,
  hasRealHeadline,
  scoreProfile,
  verifyReason,
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





  it("hastane direktörünü ve zincir hastane müdürünü elemez", () => {
    expect(scoreProspect({ fullName: "A", title: "Hastane Direktörü", company: "Medipol Sağlık Grubu" }, t).verdict).not.toBe("elendi");
    expect(scoreProspect({ fullName: "B", title: "Hastane Müdürü", company: "Dünyagöz Hastaneler Grubu" }, t).verdict).not.toBe("elendi");
    expect(scoreProspect({ fullName: "I", title: "İşletme Müdürü", company: "Özel Tepe Hastanesi" }, t).verdict).toBe("belirsiz");
    expect(scoreProspect({ fullName: "K", title: "Hasta Hizmetleri Müdürü" }, t).verdict).not.toBe("elendi");
  });

  it("sağlıkla ilgisiz ya da kurumu belirsiz kişileri eler", () => {
    const e = (title: string, company?: string, about?: string, location?: string) => scoreProspect({ fullName: "X", title, company, about, location }, t).verdict;
    expect(e("Founder")).toBe("elendi");
    expect(e("Genel Müdür Yardımcısı")).toBe("elendi");
    expect(e("İşletme Müdürü")).toBe("elendi");
    expect(e("Anlaşmalı Kurumlar Direktörü", undefined, "Axa Sigorta Sağlık Anlaşmalı Kurumlar Direktörü")).toBe("elendi");
    expect(e("Kurumsal Pazarlama Müdürü", "Central Hospital")).toBe("elendi");
    expect(e("İnsan Kaynakları Müdürü", "Özel Levent Hastanesi")).toBe("elendi");
    expect(e("Kalite Müdürü", "Özel Levent Hastanesi")).toBe("elendi");
    expect(e("Şantiye Şefi", undefined, "Misek İnşaat Çapa Hastanesi Şantiyesi")).toBe("elendi");
    expect(e("Kurucu Diyetisyen", undefined, "Beslenme ve Diyet Danışmanlığında Kurucu Diyetisyen")).toBe("elendi");
    expect(e("Akademi Kurucu", "UTA Ufuk Timuçin Akademi")).toBe("elendi");
    expect(e("Hastane Müdürü", "Özel X Hastanesi", undefined, "Bursa, Türkiye")).toBe("elendi");
    expect(e("Hastane Müdürü", "Özel X Hastanesi", undefined, "Istanbul, Türkiye")).not.toBe("elendi");
    expect(e("Hastane Müdürü", "Özel X Hastanesi", undefined, "Türkiye")).not.toBe("elendi");
  });

  it("BT/İK/pazarlama müdürünü, sigorta ve üniversite kişisini eler; hasta hizmetleri ve fiyatlandırmayı korur", () => {
    const e = (title: string, company?: string, about?: string) => scoreProspect({ fullName: "X", title, company, about }, t).verdict;
    expect(e("Bilgi Sistemleri Müdürü", "Özel Levent Hastanesi")).toBe("elendi");
    expect(e("IT Manager", "Özel Levent Hastanesi")).toBe("elendi");
    expect(e("Medipol Hastanesi şirketinde Bilgi Sistemleri Müdürü")).toBe("elendi");
    expect(e("Özel X Hastanesi Pazarlama Direktörü")).toBe("elendi");
    expect(e("Patient Coordinator", "Özel Levent Hastanesi")).toBe("elendi");
    expect(e("Tedarik Zinciri Müdürü", "Medical Park Hastaneler Grubu")).toBe("elendi");
    expect(e("Hasta Hizmetleri Grup Müdürü", undefined, "Bezmialem Vakıf Üniversitesi Hasta Hizmetleri Grup Müdürü")).toBe("elendi");
    expect(e("Hasta Hizmetleri Müdürü", "Özel Levent Hastanesi")).not.toBe("elendi");
    expect(e("Merkez Fiyatlandırma Grup Müdürü", "Medical Park Hastaneler Grubu")).not.toBe("elendi");
  });

  it("sağlık kurumu doğrulanan kurucuyu karar verici sayar", () => {
    expect(scoreProspect({ fullName: "K", title: "Kurucu", company: "Özel Ada Hastanesi" }, t).verdict).not.toBe("elendi");
  });

  it("hariç kurumun markasını alt adlarında da yakalar", () => {
    const x = { ...t, excludedCompanies: ["Acıbadem Sağlık Grubu", "Medicana"] };
    expect(scoreProspect({ fullName: "A", title: "Hastane Müdürü", company: "Acıbadem Altunizade Hastanesi" }, x).verdict).toBe("elendi");
    expect(scoreProspect({ fullName: "B", title: "Hastane Müdürü", about: "Acibadem Healthcare Group şirketinde Hastane Müdürü" }, x).verdict).toBe("elendi");
    expect(scoreProspect({ fullName: "C", title: "Hastane Müdürü", company: "Özel Levent Hastanesi" }, x).verdict).not.toBe("elendi");
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

describe("alakasız sağlık meslekleri", () => {
  const t = { titles: ["Genel Müdür", "Hasta Hizmetleri"], excludedTitles: [], locations: [], industries: [], excludedCompanies: [], excludedCompanyKeywords: [], requiredCompanyKeywords: [], segments: [] };
  for (const title of ["Tekniker", "Diyetisyen", "Psikolog", "Fizyoterapist", "Hasta Hizmetleri Danışmanı"])
    it(`${title} elenir`, () => {
      expect(scoreProspect({ fullName: "A B", title, company: "X Hastanesi" }, t).verdict).toBe("elendi");
    });
});

describe("profil doğrulaması", () => {
  const t2: Targeting = {
    titles: ["Hastane Müdürü", "Genel Müdür", "Genel Müdür Yardımcısı", "Hasta Hizmetleri", "Anlaşmalı Kurumlar", "Başhekim"],
    excludedTitles: ["Stajyer", "Hemşire", "Asistan"],
    locations: ["İstanbul"],
    industries: [],
    excludedCompanies: ["Acıbadem Sağlık Grubu"],
    excludedCompanyKeywords: ["devlet hastanesi", "eğitim ve araştırma", "şehir hastanesi", "üniversite"],
    requiredCompanyKeywords: ["özel hastane", "hastanesi", "hospital", "sağlık grubu"],
    segments: [{ id: "h", name: "Özel hastaneler", keywords: ["hastane", "hospital"] }],
    knownCompanies: ["Özel Levent Hastanesi"],
  };
  it("kartta ad tekrarını gerçek başlık saymaz", () => {
    expect(hasRealHeadline("Zeynep Aytumur Zeynep Aytumur", "Zeynep Aytumur")).toBe(false);
    expect(hasRealHeadline("Hastane Müdürü", "Zeynep Aytumur")).toBe(true);
  });
  it("güncel pozisyona göre karar verir, geçmiş pozisyona bakmaz", () => {
    const ok = scoreProfile({ fullName: "A", headline: "Yönetici", location: "İstanbul, Türkiye", positions: [{ title: "Hasta Hizmetleri Müdürü", company: "Özel Levent Hastanesi", current: true, description: "Hasta kabul ve provizyon süreçleri" }] }, t2);
    expect(ok.verdict).not.toBe("elendi");
    const past = scoreProfile({ fullName: "A", headline: "Hastane Müdürü", location: "İstanbul, Türkiye", positions: [{ title: "Hastane Müdürü", company: "Özel Levent Hastanesi", current: false }, { title: "Yazılım Müdürü", company: "Acme Yazılım", current: true }] }, t2);
    expect(past.verdict).toBe("elendi");
  });
  it("Eda tipi: başlıkta kurum yok, profilde özel hastane var", () => {
    const cardScore = scoreProspect({ fullName: "E", title: "İşletme Müdürü", location: "İstanbul, Türkiye" }, t2);
    expect(cardScore.verdict).toBe("elendi");
    expect(verifyReason({ fullName: "E", title: "İşletme Müdürü", location: "İstanbul, Türkiye" }, true, cardScore, t2)).toBeTruthy();
    const prof = scoreProfile({ fullName: "E", headline: "İşletme Müdürü", location: "İstanbul, Türkiye", positions: [{ title: "İşletme Müdürü", company: "Özel Levent Hastanesi", current: true }] }, t2);
    expect(prof.verdict).not.toBe("elendi");
  });
  it("kesin elenenler doğrulamaya gitmez", () => {
    const e = (title: string, company?: string, location = "İstanbul, Türkiye") => {
      const inp = { fullName: "X", title, company, location };
      const sc = scoreProspect(inp, t2);
      return sc.verdict === "elendi" ? verifyReason(inp, true, sc, t2) : "gecti";
    };
    expect(e("Hemşire")).toBeUndefined();
    expect(e("Uzm. Dr. Ali")).toBeUndefined();
    expect(e("Hastane Müdürü", "Özel X Hastanesi", "Bursa, Türkiye")).toBeUndefined();
    expect(e("Bilgi Sistemleri Müdürü")).toBeUndefined();
    expect(e("Founder")).toBeUndefined();
  });
});
