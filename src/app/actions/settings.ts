"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firebase-admin";
import { DEFAULT_TZ } from "@/lib/dates";
import { UserError } from "@/lib/domain";
import { STORE_COOKIE, getContext, requireSessionUser } from "@/lib/session";
import { col } from "@/lib/server/repo";
import { required, text, toActionError, writeAudit } from "@/lib/server/tx";
import type { ActionState } from "@/lib/types";

function parsePrefix(fd: FormData): string {
  const prefix = text(fd, "prefix", 10).toUpperCase();
  if (!/^[A-Z0-9]{2,5}$/.test(prefix)) {
    throw new UserError("O prefixo tem de ter 2 a 5 letras ou números, por exemplo MAP.");
  }
  return prefix;
}

function parseEmail(fd: FormData): string {
  const email = text(fd, "email", 200).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new UserError("Indique um email válido.");
  return email;
}

export async function createBusiness(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requireSessionUser();
    const businessName = required(fd, "businessName", "O nome do negócio", 120);
    const storeName = required(fd, "storeName", "O nome da loja", 80);
    const prefix = parsePrefix(fd);
    const userRef = col.users().doc(user.uid);
    const inviteRef = col.invites().doc(user.email.toLowerCase());

    await db().runTransaction(async (tx) => {
      const [userSnap, inviteSnap] = await tx.getAll(userRef, inviteRef);
      if (userSnap.exists && userSnap.get("businessId")) throw new UserError("A sua conta já pertence a um negócio.");
      if (inviteSnap.exists) throw new UserError("Tem um convite pendente. Aceite o convite em vez de criar um negócio novo.");

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
      tx.set(userRef, {
        email: user.email,
        name: user.name,
        businessId: businessRef.id,
        createdAt: FieldValue.serverTimestamp(),
      });
    });
  } catch (error) {
    return toActionError(error);
  }
  revalidatePath("/", "layout");
  redirect("/");
}

export async function acceptInvite(_prev: ActionState, fd: FormData): Promise<ActionState> {
  void fd;
  try {
    const user = await requireSessionUser();
    const userRef = col.users().doc(user.uid);
    const inviteRef = col.invites().doc(user.email.toLowerCase());
    await db().runTransaction(async (tx) => {
      const [userSnap, inviteSnap] = await tx.getAll(userRef, inviteRef);
      if (!inviteSnap.exists) throw new UserError("O convite já não existe. Peça a quem o convidou para enviar outro.");
      if (userSnap.exists && userSnap.get("businessId")) throw new UserError("A sua conta já pertence a um negócio.");
      const businessId = String(inviteSnap.get("businessId"));
      tx.set(userRef, { email: user.email, name: user.name, businessId, createdAt: FieldValue.serverTimestamp() });
      tx.delete(inviteRef);
      writeAudit(tx, businessId, { uid: user.uid, name: user.name }, {
        kind: "utilizadores",
        action: "convite_aceite",
        label: `${user.name || user.email} entrou no negócio`,
      });
    });
  } catch (error) {
    return toActionError(error);
  }
  revalidatePath("/", "layout");
  redirect("/");
}

export async function renameBusiness(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await getContext();
    const name = required(fd, "name", "O nome do negócio", 120);
    await db().collection("businesses").doc(ctx.businessId).update({ name });
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
    revalidatePath("/", "layout");
    return { ok: true, message: archived ? "Loja arquivada." : "Loja reativada." };
  } catch (error) {
    return toActionError(error);
  }
}

export async function inviteUser(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await getContext();
    const email = parseEmail(fd);
    const existing = await col.users().where("email", "==", email).limit(1).get();
    if (!existing.empty) {
      const businessId = String(existing.docs[0].get("businessId") ?? "");
      throw new UserError(
        businessId === ctx.businessId ? "Esta pessoa já faz parte do negócio." : "Esta conta já pertence a outro negócio.",
      );
    }
    const inviteRef = col.invites().doc(email);
    await db().runTransaction(async (tx) => {
      const snap = await tx.get(inviteRef);
      if (snap.exists && snap.get("businessId") !== ctx.businessId) {
        throw new UserError("Este email já tem um convite pendente de outro negócio.");
      }
      tx.set(inviteRef, {
        businessId: ctx.businessId,
        businessName: ctx.businessName,
        invitedByUid: ctx.uid,
        invitedByName: ctx.name,
        createdAt: FieldValue.serverTimestamp(),
      });
      writeAudit(tx, ctx.businessId, { uid: ctx.uid, name: ctx.name }, {
        kind: "utilizadores",
        action: "convite",
        label: `Convite enviado para ${email}`,
      });
    });
    revalidatePath("/definicoes");
    return { ok: true, message: `Convite criado. Peça a ${email} para entrar na app com essa conta Google.` };
  } catch (error) {
    return toActionError(error);
  }
}

export async function cancelInvite(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await getContext();
    const email = parseEmail(fd);
    const ref = col.invites().doc(email);
    const snap = await ref.get();
    if (snap.exists && snap.get("businessId") === ctx.businessId) await ref.delete();
    revalidatePath("/definicoes");
    return { ok: true, message: "Convite cancelado." };
  } catch (error) {
    return toActionError(error);
  }
}

export async function removeUser(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await getContext();
    if (!ctx.isOwner) throw new UserError("Só o proprietário pode remover utilizadores.");
    const uid = required(fd, "uid", "O utilizador", 128);
    if (uid === ctx.ownerUid) throw new UserError("O proprietário não pode ser removido.");
    const ref = col.users().doc(uid);
    await db().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists || snap.get("businessId") !== ctx.businessId) throw new UserError("Este utilizador não pertence ao negócio.");
      tx.delete(ref);
      writeAudit(tx, ctx.businessId, { uid: ctx.uid, name: ctx.name }, {
        kind: "utilizadores",
        action: "remocao",
        label: `${String(snap.get("name") || snap.get("email"))} foi removido do negócio`,
      });
    });
    revalidatePath("/definicoes");
    return { ok: true, message: "Utilizador removido." };
  } catch (error) {
    return toActionError(error);
  }
}

export async function transferOwnership(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await getContext();
    if (!ctx.isOwner) throw new UserError("Só o proprietário pode transferir a propriedade.");
    const uid = required(fd, "uid", "O utilizador", 128);
    if (uid === ctx.uid) throw new UserError("Já é o proprietário.");
    const userRef = col.users().doc(uid);
    const businessRef = db().collection("businesses").doc(ctx.businessId);
    await db().runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists || snap.get("businessId") !== ctx.businessId) throw new UserError("Este utilizador não pertence ao negócio.");
      tx.update(businessRef, { ownerUid: uid });
      writeAudit(tx, ctx.businessId, { uid: ctx.uid, name: ctx.name }, {
        kind: "utilizadores",
        action: "propriedade",
        label: `A propriedade passou para ${String(snap.get("name") || snap.get("email"))}`,
      });
    });
    revalidatePath("/", "layout");
    return { ok: true, message: "Propriedade transferida." };
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
