import type { Metadata } from "next";
import { randomUUID } from "crypto";
import { notFound } from "next/navigation";
import { getContext } from "@/lib/session";
import { getOrder } from "@/lib/server/data";
import { isOpen } from "@/lib/domain";
import { centsToInput } from "@/lib/money";
import { updateOrder } from "@/app/actions/orders";
import OrderForm from "@/components/OrderForm";
import { Notice, TitleBar } from "@/components/ui";

export const metadata: Metadata = { title: "Editar encomenda" };

export default async function EditOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getContext();
  const { id } = await params;
  const order = await getOrder(ctx.businessId, id);
  if (!order) notFound();

  return (
    <main className="screen with-bar">
      <TitleBar cancelHref={`/encomendas/${order.id}`} title={`Editar ${order.number}`} />
      {isOpen(order.fulfillment) ? (
        <OrderForm
          action={updateOrder}
          formKey={randomUUID()}
          stores={ctx.stores.filter((s) => s.id === order.storeId)}
          defaultStoreId={order.storeId}
          customers={[]}
          initial={{
            orderId: order.id,
            customerName: order.customerName,
            customerPhone: order.customerPhone,
            notes: order.notes,
            totalCents: order.totalCents,
            paidCents: order.paidCents,
            lines: order.lines.map((l) => ({ lineId: l.id, name: l.name, qty: l.qty, price: centsToInput(l.priceCents) })),
          }}
        />
      ) : (
        <Notice tone="info">Esta encomenda já foi levantada ou cancelada e só pode ser consultada.</Notice>
      )}
    </main>
  );
}
