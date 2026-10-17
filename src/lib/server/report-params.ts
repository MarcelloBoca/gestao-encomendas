import type { Ctx } from "../session";

export type SearchParams = Record<string, string | string[] | undefined>;

/** Loja escolhida nos relatórios: "todas" ou o id de uma loja (por omissão, a loja selecionada). */
export function reportStore(ctx: Ctx, params: SearchParams): { storeId: string | null; label: string; param: string } {
  const value = typeof params.loja === "string" ? params.loja : "";
  if (value === "todas") return { storeId: null, label: "Todas as lojas", param: "todas" };
  const store = ctx.stores.find((s) => s.id === value) ?? ctx.store;
  return { storeId: store?.id ?? null, label: store?.name ?? "Todas as lojas", param: store?.id ?? "todas" };
}

export function inStore(storeId: string | null, value: string | null | undefined): boolean {
  return storeId === null || value === storeId;
}
