import type { Metadata } from "next";
import { randomUUID } from "crypto";
import { notFound } from "next/navigation";
import { getContext } from "@/lib/session";
import { getOrder } from "@/lib/server/data";
import { shortDayYear } from "@/lib/dates";
import { undoCollection } from "@/app/actions/collection";
import { ActionForm, SubmitButton } from "@/components/forms";
import { BackLink, Notice } from "@/components/ui";

export const metadata: Metadata = { title: "Anular levantamento" };

export default async function UndoCollectionPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getContext();
  const { id } = await params;
  const order = await getOrder(ctx.businessId, id);
  if (!order) notFound();

  return (
    <main className="screen narrow">
      <BackLink href={`/encomendas/${order.id}`} label={order.number} />
      <div className="stack">
        <h1 className="h1 sm">Anular levantamento</h1>
        <p className="p muted">
          {order.customerName}
          {order.collectedDate ? `, levantada a ${shortDayYear(order.collectedDate)}` : ""}
        </p>
      </div>
      {order.fulfillment !== "collected" ? (
        <Notice tone="info">Esta encomenda não está levantada.</Notice>
      ) : (
        <ActionForm action={undoCollection}>
          <input type="hidden" name="key" value={randomUUID()} />
          <input type="hidden" name="orderId" value={order.id} />
          <Notice tone="warn">
            Os artigos voltam ao stock da loja, reservados para esta encomenda, que regressa a Pronta para levantar.
          </Notice>
          <div className="field">
            <label className="label" htmlFor="reason">
              Motivo
            </label>
            <textarea id="reason" name="reason" className="textarea" required maxLength={500} placeholder="Ex.: confirmado por engano" />
          </div>
          <SubmitButton className="btn btn-danger" pendingText="A anular…">
            Anular levantamento
          </SubmitButton>
        </ActionForm>
      )}
    </main>
  );
}
