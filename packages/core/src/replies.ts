/**
 * Gelen cevapları kurallarla etiketler ve önerilen yanıt taslağı hazırlar.
 * Hiçbir yanıt kendiliğinden gönderilmez; kullanıcı düzenleyip gönderir.
 */
import { fold } from "./text";

export type ReplyLabel = "ilgileniyor" | "sonra" | "ilgilenmiyor" | "yanlis_kisi" | "diger";

const RULES: { label: ReplyLabel; patterns: string[] }[] = [
  // Sıra önemli: olumsuz ifadeler olumlulardan önce denetlenir ("ilgilenmiyoruz" içinde "ilgilen" geçer).
  {
    label: "yanlis_kisi",
    patterns: ["dogru kisi degil", "ilgili kisi degil", "ilgili birim", "yonlendir", "benim alanim degil", "ben ilgilenmiyorum bu konuyla", "ilgili arkadas", "wrong person"],
  },
  {
    label: "ilgilenmiyor",
    patterns: ["ilgilenmiyor", "gerek yok", "istemiyor", "ihtiyacimiz yok", "uygun degil", "tesekkurler ama", "not interested", "listeden cikar", "yazmayin", "mesaj atmayin"],
  },
  {
    label: "sonra",
    patterns: ["daha sonra", "sonra konusalim", "simdilik degil", "su an degil", "su anda degil", "butce donemi", "yogun", "ocak", "subat", "yeni yil", "ileride", "ilerleyen donem", "later"],
  },
  {
    label: "ilgileniyor",
    patterns: ["gorusel", "gorusmek", "uygunum", "uygun olabilir", "ilginc", "detay", "bilgi alabilir", "arayabilir", "toplanti", "sunum", "demo", "hangi gun", "takvim", "olur", "memnun olurum", "interested", "let's talk"],
  },
];

export function classifyReply(text: string): ReplyLabel {
  const t = fold(text);
  for (const r of RULES) if (r.patterns.some((p) => t.includes(p))) return r.label;
  return "diger";
}

/** Cevap için önerilen yanıt taslağı. */
export function suggestReply(label: ReplyLabel, hitap: string, link?: string): string {
  switch (label) {
    case "ilgileniyor":
      return `Merhaba ${hitap}, çok teşekkürler. Size uygun bir gün ve saat yazarsanız online görüşme davetini hemen gönderirim.`;
    case "sonra":
      return `Anladım ${hitap}, teşekkürler. Uygun olduğunuz dönemde tekrar yazacağım; iyi çalışmalar.`;
    case "ilgilenmiyor":
      return `Anladım ${hitap}, dönüşünüz için teşekkürler. Size tekrar mesaj göndermeyeceğim; iyi çalışmalar.`;
    case "yanlis_kisi":
      return `Teşekkürler ${hitap}. Bu konuda kiminle görüşmem doğru olur? İsim paylaşabilirseniz çok sevinirim.`;
    default:
      return `Merhaba ${hitap}, mesajınız için teşekkürler.${link ? ` Detaylar: ${link}` : ""}`;
  }
}

/** Bu etiketle konuşma kapanır mı (takipler durur, kişi bir daha mesaj almaz)? */
export function stopsOutreach(label: ReplyLabel): boolean {
  // Cevap gelen herkese otomatik takip durur; "ilgilenmiyor" ayrıca kalıcı olarak listeden çıkar.
  return true;
}

export function suppressesPermanently(label: ReplyLabel): boolean {
  return label === "ilgilenmiyor";
}

/* ---------- Gelen kutusu süzgeçleri ---------- */

export type ReplyTag = "soru" | "toplanti";

/** Cevabın ek niteliği: soru soruyor mu, toplantı/görüşme konuşuyor mu (kurallarla, yapay zekâsız). */
export function replyTags(text: string): ReplyTag[] {
  const t = fold(text);
  const tags: ReplyTag[] = [];
  if (text.includes("?") || /\b(nasil|neden|nedir|ne kadar|kac|hangi|kim|nerede|mi\b|mu\b)/.test(t) || /\b(how|what|why|which|who|where)\b/.test(t)) tags.push("soru");
  if (/(toplanti|gorusme|gorusel|randevu|takvim|musait|uygun bir gun|meeting|call|demo|sunum)/.test(t)) tags.push("toplanti");
  return tags;
}

export const INBOX_FILTERS = [
  ["hepsi", "Hepsi"],
  ["bekleyen", "Cevap bekleyen"],
  ["ilgili", "İlgili"],
  ["toplanti", "Toplantı"],
  ["soru", "Soru"],
  ["sonra", "Sonra"],
  ["ilgisiz", "İlgisiz"],
  ["belirsiz", "Belirsiz"],
] as const;
export type InboxFilter = (typeof INBOX_FILTERS)[number][0];

/** Konuşma süzgece uyuyor mu? `label` kişi için kayıtlı etiket, `lastIsInbound` son mesaj karşıdan mı. */
export function matchesInboxFilter(f: InboxFilter, c: { label: ReplyLabel; lastInboundText: string; lastIsInbound: boolean }): boolean {
  switch (f) {
    case "hepsi":
      return true;
    case "bekleyen":
      return c.lastIsInbound;
    case "ilgili":
      return c.label === "ilgileniyor";
    case "toplanti":
      return replyTags(c.lastInboundText).includes("toplanti");
    case "soru":
      return replyTags(c.lastInboundText).includes("soru");
    case "sonra":
      return c.label === "sonra";
    case "ilgisiz":
      return c.label === "ilgilenmiyor" || c.label === "yanlis_kisi";
    case "belirsiz":
      return c.label === "diger";
  }
}
