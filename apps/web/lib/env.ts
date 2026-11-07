/** Ortam değişkenleri: eksikse anlaşılır bir hata verir. */
function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} ortam değişkeni tanımlı değil. .env.example dosyasına bakın.`);
  return v;
}

/** İlk tanımlı olanı döner: Supabase'in eski (anon/service_role) ve yeni (publishable/secret) anahtar adları. */
function first(...names: string[]): string {
  for (const n of names) if (process.env[n]) return process.env[n]!;
  return need(names[0]!);
}

export const env = {
  supabaseUrl: () => first("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL"),
  supabaseAnonKey: () => first("NEXT_PUBLIC_SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEY"),
  serviceRoleKey: () => first("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY"),
  geminiKey: () => process.env.GEMINI_API_KEY || undefined,
  /** E-posta bildirimi gönderen adresi (Resend/Brevo'da doğrulanmış alan adından). */
  emailFrom: () => process.env.EMAIL_FROM?.trim() || undefined,
  emailFromName: () => process.env.EMAIL_FROM_NAME?.trim() || "Outreach",
  resendKey: () => process.env.RESEND_API_KEY?.trim() || undefined,
  brevoKey: () => process.env.BREVO_API_KEY?.trim() || undefined,
  /** E-posta gövdesindeki bağlantılar için panelin genel adresi. */
  appUrl: () => process.env.APP_URL?.trim() || "https://linkedin-outreach-platform.vercel.app",
  allowedEmails: (): string[] =>
    (process.env.ALLOWED_EMAILS ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
};
