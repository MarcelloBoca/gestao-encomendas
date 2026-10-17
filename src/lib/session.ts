import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { DocumentData } from "firebase-admin/firestore";
import { adminAuth, db } from "./firebase-admin";
import { DEFAULT_TZ } from "./dates";
import type { Store } from "./types";

export const SESSION_COOKIE = "__session";
export const STORE_COOKIE = "loja";
export const SESSION_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

export interface SessionUser {
  uid: string;
  email: string;
  name: string;
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
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const decoded = await adminAuth().verifySessionCookie(token);
    const email = decoded.email ?? "";
    const name = typeof decoded.name === "string" && decoded.name ? decoded.name : email;
    return { uid: decoded.uid, email, name };
  } catch {
    return null;
  }
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

/** Utilizador, negócio e loja selecionada. Redireciona para o login ou para a configuração inicial. */
export const getContext = cache(async (): Promise<Ctx> => {
  const user = await requireSessionUser();
  const userSnap = await db().collection("users").doc(user.uid).get();
  const businessId = userSnap.exists ? String(userSnap.get("businessId") ?? "") : "";
  if (!businessId) redirect("/onboarding");

  const businessRef = db().collection("businesses").doc(businessId);
  const [businessSnap, storesSnap] = await Promise.all([businessRef.get(), businessRef.collection("stores").get()]);
  if (!businessSnap.exists) redirect("/onboarding");

  const stores = storesSnap.docs
    .map((doc) => storeFromDoc(doc.id, doc.data()))
    .sort((a, b) => a.name.localeCompare(b.name, "pt"));
  const activeStores = stores.filter((store) => !store.archived);

  const jar = await cookies();
  const chosen = jar.get(STORE_COOKIE)?.value;
  const store = activeStores.find((s) => s.id === chosen) ?? activeStores[0] ?? null;
  const ownerUid = String(businessSnap.get("ownerUid") ?? "");

  return {
    ...user,
    name: String(userSnap.get("name") || user.name),
    businessId,
    businessName: String(businessSnap.get("name") ?? "Negócio"),
    ownerUid,
    isOwner: ownerUid === user.uid,
    tz: String(businessSnap.get("timezone") || DEFAULT_TZ),
    stores,
    activeStores,
    storeId: store?.id ?? "",
    store,
  };
});

export function storeName(ctx: Ctx, storeId: string): string {
  return ctx.stores.find((s) => s.id === storeId)?.name ?? "Loja";
}
