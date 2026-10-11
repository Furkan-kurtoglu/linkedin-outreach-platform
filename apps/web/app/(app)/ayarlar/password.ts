"use server";
import { requireContext } from "@/lib/context";
import { supabaseServer } from "@/lib/supabase";

export interface PwState {
  ok?: boolean;
  error?: string;
}

export async function changePassword(_: PwState, form: FormData): Promise<PwState> {
  await requireContext();
  const p1 = String(form.get("password") ?? "");
  const p2 = String(form.get("password2") ?? "");
  if (p1.length < 10) return { error: "Şifre en az 10 karakter olmalı." };
  if (p1 !== p2) return { error: "Şifreler aynı değil." };
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.updateUser({ password: p1 });
  if (error) return { error: /different/i.test(error.message) ? "Yeni şifre eskisiyle aynı olamaz." : "Şifre değiştirilemedi. Çıkış yapıp tekrar girerek deneyin." };
  return { ok: true };
}
