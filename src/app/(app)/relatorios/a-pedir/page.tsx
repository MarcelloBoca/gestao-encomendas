import type { Metadata } from "next";
import Link from "next/link";
import { getContext, storeName } from "@/lib/session";
import { listOpenOrders } from "@/lib/server/data";
import { inStore, reportStore, type SearchParams } from "@/lib/server/report-params";
import StoreFilter from "@/components/StoreFilter";
import { BackLink, Empty } from "@/components/ui";

export const metadata: Metadata = { title: "Artigos a pedir" };

interface Row {
  storeId: string;
  itemId: string;
  name: string;
  missing: number;
  orders: Set<string>;
}

export default async function ToOrderPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await getContext();
  const params = await searchParams;
  const store = reportStore(ctx, params);
  const awaiting = (await listOpenOrders(ctx.businessId)).filter(
    (o) => o.fulfillment === "awaiting" && inStore(store.storeId, o.storeId),
  );

  const rows = new Map<string, Row>();
  for (const order of awaiting) {
    for (const line of order.lines) {
      const need = line.qty - line.reserved;
      if (need <= 0) continue;
      const key = `${order.storeId}|${line.itemId}`;
      const row = rows.get(key) ?? { storeId: order.storeId, itemId: line.itemId, name: line.name, missing: 0, orders: new Set<string>() };
      row.missing += need;
      row.orders.add(order.id);
      rows.set(key, row);
    }
  }
  const list = [...rows.values()].sort((a, b) => b.missing - a.missing || a.name.localeCompare(b.name, "pt"));

  return (
    <main className="screen">
      <BackLink href="/relatorios" label="Relatórios" />
      <h1 className="h1 sm" style={{ marginTop: -8 }}>
        Artigos a pedir
      </h1>
      <StoreFilter stores={ctx.activeStores} current={store.param} hrefFor={(loja) => `/relatorios/a-pedir?loja=${loja}`} />
      <p className="p muted" style={{ marginTop: -8 }}>
        Quantidades já encomendadas pelos clientes que ainda não têm stock reservado.
      </p>
      <div className="sheet">
        {list.length === 0 ? <Empty>Todas as encomendas em aberto têm stock reservado.</Empty> : null}
        {list.map((row) => (
          <Link key={`${row.storeId}|${row.itemId}`} href={`/stock/artigos/${row.itemId}`} className="row">
            <span className="row-main">
              <span className="row-title">{row.name}</span>
              <span className="row-sub">
                {row.orders.size} {row.orders.size === 1 ? "encomenda" : "encomendas"}
                {store.storeId === null ? `, ${storeName(ctx, row.storeId)}` : ""}
              </span>
            </span>
            <span className="strong tnum" style={{ fontSize: 18 }}>
              {row.missing}
            </span>
          </Link>
        ))}
      </div>
    </main>
  );
}
