import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Next 16'da `middleware.ts` yerine `proxy.ts` (fonksiyon adı da `proxy`).
 *
 * BURASI GÜVENLİK KATMANI DEĞİLDİR. Yaptığı tek şey oturum çerezinin VAR OLUP
 * OLMADIĞINA bakıp kullanıcıyı /login'e yollamak — yani UX.
 *
 * JWT'yi bilinçli olarak DOĞRULAMIYOR: imza secret'ını panel tarafına taşımak
 * gereksiz bir sır yayılımı olurdu ve gerçek yetkilendirme zaten Express'in
 * işi. Çerezi elle uydurup bu kontrolü geçen biri, ilk API çağrısında 401 alır.
 */
const PUBLIC_PATHS = ["/login", "/register"];

export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  const hasSession = request.cookies.has("va_at") || request.cookies.has("va_rt");
  const isPublic = PUBLIC_PATHS.some((path) => pathname.startsWith(path));

  if (!hasSession && !isPublic) {
    const loginUrl = new URL("/login", request.url);
    // Giriş sonrası kullanıcıyı gitmek istediği sayfaya geri götürebilmek için.
    if (pathname !== "/") loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (hasSession && isPublic) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Statik dosyalar, Next'in kendi varlıkları ve API rewrite'ı hariç her şey.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|backend/).*)"],
};
