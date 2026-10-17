"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firebase-admin";
import { DEFAULT_TZ } from "@/lib/dates";
import { UserError } from "@/lib/domain";
import { STORE_COOKIE, forgetContext, getContext, requireSessionUser } from "@/lib/session";
import { col } from "@/lib/server/repo";
import { hashPassword, validateNewPassword, validateUsername } from "@/lib/server/password";
import { required, text, toActionError, writeAudit } from "@/lib/server/tx";
import type { ActionState } from "@/lib/types";

function parsePrefix(fd: FormData): string {
  const prefix = text(fd, "prefix", 10).toUpperCase();
  if (!/^[A-Z0-9]{2,5}$/.test(prefix)) {
    throw new UserError("O prefixo tem de ter 2 a 5 letras ou números, por exemplo MAP.");
  }
  return prefix;
}

export async function createBusiness(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requireSessionUser();
    const businessName = required(fd, "businessName", "O nome do negócio", 120);
    const storeName = required(fd, "storeName", "O nome da loja", 80);
    const prefix = parsePrefix(fd);
    const userRef = col.users().doc(user.uid);

    await db().runTransaction(async (tx) => {
      const userSnap = await tx.get(userRef);
      if (!userSnap.exists) throw new UserError("Esta conta já não tem acesso. Entre de novo.");
      if (userSnap.get("businessId")) throw new UserError("A sua conta já pertence a um negócio.");

      const businessRef = db().collection("businesses").doc();
      tx.set(businessRef, {
        name: businessName,
        currency: "MZN",
        timezone: DEFAULT_TZ,
        ownerUid: user.uid,
        createdAt: FieldValue.serverTimestamp(),
      });
      tx.set(col.stores(businessRef.id).doc(), {
        name: storeName,
        prefix,
        counter: 0,
        archived: false,
        createdAt: FieldValue.serverTimestamp(),
      });
      tx.set(userRef, { businessId: businessRef.id, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    });
  } catch (error) {
    return toActionError(error);
  }
  forgetContext();
  revalidatePath("/", "layout");
  redirect("/");
}

export async function renameBusiness(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await getContext();
    const name = required(fd, "name", "O nome do negócio", 120);
    await db().collection("businesses").doc(ctx.businessId).update({ name });
    forgetContext();
    revalidatePath("/", "layout");
    return { ok: true, message: "Nome do negócio guardado." };
  } catch (error) {
    return toActionError(error);
  }
}

export async function saveStore(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await getContext();
    const storeId = text(fd, "storeId", 80);
    const name = required(fd, "name", "O nome da loja", 80);
    if (storeId) {
      if (!ctx.stores.some((s) => s.id === storeId)) throw new UserError("A loja já não existe.");
      await col.stores(ctx.businessId).doc(storeId).update({ name });
    } else {
      const prefix = parsePrefix(fd);
      if (ctx.stores.some((s) => s.prefix === prefix)) throw new UserError(`O prefixo ${prefix} já é usado por outra loja.`);
      await col.stores(ctx.businessId).add({ name, prefix, counter: 0, archived: false, createdAt: FieldValue.serverTimestamp() });
    }
    forgetContext();
    revalidatePath("/", "layout");
    return { ok: true, message: storeId ? "Loja alterada." : "Loja criada." };
  } catch (error) {
    return toActionError(error);
  }
}

export async function setStoreArchived(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await getContext();
    const storeId = required(fd, "storeId", "A loja", 80);
    const archived = text(fd, "archived", 5) === "1";
    if (archived && ctx.activeStores.filter((s) => s.id !== storeId).length === 0) {
      throw new UserError("O negócio precisa de pelo menos uma loja ativa.");
    }
    await col.stores(ctx.businessId).doc(storeId).update({ archived });
    forgetContext();
    revalidatePath("/", "layout");
    return { ok: true, message: archived ? "Loja arquivada." : "Loja reativada." };
  } catch (error) {
    return toActionError(error);
  }
}

function ownerOnly(ctx: { isOwner: boolean }): void {
  if (!ctx.isOwner) throw new UserError("Só a administradora pode gerir as contas.");
}

function rawPassword(fd: FormData, name: string): string {
  const value = fd.get(name);
  return typeof value === "string" ? value.slice(0, 200) : "";
}

/** A administradora cria uma conta. A pessoa tem de mudar a palavra-passe na primeira entrada. */
export async function createAccount(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await getContext();
    ownerOnly(ctx);
    const name = required(fd, "name", "O nome", 80);
    const username = validateUsername(text(fd, "username", 64));
    const password = validateNewPassword(rawPassword(fd, "password"));
    const passwordHash = await hashPassword(password);
    const userRef = col.users().doc();
    const loginRef = col.logins().doc(username);

    await db().runTransaction(async (tx) => {
      const existing = await tx.get(loginRef);
      if (existing.exists) throw new UserError(`O utilizador ${username} já existe. Escolha outro.`);
      tx.set(loginRef, { uid: userRef.id, passwordHash, failed: 0, lockedUntil: null, createdAt: FieldValue.serverTimestamp() });
      tx.set(userRef, {
        businessId: ctx.businessId,
        name,
        username,
        mustChangePassword: true,
        sessionVersion: 1,
        createdByUid: ctx.uid,
        createdAt: FieldValue.serverTimestamp(),
      });
      writeAudit(tx, ctx.businessId, { uid: ctx.uid, name: ctx.name }, {
        kind: "utilizadores",
        action: "conta_criada",
        label: `Conta criada para ${name} (${username})`,
      });
    });
    revalidatePath("/definicoes");
    return { ok: true, message: `Conta criada. Diga a ${name} para entrar com o utilizador ${username} e a palavra-passe que escolheu; vai ter de a mudar na primeira entrada.` };
  } catch (error) {
    return toActionError(error);
  }
}

/** A administradora define uma palavra-passe temporária para uma conta (por exemplo, quando a pessoa a esqueceu). */
export async function resetPassword(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await getContext();
    ownerOnly(ctx);
    const uid = required(fd, "uid", "A conta", 128);
    if (uid === ctx.uid) throw new UserError("Para a sua própria conta, use Mudar palavra-passe.");
    const password = validateNewPassword(rawPassword(fd, "password"));
    const passwordHash = await hashPassword(password);
    const userRef = col.users().doc(uid);

    let name = "";
    await db().runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists || snap.get("businessId") !== ctx.businessId) throw new UserError("Esta conta não pertence ao negócio.");
      const username = String(snap.get("username") ?? "");
      if (!username) throw new UserError("Esta é uma conta antiga do Google. Crie uma conta nova para esta pessoa e remova a antiga.");
      name = String(snap.get("name") || username);
      tx.update(col.logins().doc(username), { passwordHash, failed: 0, lockedUntil: null, updatedAt: FieldValue.serverTimestamp() });
      tx.update(userRef, {
        mustChangePassword: true,
        sessionVersion: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      });
      writeAudit(tx, ctx.businessId, { uid: ctx.uid, name: ctx.name }, {
        kind: "utilizadores",
        action: "palavra_passe_reposta",
        label: `Palavra-passe reposta para ${name} (${username})`,
      });
    });
    forgetContext();
    revalidatePath("/definicoes");
    return { ok: true, message: `Palavra-passe temporária definida para ${name}. Vai ter de a mudar na próxima entrada.` };
  } catch (error) {
    return toActionError(error);
  }
}

export async function removeUser(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await getContext();
    ownerOnly(ctx);
    const uid = required(fd, "uid", "O utilizador", 128);
    if (uid === ctx.ownerUid) throw new UserError("A administradora não pode ser removida.");
    const ref = col.users().doc(uid);
    await db().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists || snap.get("businessId") !== ctx.businessId) throw new UserError("Este utilizador não pertence ao negócio.");
      const username = String(snap.get("username") ?? "");
      tx.delete(ref);
      if (username) tx.delete(col.logins().doc(username));
      writeAudit(tx, ctx.businessId, { uid: ctx.uid, name: ctx.name }, {
        kind: "utilizadores",
        action: "remocao",
        label: `${String(snap.get("name") || username || snap.get("email"))} deixou de ter acesso`,
      });
    });
    forgetContext();
    revalidatePath("/definicoes");
    return { ok: true, message: "Conta removida. A pessoa deixa de conseguir entrar." };
  } catch (error) {
    return toActionError(error);
  }
}

export async function transferOwnership(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await getContext();
    ownerOnly(ctx);
    const uid = required(fd, "uid", "O utilizador", 128);
    if (uid === ctx.uid) throw new UserError("Já é a administradora.");
    const userRef = col.users().doc(uid);
    const businessRef = db().collection("businesses").doc(ctx.businessId);
    await db().runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists || snap.get("businessId") !== ctx.businessId) throw new UserError("Este utilizador não pertence ao negócio.");
      if (!snap.get("username")) throw new UserError("Esta conta antiga do Google já não consegue entrar. Crie primeiro uma conta com utilizador.");
      tx.update(businessRef, { ownerUid: uid });
      writeAudit(tx, ctx.businessId, { uid: ctx.uid, name: ctx.name }, {
        kind: "utilizadores",
        action: "propriedade",
        label: `A administração passou para ${String(snap.get("name") || snap.get("username") || snap.get("email"))}`,
      });
    });
    forgetContext();
    revalidatePath("/", "layout");
    return { ok: true, message: "A administração foi transferida." };
  } catch (error) {
    return toActionError(error);
  }
}

export async function selectStore(fd: FormData): Promise<void> {
  const ctx = await getContext();
  const storeId = text(fd, "storeId", 80);
  const back = text(fd, "back", 300);
  if (ctx.activeStores.some((s) => s.id === storeId)) {
    const jar = await cookies();
    jar.set(STORE_COOKIE, storeId, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: true });
  }
  revalidatePath("/", "layout");
  redirect(back.startsWith("/") && !back.startsWith("//") ? back : "/");
}
