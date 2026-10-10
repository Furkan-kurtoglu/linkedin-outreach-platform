/**
 * Seçenekli kişiselleştirme. Hepsi kampanya bazında açılıp kapanır; kapalıysa ya da
 * kişi için veri yoksa ilgili değişken mesajdan iz bırakmadan çıkar ({ilk_cumle?}).
 *
 *  - Kişiye özel ilk cümle: kurallarla, yapay zekâsız üretilir. Kaynaklar: ortak bağlantı,
 *    kişinin konuyla ilgili son paylaşımı, ortak okul, aynı şehir. Uydurma bilgi yazılmaz;
 *    yalnızca çalışanın LinkedIn'de gördüğü veriler kullanılır.
 *  - Takvim linki: Google Takvim randevu sayfası gibi ücretsiz bir link.
 *  - Dil: profili İngilizce olan kişiye kampanyanın İngilizce varyantı gönderilir.
 */
import { containsFolded, fold } from "./text";
import { prepareMessage, type MessageKind, type RenderResult, type TemplateRules } from "./template";

export type Lang = "tr" | "en";

export interface PersonalizationOptions {
  firstLine: {
    enabled: boolean;
    /** Kullanılacak kaynaklar, öncelik sırasıyla */
    sources: ("mutual" | "post" | "school" | "city")[];
  };
  calendar: { enabled: boolean; url?: string };
  english: { enabled: boolean };
}

export const DEFAULT_PERSONALIZATION: PersonalizationOptions = {
  firstLine: { enabled: false, sources: ["mutual", "post", "school"] },
  calendar: { enabled: false },
  english: { enabled: false },
};

export interface PersonFacts {
  /** Ortak bağlantılardan biri (gönderenin iyi tanıdığı biri seçilmeli) */
  mutualName?: string;
  /** Kişinin son 30 gündeki paylaşımının metni */
  recentPostText?: string;
  /** Kişiyle gönderenin ortak okulu */
  sharedSchool?: string;
  /** Kişinin şehri; gönderenle aynıysa kullanılır */
  city?: string;
  senderCity?: string;
}

/** Paylaşım konusunu tanır; konu kampanyayla ilgiliyse kısa bir ifade döner. */
export const POST_TOPICS: { keywords: string[]; tr: string; en: string }[] = [
  { keywords: ["sağlık sigortası", "tamamlayıcı sağlık", "health insurance", "poliçe"], tr: "sağlık sigortası üzerine paylaşımınızı", en: "your post on health insurance" },
  { keywords: ["hasta deneyimi", "hasta memnuniyeti", "patient experience"], tr: "hasta deneyimi üzerine paylaşımınızı", en: "your post on patient experience" },
  { keywords: ["dijital dönüşüm", "dijitalleşme", "digital transformation", "dijital sağlık", "digital health"], tr: "sağlıkta dijitalleşme üzerine paylaşımınızı", en: "your post on digital health" },
  { keywords: ["hasta kabul", "vezne", "provizyon", "admission"], tr: "hasta kabul süreçleri üzerine paylaşımınızı", en: "your post on patient admission" },
  { keywords: ["yapay zeka", "yapay zekâ", "artificial intelligence"], tr: "sağlıkta yapay zekâ üzerine paylaşımınızı", en: "your post on AI in healthcare" },
];

export function postTopic(text: string | undefined, lang: Lang): string | undefined {
  if (!text) return undefined;
  const hit = POST_TOPICS.find((t) => t.keywords.some((k) => containsFolded(text, k)));
  return hit ? hit[lang] : undefined;
}

/**
 * Kişiye özel ilk cümle; veri yoksa undefined (değişken mesajdan çıkar).
 * Türkçe cümleler küçük harfle başlar: "Merhaba {hitap}, {ilk_cumle?} ..." içinde virgülden
 * sonra doğru okunur; cümle sonundan sonra gelirse şablon doldurulurken büyük harfe çevrilir.
 */
export function buildFirstLine(f: PersonFacts, opts: PersonalizationOptions, lang: Lang = "tr"): string | undefined {
  if (!opts.firstLine.enabled) return undefined;
  for (const src of opts.firstLine.sources) {
    if (src === "mutual" && f.mutualName) {
      return lang === "tr"
        ? `ortak bağlantımız ${f.mutualName} üzerinden profilinize denk geldim.`
        : `I came across your profile through our mutual connection ${f.mutualName}.`;
    }
    if (src === "post") {
      const topic = postTopic(f.recentPostText, lang);
      if (topic) return lang === "tr" ? `geçenlerde ${topic} okudum.` : `I recently read ${topic}.`;
    }
    if (src === "school" && f.sharedSchool) {
      return lang === "tr" ? `ikimiz de ${f.sharedSchool} mezunuyuz.` : `I noticed we both studied at ${f.sharedSchool}.`;
    }
    if (src === "city" && f.city && f.senderCity && fold(f.city).includes(fold(f.senderCity))) {
      return lang === "tr" ? `ben de ${f.senderCity}'dayım.` : `I'm also based in ${f.senderCity}.`;
    }
  }
  return undefined;
}

/** Takvim cümlesi; seçenek kapalıysa ya da link yoksa undefined. */
export function calendarSentence(opts: PersonalizationOptions, lang: Lang = "tr"): string | undefined {
  const url = opts.calendar.url?.trim();
  if (!opts.calendar.enabled || !url || !/^https?:\/\//.test(url)) return undefined;
  return lang === "tr" ? `Uygun bir saati buradan seçebilirsiniz: ${url}` : `You can pick a time that suits you here: ${url}`;
}

/* ---------- Dil tespiti ---------- */

const TR_HINTS = ["müdür", "müdürü", "hastane", "sağlık", "genel", "yardımcısı", "sorumlusu", "uzman", "hizmetleri", "ve", "ile", "için"];
const EN_HINTS = ["manager", "director", "head of", "officer", "hospital", "healthcare", "international", "the", "and", "of", "for", "with"];

/**
 * Profil metninin dili. Türkçeye özgü harf ya da kelime varsa Türkçe; yalnızca İngilizce
 * ipuçları baskınsa İngilizce. Emin değilse Türkçe (Türkiye'deki kişiler için güvenli varsayılan).
 */
export function detectLanguage(text: string): Lang {
  // Türkçe harf denetimi özgün metinde yapılır: tr-TR küçültme "I"yı "ı"ya çevirip
  // İngilizce unvanları ("International ...") yanlışlıkla Türkçe gösterirdi.
  if (/[çğıöşüÇĞİÖŞÜ]/.test(text)) return "tr";
  const t = ` ${text.toLowerCase()} `;
  const tr = TR_HINTS.filter((w) => t.includes(` ${w} `)).length;
  const en = EN_HINTS.filter((w) => t.includes(` ${w} `)).length;
  return en >= 2 && en > tr ? "en" : "tr";
}

/** Kişiye gönderilecek dil: İngilizce seçeneği kapalıysa ya da İngilizce şablon yoksa her zaman Türkçe. */
export function chooseLanguage(profileText: string, opts: PersonalizationOptions, hasEnglishTemplate: boolean): Lang {
  if (!opts.english.enabled || !hasEnglishTemplate) return "tr";
  return detectLanguage(profileText);
}

/** Bir kişi için seçenekli değişkenlerin değerleri. */
export function optionalValues(f: PersonFacts, opts: PersonalizationOptions, lang: Lang): Record<string, string | undefined> {
  return { ilk_cumle: buildFirstLine(f, opts, lang), takvim_linki: calendarSentence(opts, lang) };
}

/**
 * Kişiye özel metni hazırlar. Karakter sınırı aşılırsa önce kişiye özel ilk cümle, sonra
 * takvim cümlesi çıkarılarak yeniden denenir; böylece seçenekler mesajı asla bozmaz.
 */
export function renderForPerson(
  template: string,
  values: Record<string, string | undefined>,
  kind: MessageKind,
  rules: TemplateRules,
): RenderResult & { droppedOptional: string[] } {
  const dropOrder = ["ilk_cumle", "takvim_linki"];
  const v = { ...values };
  const dropped: string[] = [];
  let r = prepareMessage(template, v, kind, rules);
  for (const key of dropOrder) {
    if (r.ok || !r.issues.every((i) => i.code === "too_long") || !v[key]) continue;
    v[key] = undefined;
    dropped.push(key);
    r = prepareMessage(template, v, kind, rules);
  }
  return { ...r, droppedOptional: dropped };
}
