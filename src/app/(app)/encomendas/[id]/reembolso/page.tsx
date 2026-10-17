import type { Metadata } from "next";
import { randomUUID } from "crypto";
import { notFound } from "next/navigation";
import { getContext } from "@/lib/session";
import { getOrder } from "@/lib/server/data";
import { todayIso } from "@/lib/dates";
import { balanceOf, isOpen } from "@/lib/domain";
import { registerRefund } from "@/app/actions/payments";
import PaymentForm from "@/components/PaymentForm";
import { Notice, TitleBar } from "@/components/ui";

export const metadata: Metadata = { title: "Registar reembolso" };

export default async function RefundPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getContext();
  const { id } = await params;
  const order = await getOrder(ctx.businessId, id);
  if (!order) notFound();

  return (
    <div className="sheet-page">
      <main className="screen narrow">
        <div className="grabber" aria-hidden="true" />
        <TitleBar cancelHref={`/encomendas/${order.id}`} title="Registar reembolso" />
        <p className="p small muted" style={{ textAlign: "center" }}>
          {order.number}, {order.customerName}. Use para dinheiro devolvido à cliente; para corrigir um pagamento registado por engano, use
          Estornar no pagamento.
        </p>
        {!isOpen(order.fulfillment) ? (
          <Notice tone="info">Esta encomenda já foi levantada ou cancelada.</Notice>
        ) : order.paidCents <= 0 ? (
          <Notice tone="info">Esta encomenda não tem valores pagos para reembolsar.</Notice>
        ) : (
          <PaymentForm
            action={registerRefund}
            formKey={randomUUID()}
            orderId={order.id}
            balanceCents={balanceOf(order.totalCents, order.paidCents)}
            maxCents={order.paidCents}
            today={todayIso(ctx.tz)}
            mode="refund"
          />
        )}
      </main>
    </div>
  );
}
