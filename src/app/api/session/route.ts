import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, db } from "@/lib/firebase-admin";
import { SESSION_COOKIE, SESSION_MAX_AGE_MS } from "@/lib/session";
import { col } from "@/lib/server/repo";
import { writeAudit } from "@/lib/server/tx";

export const runtime = "nodejs";

/** Se a pessoa tiver um convite e ainda não pertencer a um negócio, entra no negócio que a convidou. */
async function acceptPendingInvite(uid: string, email: string, name: string): Promise<void> {
  if (!email) return;
  const userRef = col.users().doc(uid);
  const inviteRef = col.invites().doc(email.toLowerCase());
  await db().runTransaction(async (tx) => {
    const [userSnap, inviteSnap] = await tx.getAll(userRef, inviteRef);
    if (userSnap.exists && userSnap.get("businessId")) return;
    if (!inviteSnap.exists) return;
    const businessId = String(inviteSnap.get("businessId"));
    tx.set(userRef, { email, name, businessId, createdAt: FieldValue.serverTimestamp() });
    tx.delete(inviteRef);
    writeAudit(tx, businessId, { uid, name }, {
      kind: "utilizadores",
      action: "convite_aceite",
      label: `${name || email} entrou no negócio`,
    });
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { idToken?: unknown } | null;
  const idToken = typeof body?.idToken === "string" ? body.idToken : "";
  if (!idToken) return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });

  try {
    const decoded = await adminAuth().verifyIdToken(idToken);
    if (Date.now() / 1000 - decoded.auth_time > 5 * 60) {
      return NextResponse.json({ error: "Inicie sessão novamente." }, { status: 401 });
    }
    if (!decoded.email || decoded.email_verified === false) {
      return NextResponse.json({ error: "A conta Google não tem um email verificado." }, { status: 403 });
    }
    const sessionCookie = await adminAuth().createSessionCookie(idToken, { expiresIn: SESSION_MAX_AGE_MS });
    const name = typeof decoded.name === "string" ? decoded.name : decoded.email;
    await acceptPendingInvite(decoded.uid, decoded.email, name);

    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE, sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: Math.floor(SESSION_MAX_AGE_MS / 1000),
    });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Falha no início de sessão", message);
    if (message.startsWith("Configuração do Firebase")) {
      return NextResponse.json({ error: message }, { status: 500 });
    }
    return NextResponse.json({ error: "Não foi possível iniciar sessão. Tente de novo." }, { status: 401 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return response;
}
