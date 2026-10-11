"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { emailAllowed } from "@/lib/context";
import { supabaseServer } from "@/lib/supabase";

export interface AuthState {
  error?: string;
  info?: string;
}

const safeNext = (v: FormDataEntryValue | null) => {
  const s = typeof v === "string" ? v : "";
  return s.startsWith("/") && !s.startsWith("//") ? s : "/";
};

export async function signIn(_: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { error: "E-posta ve şifre gerekli." };
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (/confirm/i.test(error.message)) return { error: "E-posta adresiniz henüz doğrulanmadı. Gelen kutunuzdaki bağlantıya tıklayın." };
    return { error: "E-posta ya da şifre hatalı." };
  }
  redirect(safeNext(form.get("sonra")));
}

export async function signUp(_: AuthState, form: FormData): Promise<AuthState> {
  const name = String(form.get("name") ?? "").trim();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!name || !email) return { error: "Ad ve e-posta gerekli." };
  if (password.length < 10) return { error: "Şifre en az 10 karakter olmalı." };
  if (!(await emailAllowed(email))) return { error: "Bu e-posta adresi için kayıt açık değil. Sizi ekibine eklemesini isteyin." };

  const h = await headers();
  const origin = h.get("origin") ?? `https://${h.get("host")}`;
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name }, emailRedirectTo: `${origin}/auth/callback` },
  });
  if (error) return { error: /registered/i.test(error.message) ? "Bu e-posta ile zaten bir hesap var. Giriş yapın." : "Kayıt tamamlanamadı. Bir süre sonra tekrar deneyin." };
  if (data.session) redirect("/");
  return { info: "Doğrulama bağlantısı e-posta adresinize gönderildi. Bağlantıya tıkladıktan sonra giriş yapabilirsiniz." };
}
