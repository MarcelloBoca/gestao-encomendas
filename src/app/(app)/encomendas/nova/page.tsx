import type { Metadata } from "next";
import { randomUUID } from "crypto";
import { getContext } from "@/lib/session";
import { listCustomers } from "@/lib/server/data";
import { createOrder } from "@/app/actions/orders";
import OrderForm from "@/components/OrderForm";
import { TitleBar } from "@/components/ui";

export const metadata: Metadata = { title: "Nova encomenda" };

export default async function NewOrderPage() {
  const ctx = await getContext();
  const customers = await listCustomers(ctx.businessId);

  return (
    <main className="screen with-bar">
      <TitleBar cancelHref="/encomendas" title="Nova encomenda" />
      <OrderForm
        action={createOrder}
        formKey={randomUUID()}
        stores={ctx.activeStores}
        defaultStoreId={ctx.storeId}
        customers={customers.map((c) => ({ id: c.id, name: c.name, phone: c.phone }))}
      />
    </main>
  );
}
