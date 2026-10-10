/**
 * Şablon doldurma ve gönderim öncesi kural denetimi.
 *
 * Kural: mesaj yalnızca onaylı şablondan üretilir. Bu modül, doldurulmuş
 * metnin gönderilebilir olup olmadığına karar verir; geçmeyen mesaj gönderilmez.
 */

export type MessageKind = "invite_note" | "message";

export interface TemplateRules {
  /** Metinde geçmemesi gereken ifadeler (büyük/küçük harf duyarsız). */
  bannedPhrases: string[];
  /** Hariç tutulan kurum adları; mesajda geçerse gönderilmez. */
  excludedCompanies: string[];
  /** Detay mesajında bulunması zorunlu link (ör. web sitesi). */
  requiredLink?: string;
  /** Hesap Premium mu? Davet notu sınırını belirler. */
  premium: boolean;
}

export interface Issue {
  code:
    | "missing_variable"
    | "banned_phrase"
    | "excluded_company"
    | "too_long"
    | "missing_link"
    | "empty";
  message: string;
}

export interface RenderResult {
  text: string;
  issues: Issue[];
  ok: boolean;
}

/** LinkedIn davet notu karakter sınırı. */
export function inviteNoteLimit(premium: boolean): number {
  return premium ? 300 : 200;
}

/** LinkedIn mesaj karakter sınırı (güvenli üst sınır). */
export const MESSAGE_LIMIT = 8000;

const VARIABLE = /\{([a-z_]+)\}/g;

/** Şablondaki değişken adlarını döner: "Merhaba {ad_soyad}" -> ["ad_soyad"]. */
export function templateVariables(template: string): string[] {
  return [...new Set([...template.matchAll(VARIABLE)].map((m) => m[1]!))];
}

/** Değişkenleri doldurur; eksik değişkeni boş bırakmaz, sorun olarak raporlar. */
export function renderTemplate(
  template: string,
  values: Record<string, string | undefined>,
): { text: string; missing: string[] } {
  const missing: string[] = [];
  const text = template.replace(VARIABLE, (whole, name: string) => {
    const value = values[name]?.trim();
    if (!value) {
      missing.push(name);
      return whole;
    }
    return value;
  });
  return { text, missing: [...new Set(missing)] };
}

/** Doldurulmuş metni kurallara göre denetler. */
export function checkMessage(
  text: string,
  kind: MessageKind,
  rules: TemplateRules,
): Issue[] {
  const issues: Issue[] = [];
  const lower = text.toLocaleLowerCase("tr-TR");

  if (text.trim().length === 0) {
    issues.push({ code: "empty", message: "Mesaj boş." });
    return issues;
  }

  for (const phrase of rules.bannedPhrases) {
    if (phrase && lower.includes(phrase.toLocaleLowerCase("tr-TR"))) {
      issues.push({
        code: "banned_phrase",
        message: `Yasak ifade geçiyor: "${phrase}".`,
      });
    }
  }

  for (const company of rules.excludedCompanies) {
    if (company && lower.includes(company.toLocaleLowerCase("tr-TR"))) {
      issues.push({
        code: "excluded_company",
        message: `Hariç tutulan kurum adı geçiyor: "${company}".`,
      });
    }
  }

  const limit = kind === "invite_note" ? inviteNoteLimit(rules.premium) : MESSAGE_LIMIT;
  if (text.length > limit) {
    issues.push({
      code: "too_long",
      message: `Metin ${text.length} karakter; sınır ${limit}.`,
    });
  }

  if (kind === "message" && rules.requiredLink && !text.includes(rules.requiredLink)) {
    issues.push({
      code: "missing_link",
      message: `Detay mesajında ${rules.requiredLink} linki yok.`,
    });
  }

  return issues;
}

/** Şablonu doldurur ve denetler; ok=false ise mesaj gönderilmez. */
export function prepareMessage(
  template: string,
  values: Record<string, string | undefined>,
  kind: MessageKind,
  rules: TemplateRules,
): RenderResult {
  const { text, missing } = renderTemplate(template, values);
  const issues: Issue[] = missing.map((name) => ({
    code: "missing_variable" as const,
    message: `{${name}} değişkeni doldurulamadı.`,
  }));
  issues.push(...checkMessage(text, kind, rules));
  return { text, issues, ok: issues.length === 0 };
}
