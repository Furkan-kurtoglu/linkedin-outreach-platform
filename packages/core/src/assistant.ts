/**
 * İsteğe bağlı yapay zekâ yardımcısı ("Daha iyi yap", "Kısalt", "3 alternatif").
 *
 * İlkeler:
 * - Sistem bu modül olmadan tam çalışır. Anahtar yoksa ya da günlük ücretsiz hak dolduysa
 *   kullanıcıya açık bir mesaj gösterilir, başka hiçbir şey etkilenmez.
 * - Yapay zekâya yalnızca şablon metni ({hitap}, {kurum} değişkenleriyle) ve işletme bilgisi
 *   gider; kişilerin adı veya profil verisi asla gönderilmez.
 * - Gelen her öneri kural denetiminden geçer; geçmeyen öneri kullanıcıya hiç gösterilmez.
 * - Öneri kabul edilse bile yeni sürüm "taslak" olur; kullanıcı onaylamadan gönderilmez.
 */
import { checkMessage, type MessageKind, type TemplateRules } from "./template";

export type AssistAction = "better" | "shorter" | "warmer" | "formal" | "alternatives" | "custom";

export interface AssistRequest {
  action: AssistAction;
  template: string;
  kind: MessageKind;
  /** Serbest istek ("klinikler için görünürlük vurgusunu artır") */
  instruction?: string;
  /** İşletme bağlamı: ürün cümlesi, kitle, kanıtlar (kişisel veri değil) */
  businessContext: string;
  rules: TemplateRules;
}

export interface Suggestion {
  text: string;
  why: string;
}

export type AssistResult =
  | { ok: true; suggestions: Suggestion[]; rejected: number }
  | { ok: false; reason: "no_key" | "daily_limit" | "unavailable" | "unsafe_input" | "no_valid_suggestion"; message: string };

export interface AiProvider {
  readonly name: string;
  complete(system: string, user: string): Promise<string>;
}

export class AiLimitError extends Error {}

const ACTION_TEXT: Record<AssistAction, string> = {
  better: "Metni daha net ve ikna edici yap; anlamı ve iddiaları koru.",
  shorter: "Metni kısalt; en önemli faydayı ve görüşme talebini koru.",
  warmer: "Tonu daha samimi yap; saygılı kal, abartma.",
  formal: "Tonu daha resmi yap.",
  alternatives: "Üç farklı yaklaşımla üç alternatif yaz.",
  custom: "Kullanıcının isteğini uygula.",
};

/** Şablonun kişisel veri içermediğini doğrular: yalnızca değişkenli şablon gönderilebilir. */
export function looksPersonal(template: string): boolean {
  // E-posta, telefon numarası ya da linkedin.com/in profil linki
  return /[\w.+-]+@[\w-]+\.[\w.]+|(\+?90|0)?\s?5\d{2}\s?\d{3}\s?\d{2}\s?\d{2}|linkedin\.com\/in\//i.test(template);
}

export function buildPrompt(req: AssistRequest): { system: string; user: string } {
  const limit = req.kind === "invite_note" ? (req.rules.premium ? 300 : 200) : 1500;
  const system = [
    "Sen Türkçe B2B LinkedIn mesajları yazan bir editörsün.",
    "Kurallar:",
    "- {hitap} ve {kurum} değişkenlerini aynen koru; yerlerine isim yazma.",
    "- Karşı tarafın kurumunda sorun varmış gibi yazma; rakamları yalnızca 'sektör çalışmalarına göre' diye ver.",
    "- Kesin vaat verme; 'hedefliyoruz', 'yardımcı oluyor' gibi ifadeler kullan.",
    "- Görüşme için süre yazma (ör. '20 dakika').",
    `- Şu ifadeleri asla kullanma: ${req.rules.bannedPhrases.join(", ") || "(yok)"}.`,
    `- Şu kurumların adını asla yazma: ${req.rules.excludedCompanies.join(", ") || "(yok)"}.`,
    req.rules.requiredLink && req.kind !== "invite_note" ? `- Metinde şu link mutlaka geçsin: ${req.rules.requiredLink}` : "",
    `- Metin ${limit} karakteri geçmesin (değişkenler dahil).`,
    'Yalnızca JSON döndür: {"suggestions":[{"text":"...","why":"Türkçe tek cümle gerekçe"}]}',
  ]
    .filter(Boolean)
    .join("\n");
  const user = [
    `İşletme bilgisi: ${req.businessContext}`,
    `Mesaj türü: ${req.kind === "invite_note" ? "bağlantı daveti notu" : "LinkedIn mesajı"}`,
    `Görev: ${ACTION_TEXT[req.action]}${req.instruction ? ` İstek: ${req.instruction}` : ""}`,
    req.action === "alternatives" ? "3 öneri döndür." : "1 öneri döndür.",
    "Mevcut metin:",
    req.template,
  ].join("\n");
  return { system, user };
}

export function parseSuggestions(raw: string): Suggestion[] {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "");
  try {
    const data = JSON.parse(cleaned) as { suggestions?: { text?: unknown; why?: unknown }[] };
    return (data.suggestions ?? [])
      .filter((s) => typeof s.text === "string" && s.text.trim())
      .map((s) => ({ text: String(s.text).trim(), why: typeof s.why === "string" ? s.why : "" }));
  } catch {
    return [];
  }
}

export async function assist(req: AssistRequest, provider: AiProvider | null): Promise<AssistResult> {
  if (!provider) {
    return { ok: false, reason: "no_key", message: "Yapay zekâ önerileri için Ayarlar'dan ücretsiz Gemini anahtarı ekleyin. Kural denetimi ve şablonlar anahtarsız çalışmaya devam eder." };
  }
  if (looksPersonal(req.template)) {
    return { ok: false, reason: "unsafe_input", message: "Şablonda kişisel bilgi var gibi görünüyor (e-posta, telefon ya da profil linki). Yapay zekâya gönderilmedi." };
  }
  const { system, user } = buildPrompt(req);
  let raw: string;
  try {
    raw = await provider.complete(system, user);
  } catch (e) {
    if (e instanceof AiLimitError) {
      return { ok: false, reason: "daily_limit", message: "Bugünkü ücretsiz yapay zekâ hakkı doldu. Yarın tekrar deneyebilirsiniz; şablonlar ve gönderim etkilenmez." };
    }
    return { ok: false, reason: "unavailable", message: "Yapay zekâ servisine şu an ulaşılamıyor. Daha sonra tekrar deneyin." };
  }
  const all = parseSuggestions(raw);
  const valid = all.filter((s) => {
    if (!s.text.includes("{hitap}") && req.template.includes("{hitap}")) return false;
    return checkMessage(s.text, req.kind, req.rules).length === 0;
  });
  if (!valid.length) {
    return { ok: false, reason: "no_valid_suggestion", message: "Gelen öneriler kurallara uymadığı için gösterilmedi. Tekrar deneyebilirsiniz." };
  }
  return { ok: true, suggestions: valid, rejected: all.length - valid.length };
}

/** Google Gemini API (ücretsiz katman) bağlantısı. Model adı ayarlardan değiştirilebilir. */
export class GeminiProvider implements AiProvider {
  readonly name = "gemini";
  private readonly apiKey: string;
  private readonly model: string;
  private readonly fetchFn: typeof fetch;

  constructor(apiKey: string, model = "gemini-2.5-flash", fetchFn: typeof fetch = fetch) {
    this.apiKey = apiKey;
    this.model = model;
    this.fetchFn = fetchFn;
  }

  async complete(system: string, user: string): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`;
    const res = await this.fetchFn(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": this.apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { temperature: 0.7, responseMimeType: "application/json" },
      }),
    });
    if (res.status === 429) throw new AiLimitError("rate limit");
    if (!res.ok) throw new Error(`Gemini ${res.status}`);
    const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    return data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  }
}
