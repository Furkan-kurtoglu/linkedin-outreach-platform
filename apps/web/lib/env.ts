/** Ortam değişkenleri: eksikse anlaşılır bir hata verir. */
function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} ortam değişkeni tanımlı değil. .env.example dosyasına bakın.`);
  return v;
}

export const env = {
  supabaseUrl: () => need("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseAnonKey: () => need("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  serviceRoleKey: () => need("SUPABASE_SERVICE_ROLE_KEY"),
  geminiKey: () => process.env.GEMINI_API_KEY || undefined,
  allowedEmails: (): string[] =>
    (process.env.ALLOWED_EMAILS ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
};
