import type { Metadata } from "next";
import { randomUUID } from "crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getContext } from "@/lib/session";
import { getOrder, listItems } from "@/lib/server/data";
import { centsToInput } from "@/lib/money";
import { toFormItems } from "@/lib/form-items";
import { updateOrder } from "@/app/actions/orders";
import OrderForm from "@/components/OrderForm";
import { Notice } from "@/components/ui";

export const metadata: Metadata = { title: "Editar encomenda" };

export default async function EditOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getContext();
  const { id } = await params;
  const [order, items] = await Promise.all([getOrder(ctx.businessId, id), listItems(ctx.businessId)]);
  if (!order) notFound();
  const editable = order.fulfillment === "awaiting" || order.fulfillment === "ready";

  return (
    <main className="screen with-bar">
      <div className="top" style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr" }}>
        <Link href={`/encomendas/${order.id}`} className="back" style={{ marginLeft: 0, paddingLeft: 0 }}>
          Cancelar
        </Link>
        <h1 className="h2" style={{ color: "var(--texto)" }}>
          Editar {order.number}
        </h1>
        <span />
      </div>
      {editable ? (
        <OrderForm
          action={updateOrder}
          formKey={randomUUID()}
          stores={ctx.stores.filter((s) => s.id === order.storeId)}
          defaultStoreId={order.storeId}
          items={toFormItems(items)}
          customers={[]}
          initial={{
            orderId: order.id,
            storeId: order.storeId,
            customerName: order.customerName,
            customerPhone: order.customerPhone,
            expectedDate: order.expectedDate ?? "",
            discount: centsToInput(order.discountCents),
            notes: order.notes,
            totalCents: order.totalCents,
            paidCents: order.paidCents,
            lines: order.lines.map((l) => ({
              lineId: l.id,
              itemId: l.itemId,
              qty: l.qty,
              price: centsToInput(l.priceCents),
              reserved: l.reserved,
            })),
          }}
        />
      ) : (
        <Notice tone="info">Esta encomenda já foi levantada ou cancelada e só pode ser consultada.</Notice>
      )}
    </main>
  );
}
