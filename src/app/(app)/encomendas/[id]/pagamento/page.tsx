import type { Metadata } from "next";
import { randomUUID } from "crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getContext } from "@/lib/session";
import { getOrder } from "@/lib/server/data";
import { todayIso } from "@/lib/dates";
import { balanceOf } from "@/lib/domain";
import { formatMT } from "@/lib/money";
import { registerPayment } from "@/app/actions/payments";
import PaymentForm from "@/components/PaymentForm";
import { Notice } from "@/components/ui";

export const metadata: Metadata = { title: "Registar pagamento" };

export default async function PaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getContext();
  const { id } = await params;
  const order = await getOrder(ctx.businessId, id);
  if (!order) notFound();
  const balance = balanceOf(order.totalCents, order.paidCents);
  const open = order.fulfillment === "awaiting" || order.fulfillment === "ready";

  return (
    <main className="screen narrow">
      <div className="top" style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr" }}>
        <Link href={`/encomendas/${order.id}`} className="back" style={{ marginLeft: 0, paddingLeft: 0 }}>
          Cancelar
        </Link>
        <h1 className="h2" style={{ color: "var(--texto)" }}>
          Registar pagamento
        </h1>
        <span />
      </div>
      <div className="stack" style={{ textAlign: "center" }}>
        <p className="p small muted">
          {order.number}, {order.customerName}
        </p>
        <p className="p small strong owed-text tnum">Em falta {formatMT(balance)}</p>
      </div>
      {!open ? (
        <Notice tone="info">Esta encomenda já foi levantada ou cancelada.</Notice>
      ) : balance === 0 ? (
        <Notice tone="ok">Esta encomenda já está paga.</Notice>
      ) : (
        <PaymentForm
          action={registerPayment}
          formKey={randomUUID()}
          orderId={order.id}
          balanceCents={balance}
          maxCents={balance}
          today={todayIso(ctx.tz)}
          mode="payment"
        />
      )}
    </main>
  );
}
