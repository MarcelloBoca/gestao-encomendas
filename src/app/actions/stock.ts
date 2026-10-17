"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { getContext, type Ctx } from "@/lib/session";
import { isValidIsoDay, todayIso } from "@/lib/dates";
import { UserError } from "@/lib/domain";
import { parseMoney } from "@/lib/money";
import { col, toItem } from "@/lib/server/repo";
import {
  allocateToWaiting,
  loadWaiting,
  positiveInt,
  required,
  runOnce,
  stockFieldUpdates,
  text,
  toActionError,
  writeAudit,
  writeMovement,
  writeWaitingChanges,
} from "@/lib/server/tx";
import type { ActionState, Item, ReadyOrderInfo, ReceiptState } from "@/lib/types";

function activeStore(ctx: Ctx, storeId: string): string {
  const store = ctx.activeStores.find((s) => s.id === storeId);
  if (!store) throw new UserError("Escolha uma loja válida.");
  return store.name;
}

function parseDay(fd: FormData, ctx: Ctx): string {
  const date = text(fd, "date", 10) || todayIso(ctx.tz);
  if (!isValidIsoDay(date) || date > todayIso(ctx.tz)) throw new UserError("A data não é válida.");
  return date;
}

const receiptLines = z
  .array(z.object({ itemId: z.string().min(1).max(80), qty: z.number().int().min(1).max(100_000) }))
  .min(1, "Adicione pelo menos um artigo recebido.")
  .max(100);

export async function receiveStock(_prev: ReceiptState, fd: FormData): Promise<ReceiptState> {
  try {
    const ctx = await getContext();
    const businessId = ctx.businessId;
    const key = required(fd, "key", "A chave do pedido", 80);
    const storeId = required(fd, "storeId", "A loja", 80);
    const storeName = activeStore(ctx, storeId);
    const date = parseDay(fd, ctx);
    let raw: unknown;
    try {
      raw = JSON.parse(text(fd, "lines", 20_000) || "[]");
    } catch {
      throw new UserError("Não foi possível ler os artigos recebidos.");
    }
    const parsed = receiptLines.safeParse(raw);
    if (!parsed.success) throw new UserError(parsed.error.issues[0]?.message ?? "Artigos inválidos.");
    const qtyByItem = new Map<string, number>();
    for (const line of parsed.data) qtyByItem.set(line.itemId, (qtyByItem.get(line.itemId) ?? 0) + line.qty);
    const actor = { uid: ctx.uid, name: ctx.name };

    const result = await runOnce(businessId, key, async (tx) => {
      const itemIds = [...qtyByItem.keys()];
      const snaps = await tx.getAll(...itemIds.map((id) => col.items(businessId).doc(id)));
      const waiting = await loadWaiting(tx, businessId, storeId);
      const items = new Map<string, Item>();
      for (const s of snaps) if (s.exists) items.set(s.id, toItem(s.id, s.data() ?? {}));

      const pool = new Map<string, number>();
      for (const itemId of itemIds) {
        const item = items.get(itemId);
        if (!item) throw new UserError("Um dos artigos já não existe.");
        if (item.archived) throw new UserError(`O artigo ${item.name} está arquivado.`);
        const level = item.stock[storeId] ?? { physical: 0, reserved: 0 };
        pool.set(itemId, Math.max(0, level.physical - level.reserved) + (qtyByItem.get(itemId) ?? 0));
      }
      const { reservedByItem, nowReady } = allocateToWaiting(pool, waiting);

      for (const itemId of itemIds) {
        const item = items.get(itemId)!;
        const qty = qtyByItem.get(itemId) ?? 0;
        tx.update(col.items(businessId).doc(itemId), stockFieldUpdates(storeId, qty, reservedByItem.get(itemId) ?? 0));
        writeMovement(tx, businessId, actor, { itemId, itemName: item.name, storeId, qty, type: "rececao", date });
      }
      writeWaitingChanges(tx, waiting, storeId);

      return {
        received: itemIds.map((id) => ({ name: items.get(id)?.name ?? "", qty: qtyByItem.get(id) ?? 0 })),
        ready: nowReady
          .sort((a, b) => a.createdAtMs - b.createdAtMs)
          .map((w) => ({
            id: w.order.id,
            number: w.order.number,
            customerName: w.order.customerName,
            customerPhone: w.order.customerPhone,
            totalCents: w.order.totalCents,
            paidCents: w.order.paidCents,
          })),
      };
    });
    revalidatePath("/", "layout");
    return {
      ok: true,
      storeName,
      received: (result?.received ?? []) as { name: string; qty: number }[],
      ready: (result?.ready ?? []) as ReadyOrderInfo[],
    };
  } catch (error) {
    return toActionError(error);
  }
}

export async function adjustStock(_prev: ActionState, fd: FormData): Promise<ActionState> {
  let itemId = "";
  try {
    const ctx = await getContext();
    const businessId = ctx.businessId;
    const key = required(fd, "key", "A chave do pedido", 80);
    const storeId = required(fd, "storeId", "A loja", 80);
    activeStore(ctx, storeId);
    itemId = required(fd, "itemId", "O artigo", 80);
    const direction = text(fd, "direction", 10) === "saida" ? -1 : 1;
    const qty = positiveInt(text(fd, "qty", 10), "Quantidade");
    const reason = required(fd, "reason", "O motivo", 500);
    const actor = { uid: ctx.uid, name: ctx.name };

    await runOnce(businessId, key, async (tx) => {
      const itemRef = col.items(businessId).doc(itemId);
      const snap = await tx.get(itemRef);
      if (!snap.exists) throw new UserError("O artigo já não existe.");
      const item = toItem(snap.id, snap.data() ?? {});
      const level = item.stock[storeId] ?? { physical: 0, reserved: 0 };
      const available = Math.max(0, level.physical - level.reserved);
      const waiting = direction > 0 ? await loadWaiting(tx, businessId, storeId) : [];

      if (direction < 0 && qty > available) {
        throw new UserError(
          available === 0
            ? "Não há stock disponível para retirar: as unidades existentes estão reservadas para encomendas."
            : `Só pode retirar ${available}; as restantes unidades estão reservadas para encomendas.`,
        );
      }

      let reserved = 0;
      if (direction > 0) {
        const { reservedByItem } = allocateToWaiting(new Map([[itemId, available + qty]]), waiting);
        reserved = reservedByItem.get(itemId) ?? 0;
      }
      const date = todayIso(ctx.tz);
      tx.update(itemRef, stockFieldUpdates(storeId, direction * qty, reserved));
      writeMovement(tx, businessId, actor, { itemId, itemName: item.name, storeId, qty: direction * qty, type: "ajuste", date, reason });
      writeWaitingChanges(tx, waiting, storeId);
      writeAudit(tx, businessId, actor, {
        kind: "correcao",
        action: "ajuste",
        label: `Ajuste de stock: ${item.name} ${direction > 0 ? "+" : "−"}${qty}`,
        storeId,
        reason,
        key,
      });
      return { ok: true };
    });
  } catch (error) {
    return toActionError(error);
  }
  revalidatePath("/", "layout");
  redirect(`/stock/artigos/${itemId}?msg=ajuste`);
}

export async function transferStock(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await getContext();
    const businessId = ctx.businessId;
    const key = required(fd, "key", "A chave do pedido", 80);
    const fromStoreId = required(fd, "fromStoreId", "A loja de origem", 80);
    const toStoreId = required(fd, "toStoreId", "A loja de destino", 80);
    activeStore(ctx, fromStoreId);
    activeStore(ctx, toStoreId);
    if (fromStoreId === toStoreId) throw new UserError("A loja de origem e a de destino têm de ser diferentes.");
    const itemId = required(fd, "itemId", "O artigo", 80);
    const qty = positiveInt(text(fd, "qty", 10), "Quantidade");
    const date = parseDay(fd, ctx);
    const actor = { uid: ctx.uid, name: ctx.name };

    await runOnce(businessId, key, async (tx) => {
      const itemRef = col.items(businessId).doc(itemId);
      const snap = await tx.get(itemRef);
      if (!snap.exists) throw new UserError("O artigo já não existe.");
      const waiting = await loadWaiting(tx, businessId, toStoreId);
      const item = toItem(snap.id, snap.data() ?? {});
      const from = item.stock[fromStoreId] ?? { physical: 0, reserved: 0 };
      const to = item.stock[toStoreId] ?? { physical: 0, reserved: 0 };
      const availableFrom = Math.max(0, from.physical - from.reserved);
      if (qty > availableFrom) {
        throw new UserError(`Só há ${availableFrom} unidades disponíveis na loja de origem.`);
      }
      const availableTo = Math.max(0, to.physical - to.reserved) + qty;
      const { reservedByItem } = allocateToWaiting(new Map([[itemId, availableTo]]), waiting);
      const transferId = randomUUID();

      tx.update(itemRef, {
        ...stockFieldUpdates(fromStoreId, -qty, 0),
        ...stockFieldUpdates(toStoreId, qty, reservedByItem.get(itemId) ?? 0),
      });
      writeMovement(tx, businessId, actor, { itemId, itemName: item.name, storeId: fromStoreId, qty: -qty, type: "transferencia", date, transferId });
      writeMovement(tx, businessId, actor, { itemId, itemName: item.name, storeId: toStoreId, qty, type: "transferencia", date, transferId });
      writeWaitingChanges(tx, waiting, toStoreId);
      return { ok: true };
    });
  } catch (error) {
    return toActionError(error);
  }
  revalidatePath("/", "layout");
  redirect("/stock?msg=transferencia");
}

export async function saveItem(_prev: ActionState, fd: FormData): Promise<ActionState> {
  let itemId = "";
  try {
    const ctx = await getContext();
    const businessId = ctx.businessId;
    itemId = text(fd, "itemId", 80);
    const name = required(fd, "name", "O nome", 120);
    const categoryId = text(fd, "categoryId", 80) || null;
    const priceCents = parseMoney(text(fd, "price", 30) || "0");
    if (priceCents === null) throw new UserError("O preço não é válido. Use, por exemplo, 1 350,00.");
    if (categoryId) {
      const category = await col.categories(businessId).doc(categoryId).get();
      if (!category.exists) throw new UserError("A categoria escolhida já não existe.");
    }
    if (itemId) {
      const ref = col.items(businessId).doc(itemId);
      const snap = await ref.get();
      if (!snap.exists) throw new UserError("O artigo já não existe.");
      await ref.update({ name, categoryId, priceCents, updatedAt: FieldValue.serverTimestamp() });
    } else {
      const ref = col.items(businessId).doc();
      await ref.set({ name, categoryId, priceCents, archived: false, stock: {}, createdAt: FieldValue.serverTimestamp() });
      itemId = ref.id;
    }
  } catch (error) {
    return toActionError(error);
  }
  revalidatePath("/", "layout");
  redirect(`/stock/artigos/${itemId}?msg=guardado`);
}

export async function setItemArchived(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await getContext();
    const itemId = required(fd, "itemId", "O artigo", 80);
    const archived = text(fd, "archived", 5) === "1";
    await col.items(ctx.businessId).doc(itemId).update({ archived });
    revalidatePath("/", "layout");
    return { ok: true, message: archived ? "Artigo arquivado." : "Artigo reativado." };
  } catch (error) {
    return toActionError(error);
  }
}

export async function saveCategory(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await getContext();
    const categoryId = text(fd, "categoryId", 80);
    const name = required(fd, "name", "O nome", 80);
    if (categoryId) {
      await col.categories(ctx.businessId).doc(categoryId).update({ name });
    } else {
      await col.categories(ctx.businessId).add({ name, archived: false, createdAt: FieldValue.serverTimestamp() });
    }
    revalidatePath("/", "layout");
    return { ok: true, message: categoryId ? "Categoria alterada." : "Categoria criada." };
  } catch (error) {
    return toActionError(error);
  }
}

export async function setCategoryArchived(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await getContext();
    const categoryId = required(fd, "categoryId", "A categoria", 80);
    const archived = text(fd, "archived", 5) === "1";
    await col.categories(ctx.businessId).doc(categoryId).update({ archived });
    revalidatePath("/", "layout");
    return { ok: true, message: archived ? "Categoria arquivada." : "Categoria reativada." };
  } catch (error) {
    return toActionError(error);
  }
}
