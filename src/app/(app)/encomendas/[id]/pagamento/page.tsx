import type { Metadata } from "next";
import { randomUUID } from "crypto";
import { notFound } from "next/navigation";
import { getContext } from "@/lib/session";
import { getOrder } from "@/lib/server/data";
import { todayIso } from "@/lib/dates";
import { balanceOf, isOpen } from "@/lib/domain";
import { formatMT } from "@/lib/money";
import { registerPayment } from "@/app/actions/payments";
import PaymentForm from "@/components/PaymentForm";
import { Notice, TitleBar } from "@/components/ui";

export const metadata: Metadata = { title: "Registar pagamento" };

export default async function PaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getContext();
  const { id } = await params;
  const order = await getOrder(ctx.businessId, id);
  if (!order) notFound();
  const balance = balanceOf(order.totalCents, order.paidCents);

  return (
    <div className="sheet-page">
      <main className="screen narrow">
        <div className="grabber" aria-hidden="true" />
        <TitleBar cancelHref={`/encomendas/${order.id}`} title="Registar pagamento" />
        <div className="stack" style={{ textAlign: "center", alignItems: "center", gap: 2 }}>
          <p className="p small muted">
            {order.number}, {order.customerName}
          </p>
          <p className="p small strong owed-text tnum">Faltam {formatMT(balance)}</p>
        </div>
        {!isOpen(order.fulfillment) ? (
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
    </div>
  );
}
