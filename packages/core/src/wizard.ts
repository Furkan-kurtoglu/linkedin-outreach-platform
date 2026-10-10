/**
 * Yeni temsilci sihirbazının soruları ve cevap doğrulaması.
 *
 * Her cevap şablon kütüphanesinde belirli bir yeri doldurur (bkz. generate.ts).
 * Yapay zekâ gerekmez: aynı cevaplar her zaman aynı taslağı üretir.
 */

export type Tone = "resmi" | "samimi";
export type Salutation = "ad_soyad" | "bey_hanim";
export type ProofKind = "sektor" | "kendi" | "yok";
export type Goal = "gorusme" | "demo" | "pilot";

export interface WizardAnswers {
  /** 1. Ürün tek cümle: "hasta kabul ve sigorta doğrulamayı hızlandıran" (sıfat cümlesi) */
  productPhrase: string;
  /** Şirket / ürün adı: "HeAlthFintel" */
  companyName: string;
  /** Gönderenin rolü: "kurucusuyum" */
  senderRole: string;
  /** 2. Hedef kitle, çoğul: "özel hastaneler" */
  audience: string;
  /** 3. Kitlenin yaşadığı sorun */
  problem: string;
  /** 4. Somut faydalar, her biri bir madde */
  benefits: string[];
  /** 5. Kanıtlar: ödül, pilot, başvuru (doğrulanabilir cümleler) */
  proofs: string[];
  /** 5b. Rakamlar varsa türü: sektör verisi mi, kendi sonucumuz mu? */
  proofKind: ProofKind;
  /** 5c. Rakamlı iddialar (isteğe bağlı) */
  figures: string[];
  /** 6. Hedef */
  goal: Goal;
  /** 7. Ton ve hitap */
  tone: Tone;
  salutation: Salutation;
  /** 8. Asla geçmemesi gerekenler */
  bannedPhrases: string[];
  excludedCompanies: string[];
  /** 9. Paylaşılacak link */
  link?: string;
  /** Güven cümlesi: "Kurumlarla pilot anlaşmalarına başladık" (isteğe bağlı) */
  tractionLine?: string;
}

export interface WizardQuestion {
  id: keyof WizardAnswers;
  question: string;
  help: string;
  example: string;
  required: boolean;
}

export const WIZARD_QUESTIONS: WizardQuestion[] = [
  {
    id: "productPhrase",
    question: "Ürününüz ne yapıyor? Tek cümleyle, \"...-an/-en\" diye bitecek şekilde yazın.",
    help: "Davet notunda \"{bu cümle} HeAlthFintel'in kurucusuyum\" diye kullanılır.",
    example: "özel hastanelerde hasta kabul ve sigorta doğrulamayı hızlandıran",
    required: true,
  },
  {
    id: "audience",
    question: "Kime ulaşmak istiyorsunuz? Kurum türünü çoğul yazın.",
    help: "Unvanları ve şehri bir sonraki adımda hedeflemeye eklersiniz.",
    example: "özel hastaneler",
    required: true,
  },
  {
    id: "problem",
    question: "Onların en çok yaşadığı sorun ne?",
    help: "Karşı tarafı suçlamadan, sektörün genel sorunu olarak yazın.",
    example: "poliçe doğrulama ve hasta kabulünde manuel işlemler",
    required: true,
  },
  {
    id: "benefits",
    question: "Bu sorunu nasıl çözüyorsunuz? Her satıra bir somut fayda.",
    help: "\"Hedefliyoruz\" dili kullanılır; kesin vaat verilmez.",
    example: "hasta randevudan önce tahmini cepten ödeme tutarını görüyor",
    required: true,
  },
  {
    id: "proofs",
    question: "Elinizde hangi kanıtlar var? Ödül, başvuru, pilot. Rakamlar varsa sektör verisi mi, kendi sonucunuz mu?",
    help: "Sektör verisi her kuruma uymayabilir; mesajda \"sektör çalışmalarına göre\" diye geçer.",
    example: "TÜBİTAK 1812 BiGG başvurumuz final aşamasında",
    required: false,
  },
  {
    id: "goal",
    question: "Karşı tarafın ne yapmasını istiyorsunuz?",
    help: "Görüşme için süre yazılmaz.",
    example: "pilot",
    required: true,
  },
  {
    id: "tone",
    question: "Ton ve hitap nasıl olsun?",
    help: "Hitap varsayılan olarak ad soyaddır; Bey/Hanım yalnızca cinsiyet kesinse kullanılır.",
    example: "resmi, ad soyad",
    required: true,
  },
  {
    id: "bannedPhrases",
    question: "Mesajlarda asla geçmemesi gerekenler neler?",
    help: "İfadeler ve kurum isimleri ayrı ayrı. Bunlar her mesajda denetlenir.",
    example: "öğrenmek isterim, 20 dakika · Acıbadem",
    required: false,
  },
  {
    id: "link",
    question: "Paylaşılacak link hangisi?",
    help: "Detay mesajının sonunda yer alır.",
    example: "https://www.healthfintel.com.tr/",
    required: false,
  },
];

export interface AnswerIssue {
  field: keyof WizardAnswers;
  message: string;
}

/** Cevapları denetler; şablon üretmeden önce düzeltilmesi gerekenleri döner. */
export function validateAnswers(a: Partial<WizardAnswers>): AnswerIssue[] {
  const issues: AnswerIssue[] = [];
  const req: (keyof WizardAnswers)[] = ["productPhrase", "companyName", "senderRole", "audience", "problem", "goal", "tone"];
  for (const f of req) {
    const v = a[f];
    if (v === undefined || (typeof v === "string" && !v.trim())) {
      issues.push({ field: f, message: "Bu alan boş bırakılamaz." });
    }
  }
  if (!a.benefits || a.benefits.filter((b) => b.trim()).length === 0) {
    issues.push({ field: "benefits", message: "En az bir fayda yazın." });
  }
  if (a.productPhrase && a.productPhrase.trim().length > 110) {
    issues.push({ field: "productPhrase", message: "Ürün cümlesi davet notuna sığmaz; 110 karakterin altına indirin." });
  }
  if (a.figures && a.figures.length > 0 && (!a.proofKind || a.proofKind === "yok")) {
    issues.push({ field: "proofKind", message: "Rakamların sektör verisi mi, kendi sonucunuz mu olduğunu seçin." });
  }
  if (a.link && !/^https?:\/\/\S+$/.test(a.link.trim())) {
    issues.push({ field: "link", message: "Link http:// ya da https:// ile başlamalı." });
  }
  return issues;
}
