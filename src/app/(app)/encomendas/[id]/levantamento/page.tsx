import type { Metadata } from "next";
import { randomUUID } from "crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getContext, storeName } from "@/lib/session";
import { getOrderBundle } from "@/lib/server/data";
import { todayIso } from "@/lib/dates";
import { balanceOf } from "@/lib/domain";
import { formatMT } from "@/lib/money";
import { reminderMessage, whatsappLink } from "@/lib/phone";
import { collectOrder } from "@/app/actions/collection";
import { markArrived } from "@/app/actions/orders";
import Icon from "@/components/Icon";
import InlineAction from "@/components/InlineAction";
import { ActionForm, SubmitButton } from "@/components/forms";
import { BackLink, Notice } from "@/components/ui";

export const metadata: Metadata = { title: "Confirmar levantamento" };

export default async function CollectPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getContext();
  const { id } = await params;
  const bundle = await getOrderBundle(ctx.businessId, id);
  if (!bundle) notFound();
  const { order, payments } = bundle;
  const store = storeName(ctx, order.storeId);
  const balance = balanceOf(order.totalCents, order.paidCents);
  const validPayments = payments.filter((p) => p.status === "valid").length;
  const blocked = balance > 0 || order.fulfillment !== "ready";

  if (order.fulfillment === "collected" || order.fulfillment === "cancelled") {
    return (
      <main className="screen narrow">
        <BackLink href={`/encomendas/${order.id}`} label={order.number} />
        <Notice tone="info">
          {order.fulfillment === "collected" ? "Esta encomenda já foi levantada." : "Esta encomenda está cancelada e não pode ser levantada."}
        </Notice>
      </main>
    );
  }

  const checks = (
    <div className="sheet">
      <div className="row">
        <span className={`badge-icon sm ${balance > 0 ? "tone-owed" : "tone-ok"}`} aria-hidden="true">
          <Icon name={balance > 0 ? "alert" : "check"} size={18} stroke={2.6} />
        </span>
        <span className="row-main">
          {balance > 0 ? (
            <>
              <span className="row-title owed-text tnum">Faltam {formatMT(balance)}</span>
              <span className="row-sub tnum">
                Pago {formatMT(order.paidCents)} de {formatMT(order.totalCents)}
              </span>
            </>
          ) : (
            <>
              <span className="row-title">Paga na totalidade</span>
              <span className="row-sub tnum">
                {formatMT(order.totalCents)} em {validPayments} {validPayments === 1 ? "pagamento" : "pagamentos"}
              </span>
            </>
          )}
        </span>
      </div>
      <div className="row">
        <span className={`badge-icon sm ${order.fulfillment === "ready" ? "tone-ok" : "tone-wait"}`} aria-hidden="true">
          <Icon name={order.fulfillment === "ready" ? "check" : "box"} size={18} stroke={2.4} />
        </span>
        <span className="row-main">
          <span className="row-title">{order.fulfillment === "ready" ? "A mercadoria chegou" : "A aguardar mercadoria"}</span>
          <span className="row-sub">
            {order.fulfillment === "ready"
              ? `${order.lines.length} ${order.lines.length === 1 ? "artigo" : "artigos"} na ${store}`
              : "Marque a chegada no detalhe da encomenda"}
          </span>
        </span>
      </div>
    </div>
  );

  if (blocked) {
    return (
      <main className="screen narrow">
        <BackLink href={`/encomendas/${order.id}`} label={order.number} />
        <div className="stack" style={{ alignItems: "center", textAlign: "center", gap: 6 }}>
          <span className="badge-icon big tone-blocked" aria-hidden="true">
            <Icon name="lock" size={26} stroke={2} />
          </span>
          <h1 className="h1 xs" style={{ marginTop: 6 }}>
            Ainda não pode ser levantada
          </h1>
          <p className="p muted">
            {order.number}, {order.customerName}
          </p>
        </div>
        {checks}
        <div className="stack-md" style={{ gap: 10 }}>
          {balance > 0 ? (
            <Link href={`/encomendas/${order.id}/pagamento`} className="btn btn-primary">
              Registar pagamento
            </Link>
          ) : (
            <InlineAction action={markArrived} fields={{ orderId: order.id, key: randomUUID() }} pendingText="A marcar…" label="Mercadoria chegou" />
          )}
          {balance > 0 ? (
            <a className="btn" href={whatsappLink(order.customerPhone, reminderMessage(order, store))} target="_blank" rel="noopener noreferrer">
              <Icon name="chat" size={18} stroke={2} />
              Enviar lembrete por WhatsApp
            </a>
          ) : null}
          <Link href={`/encomendas/${order.id}`} className="btn btn-text">
            Voltar à encomenda
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="screen narrow">
      <BackLink href={`/encomendas/${order.id}`} label={order.number} />
      <div className="stack" style={{ marginTop: -8 }}>
        <h1 className="h1 sm">Confirmar levantamento</h1>
        <p className="p muted">
          {order.customerName}, {store}
        </p>
      </div>

      <section className="section" aria-labelledby="verificacoes">
        <h2 id="verificacoes" className="h2">
          Pode ser levantada
        </h2>
        {checks}
      </section>

      <section className="section" aria-labelledby="saida">
        <h2 id="saida" className="h2">
          A entregar
        </h2>
        <div className="sheet tnum">
          {order.lines.map((line) => (
            <div key={line.id} className="row">
              <span className="row-main" style={{ fontSize: 16 }}>
                {line.name}
              </span>
              <span className="strong">{line.qty}×</span>
            </div>
          ))}
        </div>
      </section>

      <ActionForm action={collectOrder}>
        <input type="hidden" name="key" value={randomUUID()} />
        <input type="hidden" name="orderId" value={order.id} />
        <div className="group">
          <label className="group-row">
            <span className="muted">Data</span>
            <input type="date" name="date" defaultValue={todayIso(ctx.tz)} max={todayIso(ctx.tz)} required />
          </label>
          <label className="group-row">
            <span className="muted">Nota</span>
            <input type="text" name="note" placeholder="Ex.: levantado pela irmã" maxLength={300} />
          </label>
        </div>
        <p className="p small muted">
          Depois de confirmar, a encomenda fica só de leitura. Se houver um erro, use Anular levantamento no detalhe da encomenda.
        </p>
        <SubmitButton pendingText="A confirmar…">Confirmar levantamento</SubmitButton>
        <Link href={`/encomendas/${order.id}`} className="btn btn-text">
          Agora não
        </Link>
      </ActionForm>
    </main>
  );
}
