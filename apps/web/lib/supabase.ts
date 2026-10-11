import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { env } from "./env";

/** Oturum çerezleriyle çalışan Supabase istemcisi (sunucu bileşenleri ve sunucu işlemleri). */
export async function supabaseServer() {
  const store = await cookies();
  return createServerClient(env.supabaseUrl(), env.supabaseAnonKey(), {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list: { name: string; value: string; options: CookieOptions }[]) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Sunucu bileşeninden çağrıldığında çerez yazılamaz; ara katman oturumu yeniler.
        }
      },
    },
  });
}

/**
 * Yönetici istemcisi: yalnızca sunucuda, belge depolama için. Anahtar asla tarayıcıya
 * ya da yerel çalışana verilmez.
 */
export function supabaseAdmin() {
  return createClient(env.supabaseUrl(), env.serviceRoleKey(), { auth: { persistSession: false } });
}

export const FILES_BUCKET = "belgeler";
