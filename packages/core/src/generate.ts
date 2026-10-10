/**
 * Sihirbaz cevaplarından şablon seti üretir. Yapay zekâ kullanmaz.
 *
 * Çıktıdaki {hitap} ve {kurum} değişkenleri gönderim anında her kişi için doldurulur.
 * Üretilen her metin kural denetiminden geçirilir; sorunlar `issues` içinde döner.
 */
import { capFirst, lowerFirst, sentence, stripEnd } from "./text";
import { checkMessage, inviteNoteLimit, type Issue, type TemplateRules } from "./template";
import type { Goal, WizardAnswers } from "./wizard";

export type StepKind = "invite" | "message" | "connectedMessage" | "followUp1" | "followUp2";

export interface GeneratedSet {
  invite: string;
  message: string;
  /** Zaten bağlantıda olunan kişilere davetsiz giden ilk mesaj */
  connectedMessage: string;
  followUp1: string;
  followUp2: string;
  /** Kural denetiminin her adım için bulduğu sorunlar (değişkenler doldurulmadan). */
  issues: Record<StepKind, Issue[]>;
  /** Uzunluk sığmadığı için çıkarılan isteğe bağlı parçalar. */
  dropped: string[];
}

/** Türkçe ilgi hâli eki: "HeAlthFintel" -> "HeAlthFintel'in", "Pusula" -> "Pusula'nın". */
export function genitive(name: string): string {
  const n = name.trim();
  const lower = n.toLocaleLowerCase("tr-TR");
  const vowels = "aeıioöuü";
  let last = "";
  for (let i = lower.length - 1; i >= 0; i--) {
    if (vowels.includes(lower[i]!)) {
      last = lower[i]!;
      break;
    }
  }
  const suffix = { a: "ın", ı: "ın", e: "in", i: "in", o: "un", u: "un", ö: "ün", ü: "ün" }[last] ?? "in";
  const endsWithVowel = vowels.includes(lower.at(-1) ?? "");
  return `${n}'${endsWithVowel ? "n" : ""}${suffix}`;
}

const GOAL_CLOSE: Record<Goal, string> = {
  pilot: "Pilot sürecini online bir görüşmede kısa bir sunumla anlatmak isterim. Size hangi gün uygun olur?",
  gorusme: "Online bir görüşmede kısaca anlatmak isterim. Size hangi gün uygun olur?",
  demo: "Online bir görüşmede kısa bir demo göstermek isterim. Size hangi gün uygun olur?",
};

const GOAL_FOLLOWUP: Record<Goal, string> = {
  pilot: "pilot sürecini",
  gorusme: "neler yaptığımızı",
  demo: "ürünümüzü",
};

/** Sihirbaz cevaplarından kural nesnesi üretir. */
export function rulesFromAnswers(a: WizardAnswers, premium: boolean): TemplateRules {
  return {
    bannedPhrases: a.bannedPhrases.map((s) => s.trim()).filter(Boolean),
    excludedCompanies: a.excludedCompanies.map((s) => s.trim()).filter(Boolean),
    requiredLink: a.link?.trim() || undefined,
    premium,
  };
}

/** Rakamlı iddiayı kanıt türüne göre temkinli dile çevirir. */
export function hedgeFigure(figure: string, kind: WizardAnswers["proofKind"]): string {
  const f = stripEnd(lowerFirst(figure));
  if (kind === "kendi") return sentence(`Pilot sonuçlarımıza göre ${f}`);
  return sentence(`Sektör çalışmalarına göre ${f}`);
}

export interface GenerateOptions {
  premium: boolean;
  /** Seçenek: davet notu ve bağlantıya ilk mesaj kişiye özel ilk cümleyle açılsın */
  firstLine?: boolean;
  /** Seçenek: mesajların sonuna randevu linki cümlesi eklensin */
  calendar?: boolean;
}

export function generateTemplates(a: WizardAnswers, opts: GenerateOptions): GeneratedSet {
  const warm = a.tone === "samimi";
  const hitap = "{hitap}";
  const who = `${genitive(a.companyName.trim())} ${a.senderRole.trim()}`;
  const product = stripEnd(a.productPhrase);
  const dropped: string[] = [];
  const want = warm ? "çok isteriz" : "isteriz";
  const askVerb = a.goal === "demo" ? `size kısa bir demo göstermek ${want}` : `sizinle de görüşmek ${want}`;
  const fl = opts.firstLine ? " {ilk_cumle?}" : "";
  const cal = opts.calendar ? " {takvim_linki?}" : "";

  // --- Davet notu: sığmazsa önce güven cümlesi çıkarılır ---
  const traction = a.tractionLine ? stripEnd(a.tractionLine) : "";
  const inviteFull = traction
    ? `Merhaba ${hitap},${fl} ${product} ${who}. ${capFirst(traction)}, ${askVerb}.`
    : `Merhaba ${hitap},${fl} ${product} ${who}. ${capFirst(askVerb.replace(" de ", " "))}.`;
  const inviteShort = `Merhaba ${hitap},${fl} ${product} ${who}. ${capFirst(askVerb.replace(" de ", " "))}.`;
  // {hitap} gönderimde ~25 karaktere kadar bir isimle dolar; payı hesaba kat.
  const limit = inviteNoteLimit(opts.premium) - 25 + hitap.length;
  let invite = inviteFull;
  if (invite.length > limit && traction) {
    invite = inviteShort;
    dropped.push("Davet notundan güven cümlesi çıkarıldı (karakter sınırı).");
  }

  // --- Detay mesajı ---
  const parts: string[] = [];
  parts.push(`Bağlantı için ${warm ? "çok " : ""}teşekkürler ${hitap}.`);
  parts.push(sentence(`${a.companyName.trim()}; ${product} bir platform`));
  const benefits = a.benefits.map((b) => b.trim()).filter(Boolean);
  if (benefits.length) {
    parts.push(
      `${capFirst(a.audience.trim())} için hedeflediğimiz katkılar:\n` +
        benefits.map((b) => `• ${sentence(capFirst(b))}`).join("\n"),
    );
  }
  const figures = (a.figures ?? []).map((f) => f.trim()).filter(Boolean);
  if (figures.length && a.proofKind !== "yok") {
    parts.push(figures.map((f) => hedgeFigure(f, a.proofKind)).join(" "));
  }
  const proofs = (a.proofs ?? []).map((p) => p.trim()).filter(Boolean);
  const proofLine = proofs.map((p) => sentence(capFirst(p))).join(" ");
  const link = a.link?.trim();
  parts.push([proofLine, link ? `Detaylar: ${link}` : ""].filter(Boolean).join(" "));
  parts.push(GOAL_CLOSE[a.goal] + cal);
  const message = parts.filter((p) => p.trim()).join("\n\n");

  // --- Mevcut bağlantıya ilk mesaj: davet notu yerine, tanışıklık cümlesiyle açılır ---
  const connectedMessage = [
    `Merhaba ${hitap}, LinkedIn'de bağlantıdayız ama sanırım daha önce yazışma fırsatımız olmadı.${fl} ${capFirst(product)} ${who}.`,
    ...parts.slice(2),
  ]
    .filter((p) => p.trim())
    .join("\n\n");

  // --- Takipler ---
  const linkTail = link ? ` ${link}` : "";
  const followUp1 = `Merhaba ${hitap}, önceki mesajımı yoğunluk içinde görmemiş olabilirsiniz. {kurum} için ${GOAL_FOLLOWUP[a.goal]} kısa bir online görüşmede anlatmak isterim.${cal}${linkTail}`;
  const followUp2 = `Merhaba ${hitap}, son kez yazıyorum. Şu an uygun değilse sorun değil; ilerleyen dönemde konuşmak isterseniz buradayım.${linkTail}`;

  const rules = rulesFromAnswers(a, opts.premium);
  const issues: Record<StepKind, Issue[]> = {
    invite: checkMessage(invite, "invite_note", rules),
    message: checkMessage(message, "message", rules),
    connectedMessage: checkMessage(connectedMessage, "message", rules),
    followUp1: checkMessage(followUp1, "message", { ...rules, requiredLink: undefined }),
    followUp2: checkMessage(followUp2, "message", { ...rules, requiredLink: undefined }),
  };

  return { invite, message, connectedMessage, followUp1, followUp2, issues, dropped };
}
