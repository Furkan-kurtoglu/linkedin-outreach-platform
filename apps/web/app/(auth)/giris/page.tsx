import type { Metadata } from "next";
import { AuthForm } from "../AuthForm";

export const metadata: Metadata = { title: "Giriş" };

export default async function Page({ searchParams }: { searchParams: Promise<{ sonra?: string; hata?: string }> }) {
  const sp = await searchParams;
  const notice =
    sp.hata === "izin"
      ? "Bu e-posta adresinin panele erişimi yok. Sizi ekibine eklemesini isteyin."
      : sp.hata === "dogrulama"
        ? "Doğrulama bağlantısı geçersiz ya da süresi dolmuş. Tekrar kayıt olmayı deneyin."
        : undefined;
  return <AuthForm mode="in" next={sp.sonra} notice={notice} />;
}
