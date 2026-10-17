import type { Metadata } from "next";
import { randomUUID } from "crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getContext } from "@/lib/session";
import { getOrder } from "@/lib/server/data";
import { todayIso } from "@/lib/dates";
import { balanceOf } from "@/lib/domain";
import { registerRefund } from "@/app/actions/payments";
import PaymentForm from "@/components/PaymentForm";
import { Notice } from "@/components/ui";

export const metadata: Metadata = { title: "Registar reembolso" };

export default async function RefundPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getContext();
  const { id } = await params;
  const order = await getOrder(ctx.businessId, id);
  if (!order) notFound();
  const open = order.fulfillment === "awaiting" || order.fulfillment === "ready";

  return (
    <main className="screen narrow">
      <div className="top" style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr" }}>
        <Link href={`/encomendas/${order.id}`} className="back" style={{ marginLeft: 0, paddingLeft: 0 }}>
          Cancelar
        </Link>
        <h1 className="h2" style={{ color: "var(--texto)" }}>
          Registar reembolso
        </h1>
        <span />
      </div>
      <p className="p small muted" style={{ textAlign: "center" }}>
        {order.number}, {order.customerName}. Use para dinheiro devolvido ao cliente; para corrigir um pagamento registado por engano, use
        Estornar no pagamento.
      </p>
      {!open ? (
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
  );
}
