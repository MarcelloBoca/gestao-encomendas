import { NextResponse, type NextRequest } from "next/server";

// Sem cookie de sessão, as páginas redirecionam para o login. A sessão é validada a sério no servidor
// (getContext) em cada página e ação.
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (pathname === "/login" || pathname.startsWith("/api/session") || pathname === "/api/saude" || pathname.startsWith("/__/auth") || pathname.startsWith("/__/firebase")) {
    return NextResponse.next();
  }
  if (request.cookies.get("__session")?.value) return NextResponse.next();

  if (request.method !== "GET" && request.method !== "HEAD") {
    return new NextResponse("Sessão expirada. Entre novamente.", { status: 401 });
  }
  const loginUrl = new URL("/login", request.url);
  if (pathname !== "/") loginUrl.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|icon-192.png|icon-512.png|apple-icon.png|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
