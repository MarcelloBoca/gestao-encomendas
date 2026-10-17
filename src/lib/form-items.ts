import type { Item } from "./types";

export interface FormItem {
  id: string;
  name: string;
  priceCents: number;
  archived: boolean;
  available: Record<string, number>;
}

/** Artigos com o stock disponível por loja, para os formulários no telemóvel. */
export function toFormItems(items: Item[]): FormItem[] {
  return items.map((item) => {
    const available: Record<string, number> = {};
    for (const [storeId, level] of Object.entries(item.stock)) available[storeId] = Math.max(0, level.physical - level.reserved);
    return { id: item.id, name: item.name, priceCents: item.priceCents, archived: item.archived, available };
  });
}
