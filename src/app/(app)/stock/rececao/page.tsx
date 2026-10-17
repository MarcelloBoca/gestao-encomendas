import type { Metadata } from "next";
import { randomUUID } from "crypto";
import { getContext } from "@/lib/session";
import { listItems, listOpenOrders } from "@/lib/server/data";
import { todayIso } from "@/lib/dates";
import { toFormItems } from "@/lib/form-items";
import { receiveStock } from "@/app/actions/stock";
import ReceiptForm from "@/components/ReceiptForm";
import { BackLink } from "@/components/ui";

export const metadata: Metadata = { title: "Receção de mercadoria" };

export default async function ReceiptPage() {
  const ctx = await getContext();
  const [items, open] = await Promise.all([listItems(ctx.businessId), listOpenOrders(ctx.businessId)]);

  const missing: Record<string, Record<string, number>> = {};
  for (const order of open) {
    if (order.fulfillment !== "awaiting") continue;
    for (const line of order.lines) {
      const need = line.qty - line.reserved;
      if (need <= 0) continue;
      missing[order.storeId] ??= {};
      missing[order.storeId][line.itemId] = (missing[order.storeId][line.itemId] ?? 0) + need;
    }
  }

  return (
    <main className="screen narrow">
      <BackLink href="/stock" label="Stock" />
      <h1 className="h1 sm" style={{ marginTop: -8 }}>
        Receção de mercadoria
      </h1>
      <ReceiptForm
        action={receiveStock}
        formKey={randomUUID()}
        stores={ctx.activeStores}
        defaultStoreId={ctx.storeId}
        items={toFormItems(items)}
        today={todayIso(ctx.tz)}
        missing={missing}
      />
    </main>
  );
}
