import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { db, describeFirebaseError, firebaseProjectId, withTimeout } from "@/lib/firebase-admin";
import { SESSION_COOKIE, SESSION_MAX_AGE_MS } from "@/lib/session";
import { InvalidIdTokenError, verifyFirebaseIdToken } from "@/lib/server/id-token";
import { createSessionToken } from "@/lib/server/session-token";
import { col } from "@/lib/server/repo";
import { writeAudit } from "@/lib/server/tx";

export const runtime = "nodejs";
export const maxDuration = 30;

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
    const user = await withTimeout(verifyFirebaseIdToken(idToken, firebaseProjectId()), 10_000, "Verificação do login Google");
    if (Date.now() / 1000 - user.authTime > 5 * 60) {
      return NextResponse.json({ error: "Inicie sessão novamente." }, { status: 401 });
    }
    if (!user.email || !user.emailVerified) {
      return NextResponse.json({ error: "A conta Google não tem um email verificado." }, { status: 403 });
    }

    await withTimeout(acceptPendingInvite(user.uid, user.email, user.name), 10_000, "Firestore");
    const token = createSessionToken({ uid: user.uid, email: user.email, name: user.name }, SESSION_MAX_AGE_MS);

    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE, token, {
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
    if (error instanceof InvalidIdTokenError) {
      return NextResponse.json({ error: `${message}. Inicie sessão novamente.` }, { status: 401 });
    }
    const setup = describeFirebaseError(error);
    if (setup) return NextResponse.json({ error: setup }, { status: 500 });
    if (message.includes("sem resposta em")) {
      return NextResponse.json(
        { error: `${message}. Verifique se o Firestore foi criado e se a chave do servidor no Vercel é a do projeto ${firebaseProjectId()}.` },
        { status: 504 },
      );
    }
    return NextResponse.json({ error: `Não foi possível iniciar sessão: ${message.slice(0, 160)}` }, { status: 500 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return response;
}
