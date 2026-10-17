import type { Metadata } from "next";
import { randomUUID } from "crypto";
import { notFound } from "next/navigation";
import { getContext } from "@/lib/session";
import { getOrder, getPayment } from "@/lib/server/data";
import { shortDayYear } from "@/lib/dates";
import { formatMT } from "@/lib/money";
import { methodLabel } from "@/lib/types";
import { reversePayment } from "@/app/actions/payments";
import { ActionForm, SubmitButton } from "@/components/forms";
import { BackLink, Notice } from "@/components/ui";

export const metadata: Metadata = { title: "Estornar pagamento" };

export default async function ReversePage({ params }: { params: Promise<{ id: string; paymentId: string }> }) {
  const ctx = await getContext();
  const { id, paymentId } = await params;
  const [order, payment] = await Promise.all([getOrder(ctx.businessId, id), getPayment(ctx.businessId, paymentId)]);
  if (!order || !payment || payment.orderId !== order.id) notFound();

  return (
    <main className="screen narrow">
      <BackLink href={`/encomendas/${order.id}`} label={order.number} />
      <div className="stack">
        <h1 className="h1 sm">Estornar pagamento</h1>
        <p className="p muted">
          {formatMT(payment.amountCents)}, {methodLabel(payment.method)}, {shortDayYear(payment.date)}, registado por {payment.byName}
        </p>
      </div>
      {payment.status === "reversed" ? (
        <Notice tone="info">Este pagamento já foi estornado.</Notice>
      ) : (
        <ActionForm action={reversePayment}>
          <input type="hidden" name="key" value={randomUUID()} />
          <input type="hidden" name="paymentId" value={payment.id} />
          <Notice tone="warn">
            Use o estorno para corrigir um pagamento registado por engano. O pagamento fica no histórico, marcado como estornado, e deixa de
            contar. Se devolveu dinheiro à cliente, registe antes um reembolso.
          </Notice>
          <div className="field">
            <label className="label" htmlFor="reason">
              Motivo
            </label>
            <textarea id="reason" name="reason" className="textarea" required maxLength={500} placeholder="Ex.: valor registado em duplicado" />
          </div>
          <SubmitButton className="btn btn-danger" pendingText="A estornar…">
            Estornar {formatMT(payment.amountCents)}
          </SubmitButton>
        </ActionForm>
      )}
    </main>
  );
}
