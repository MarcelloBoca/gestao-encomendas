"use server";

import { timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { db } from "@/lib/firebase-admin";
import { UserError } from "@/lib/domain";
import { SESSION_COOKIE, SESSION_MAX_AGE_MS, forgetContext, requireSessionUser } from "@/lib/session";
import { col, toMs } from "@/lib/server/repo";
import {
  LOCK_MINUTES,
  MAX_FAILED_ATTEMPTS,
  hashPassword,
  isValidUsername,
  normalizeUsername,
  validateNewPassword,
  validateUsername,
  verifyAgainstDummy,
  verifyPassword,
} from "@/lib/server/password";
import { createSessionToken } from "@/lib/server/session-token";
import { required, text, toActionError, writeAudit } from "@/lib/server/tx";
import type { ActionState } from "@/lib/types";

const WRONG = "Utilizador ou palavra-passe errados. Verifique e tente de novo.";

function safeNext(value: string): string {
  return value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/login") ? value : "/";
}

function rawPassword(fd: FormData, name: string): string {
  const value = fd.get(name);
  return typeof value === "string" ? value.slice(0, 200) : "";
}

async function startSession(user: { uid: string; username: string; name: string; version: number }): Promise<void> {
  const token = createSessionToken({ uid: user.uid, email: user.username, name: user.name, version: user.version }, SESSION_MAX_AGE_MS);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(SESSION_MAX_AGE_MS / 1000),
  });
}

export async function login(_prev: ActionState, fd: FormData): Promise<ActionState> {
  let target = "/";
  try {
    const username = normalizeUsername(text(fd, "username", 64));
    const password = rawPassword(fd, "password");
    target = safeNext(text(fd, "next", 300));
    if (!username || !password) return { error: "Escreva o utilizador e a palavra-passe." };

    if (!isValidUsername(username)) {
      await verifyAgainstDummy(password);
      return { error: WRONG };
    }
    const loginRef = col.logins().doc(username);
    const loginSnap = await loginRef.get();
    if (!loginSnap.exists) {
      await verifyAgainstDummy(password);
      return { error: WRONG };
    }

    const lockedUntil = toMs(loginSnap.get("lockedUntil"));
    if (lockedUntil && lockedUntil > Date.now()) {
      const minutes = Math.max(1, Math.ceil((lockedUntil - Date.now()) / 60_000));
      return { error: `Demasiadas tentativas erradas. Tente de novo daqui a ${minutes} ${minutes === 1 ? "minuto" : "minutos"}.` };
    }

    const ok = await verifyPassword(password, String(loginSnap.get("passwordHash") ?? ""));
    if (!ok) {
      const failed = Number(loginSnap.get("failed") ?? 0) + 1;
      if (failed >= MAX_FAILED_ATTEMPTS) {
        await loginRef.update({ failed: 0, lockedUntil: Timestamp.fromMillis(Date.now() + LOCK_MINUTES * 60_000) });
        return { error: `Demasiadas tentativas erradas. A conta fica bloqueada durante ${LOCK_MINUTES} minutos.` };
      }
      await loginRef.update({ failed });
      return { error: WRONG };
    }

    const uid = String(loginSnap.get("uid") ?? "");
    const userSnap = uid ? await col.users().doc(uid).get() : null;
    if (!userSnap?.exists) return { error: "Esta conta já não tem acesso à loja. Fale com a administradora." };
    if (Number(loginSnap.get("failed") ?? 0) > 0 || loginSnap.get("lockedUntil")) {
      await loginRef.update({ failed: 0, lockedUntil: null });
    }

    await startSession({
      uid,
      username,
      name: String(userSnap.get("name") || username),
      version: Number(userSnap.get("sessionVersion") ?? 0),
    });
    if (userSnap.get("mustChangePassword")) target = "/palavra-passe";
  } catch (error) {
    return toActionError(error);
  }
  redirect(target);
}

function codeMatches(input: string): boolean {
  const expected = process.env.SETUP_CODE?.trim() ?? "";
  if (!expected) return false;
  const a = Buffer.from(input.trim());
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Primeiro acesso: cria a conta da administradora quando ainda não existe nenhuma conta.
 * Protegido pelo código SETUP_CODE definido no Vercel. Liga-se ao proprietário do negócio que já existe.
 */
export async function setupFirstAdmin(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    if (!process.env.SETUP_CODE?.trim()) {
      throw new UserError("Falta definir o código de configuração (SETUP_CODE) no Vercel.");
    }
    if (!codeMatches(text(fd, "code", 200))) throw new UserError("O código de configuração não está certo.");
    const name = required(fd, "name", "O seu nome", 80);
    const username = validateUsername(text(fd, "username", 64));
    const password = validateNewPassword(rawPassword(fd, "password"), rawPassword(fd, "confirm"));
    const passwordHash = await hashPassword(password);

    const result = await db().runTransaction(async (tx) => {
      const existing = await tx.get(col.logins().limit(1));
      if (!existing.empty) throw new UserError("A conta da administradora já foi criada. Entre com o seu utilizador.");
      const businesses = await tx.get(db().collection("businesses").limit(2));
      if (businesses.size > 1) throw new UserError("Há mais do que um negócio na base de dados. Fale com quem configurou a app.");

      const business = businesses.docs[0];
      const ownerUid = business ? String(business.get("ownerUid") ?? "") : "";
      const uid = ownerUid || col.users().doc().id;
      const userRef = col.users().doc(uid);
      tx.set(
        userRef,
        {
          name,
          username,
          mustChangePassword: false,
          sessionVersion: 1,
          ...(business ? { businessId: business.id } : {}),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      tx.set(col.logins().doc(username), { uid, passwordHash, failed: 0, lockedUntil: null, createdAt: FieldValue.serverTimestamp() });
      if (business) {
        writeAudit(tx, business.id, { uid, name }, {
          kind: "utilizadores",
          action: "primeiro_acesso",
          label: `Conta de administradora criada (${username})`,
        });
      }
      return { uid };
    });

    forgetContext();
    await startSession({ uid: String(result.uid), username, name, version: 1 });
  } catch (error) {
    return toActionError(error);
  }
  redirect("/");
}

/** Mudar a própria palavra-passe (obrigatório na primeira entrada com uma palavra-passe dada pela administradora). */
export async function changePassword(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const session = await requireSessionUser();
    const userRef = col.users().doc(session.uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) throw new UserError("Esta conta já não tem acesso à loja.");
    const username = String(userSnap.get("username") ?? "");
    if (!username) throw new UserError("Esta conta ainda não tem utilizador. Peça à administradora para criar uma.");
    const forced = Boolean(userSnap.get("mustChangePassword"));
    const currentVersion = Number(userSnap.get("sessionVersion") ?? 0);
    if (currentVersion !== (session.version ?? 0)) throw new UserError("A sessão terminou. Entre de novo.");

    const loginRef = col.logins().doc(username);
    const loginSnap = await loginRef.get();
    if (!loginSnap.exists) throw new UserError("Esta conta já não tem acesso à loja.");
    if (!forced) {
      const ok = await verifyPassword(rawPassword(fd, "current"), String(loginSnap.get("passwordHash") ?? ""));
      if (!ok) throw new UserError("A palavra-passe atual não está certa.");
    }
    const password = validateNewPassword(rawPassword(fd, "password"), rawPassword(fd, "confirm"));
    if (await verifyPassword(password, String(loginSnap.get("passwordHash") ?? ""))) {
      throw new UserError("Escolha uma palavra-passe diferente da anterior.");
    }
    const passwordHash = await hashPassword(password);
    const version = currentVersion + 1;
    const batch = db().batch();
    batch.update(loginRef, { passwordHash, failed: 0, lockedUntil: null, updatedAt: FieldValue.serverTimestamp() });
    batch.update(userRef, { mustChangePassword: false, sessionVersion: version, updatedAt: FieldValue.serverTimestamp() });
    await batch.commit();

    forgetContext();
    await startSession({ uid: session.uid, username, name: String(userSnap.get("name") || username), version });
  } catch (error) {
    return toActionError(error);
  }
  redirect("/?msg=palavra-passe");
}
