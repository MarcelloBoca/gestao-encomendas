import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Termina a sessão (conta removida, palavra-passe mudada noutro aparelho ou botão Terminar sessão). */
export async function GET(request: Request) {
  const url = new URL("/login?saiu=1", request.url);
  const response = NextResponse.redirect(url);
  response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return response;
}
