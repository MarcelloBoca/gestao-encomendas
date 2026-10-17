import type { Metadata } from "next";
import { randomUUID } from "crypto";
import Link from "next/link";
import { getContext } from "@/lib/session";
import { listCustomers, listItems } from "@/lib/server/data";
import { createOrder } from "@/app/actions/orders";
import OrderForm from "@/components/OrderForm";
import { toFormItems } from "@/lib/form-items";

export const metadata: Metadata = { title: "Nova encomenda" };

export default async function NewOrderPage() {
  const ctx = await getContext();
  const [items, customers] = await Promise.all([listItems(ctx.businessId), listCustomers(ctx.businessId)]);

  return (
    <main className="screen with-bar">
      <div className="top" style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr" }}>
        <Link href="/encomendas" className="back" style={{ marginLeft: 0, paddingLeft: 0 }}>
          Cancelar
        </Link>
        <h1 className="h2" style={{ color: "var(--texto)" }}>
          Nova encomenda
        </h1>
        <span />
      </div>
      <OrderForm
        action={createOrder}
        formKey={randomUUID()}
        stores={ctx.activeStores}
        defaultStoreId={ctx.storeId}
        items={toFormItems(items)}
        customers={customers.map((c) => ({ id: c.id, name: c.name, phone: c.phone }))}
      />
    </main>
  );
}
