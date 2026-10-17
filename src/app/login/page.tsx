import type { Metadata } from "next";
import { hasAnyLogin } from "@/lib/server/data";
import LoginForm from "./LoginForm";

export const metadata: Metadata = { title: "Entrar" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const next = typeof params.next === "string" && params.next.startsWith("/") && !params.next.startsWith("//") ? params.next : "/";
  const notice = params.saiu === "1" ? "A sessão terminou. Entre de novo." : undefined;
  const firstAccess = !(await hasAnyLogin().catch(() => true));
  return <LoginForm next={next} notice={notice} firstAccess={firstAccess} />;
}
