import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Herkese açık yollar: giriş, kayıt, e-posta doğrulama ve yerel çalışanın API'si (kendi anahtarıyla). */
const PUBLIC = ["/giris", "/kayit", "/auth", "/api/runner"];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });

  const path = request.nextUrl.pathname;
  if (PUBLIC.some((p) => path === p || path.startsWith(`${p}/`))) return response;

  // Oturumu yeniler; kullanıcı yoksa girişe yönlendirir
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/giris";
    url.search = path === "/" ? "" : `?sonra=${encodeURIComponent(path)}`;
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
