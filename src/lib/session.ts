import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { DocumentData } from "firebase-admin/firestore";
import { db } from "./firebase-admin";
import { readSessionToken } from "./server/session-token";
import { DEFAULT_TZ } from "./dates";
import type { Store } from "./types";

export const SESSION_COOKIE = "__session";
export const STORE_COOKIE = "loja";
export const SESSION_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

export interface SessionUser {
  uid: string;
  /** Nome de utilizador. */
  email: string;
  name: string;
  version?: number;
}

export interface Ctx extends SessionUser {
  businessId: string;
  businessName: string;
  ownerUid: string;
  isOwner: boolean;
  tz: string;
  stores: Store[];
  activeStores: Store[];
  storeId: string;
  store: Store | null;
}

export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  return readSessionToken(jar.get(SESSION_COOKIE)?.value);
});

export async function requireSessionUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export function storeFromDoc(id: string, data: DocumentData | undefined): Store {
  return {
    id,
    name: String(data?.name ?? "Loja"),
    prefix: String(data?.prefix ?? "LOJ"),
    archived: Boolean(data?.archived),
  };
}

interface BaseContext {
  name: string;
  username: string;
  sessionVersion: number;
  mustChangePassword: boolean;
  businessId: string;
  businessName: string;
  ownerUid: string;
  tz: string;
  stores: Store[];
  at: number;
}

// Negócio e lojas de cada utilizador, guardados por pouco tempo na memória do servidor. Evita duas idas ao
// Firestore em cada página; as ações que mudam o negócio, as lojas ou os utilizadores limpam esta memória.
const BASE_TTL_MS = 30_000;
const baseCache = new Map<string, BaseContext>();

export function forgetContext(): void {
  baseCache.clear();
}

type BaseResult = BaseContext | "sem-conta" | "sem-negocio";

async function loadBase(user: SessionUser): Promise<BaseResult> {
  const hit = baseCache.get(user.uid);
  if (hit && Date.now() - hit.at < BASE_TTL_MS) return hit;

  const userSnap = await db().collection("users").doc(user.uid).get();
  if (!userSnap.exists) return "sem-conta";
  const businessId = String(userSnap.get("businessId") ?? "");
  if (!businessId) return "sem-negocio";

  const businessRef = db().collection("businesses").doc(businessId);
  const [businessSnap, storesSnap] = await Promise.all([businessRef.get(), businessRef.collection("stores").get()]);
  if (!businessSnap.exists) return "sem-negocio";

  const base: BaseContext = {
    name: String(userSnap.get("name") || user.name),
    username: String(userSnap.get("username") ?? ""),
    sessionVersion: Number(userSnap.get("sessionVersion") ?? 0),
    mustChangePassword: Boolean(userSnap.get("mustChangePassword")),
    businessId,
    businessName: String(businessSnap.get("name") ?? "Negócio"),
    ownerUid: String(businessSnap.get("ownerUid") ?? ""),
    tz: String(businessSnap.get("timezone") || DEFAULT_TZ),
    stores: storesSnap.docs.map((doc) => storeFromDoc(doc.id, doc.data())).sort((a, b) => a.name.localeCompare(b.name, "pt")),
    at: Date.now(),
  };
  if (baseCache.size > 200) baseCache.clear();
  baseCache.set(user.uid, base);
  return base;
}

/** Utilizador, negócio e loja selecionada. Redireciona para o login ou para a configuração inicial. */
export const getContext = cache(async (): Promise<Ctx> => {
  const user = await requireSessionUser();
  const base = await loadBase(user);
  // Conta removida ou palavra-passe mudada noutro aparelho: a sessão deixa de valer.
  if (base === "sem-conta") redirect("/sair");
  if (base === "sem-negocio") redirect("/onboarding");
  if (base.sessionVersion !== (user.version ?? 0)) redirect("/sair");
  if (base.mustChangePassword) redirect("/palavra-passe");

  const activeStores = base.stores.filter((store) => !store.archived);
  const jar = await cookies();
  const chosen = jar.get(STORE_COOKIE)?.value;
  const store = activeStores.find((s) => s.id === chosen) ?? activeStores[0] ?? null;

  return {
    ...user,
    email: base.username || user.email,
    name: base.name,
    businessId: base.businessId,
    businessName: base.businessName,
    ownerUid: base.ownerUid,
    isOwner: base.ownerUid === user.uid,
    tz: base.tz,
    stores: base.stores,
    activeStores,
    storeId: store?.id ?? "",
    store,
  };
});

export function storeName(ctx: Ctx, storeId: string): string {
  return ctx.stores.find((s) => s.id === storeId)?.name ?? "Loja";
}
