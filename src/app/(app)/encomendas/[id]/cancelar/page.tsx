import type { Metadata } from "next";
import { randomUUID } from "crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getContext } from "@/lib/session";
import { getOrder } from "@/lib/server/data";
import { formatMT } from "@/lib/money";
import { cancelOrder } from "@/app/actions/orders";
import { ActionForm, SubmitButton } from "@/components/forms";
import { BackLink, Notice } from "@/components/ui";

export const metadata: Metadata = { title: "Cancelar encomenda" };

export default async function CancelPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getContext();
  const { id } = await params;
  const order = await getOrder(ctx.businessId, id);
  if (!order) notFound();
  const open = order.fulfillment === "awaiting" || order.fulfillment === "ready";

  return (
    <main className="screen narrow">
      <BackLink href={`/encomendas/${order.id}`} label={order.number} />
      <div className="stack">
        <h1 className="h1 sm">Cancelar encomenda</h1>
        <p className="p muted">
          {order.number}, {order.customerName}, {formatMT(order.totalCents)}
        </p>
      </div>

      {!open ? (
        <Notice tone="info">
          {order.fulfillment === "collected"
            ? "Uma encomenda levantada não pode ser cancelada. Anule primeiro o levantamento."
            : "Esta encomenda já está cancelada."}
        </Notice>
      ) : (
        <ActionForm action={cancelOrder}>
          <input type="hidden" name="key" value={randomUUID()} />
          <input type="hidden" name="orderId" value={order.id} />
          {order.paidCents > 0 ? (
            <div className="stack-md">
              <Notice tone="warn">Esta encomenda tem {formatMT(order.paidCents)} pagos. Escolha o que acontece a esse valor.</Notice>
              <div className="sheet">
                <Link href={`/encomendas/${order.id}/reembolso`} className="row">
                  <span className="row-main">
                    <span className="row-title">Devolver o dinheiro primeiro</span>
                    <span className="row-sub">Registe o reembolso e volte a cancelar.</span>
                  </span>
                </Link>
                <label className="radio-row">
                  <input type="checkbox" name="retain" value="1" required />
                  <span className="row-main">
                    <span className="row-title">Reter os {formatMT(order.paidCents)}</span>
                    <span className="row-sub">O valor fica como recebido e não é devolvido à cliente.</span>
                  </span>
                </label>
              </div>
            </div>
          ) : null}
          <div className="field">
            <label className="label" htmlFor="reason">
              Motivo
            </label>
            <textarea id="reason" name="reason" className="textarea" required maxLength={500} placeholder="Ex.: a cliente desistiu" />
          </div>
          <SubmitButton className="btn btn-danger" pendingText="A cancelar…">
            Cancelar encomenda
          </SubmitButton>
        </ActionForm>
      )}
    </main>
  );
}
