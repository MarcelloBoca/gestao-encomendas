import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getContext, storeName as nameOfStore } from "@/lib/session";
import { getOrderBundle } from "@/lib/server/data";
import { dayMonth, shortDay, shortDayFromMs, shortDayYear, timeFromMs } from "@/lib/dates";
import { balanceOf } from "@/lib/domain";
import { formatCents, formatMT } from "@/lib/money";
import { formatPhone, readyMessage, receiptMessage, reminderMessage, whatsappLink } from "@/lib/phone";
import { methodLabel } from "@/lib/types";
import Icon from "@/components/Icon";
import PaymentBar from "@/components/PaymentBar";
import { BackLink, BigMoney, FinPill, FulPill, Notice } from "@/components/ui";

export const metadata: Metadata = { title: "Encomenda" };

const MESSAGES: Record<string, string> = {
  criada: "Encomenda criada.",
  alterada: "Encomenda alterada.",
  cancelada: "Encomenda cancelada.",
  estorno: "Pagamento estornado.",
  reembolso: "Reembolso registado.",
  levantada: "Levantamento confirmado. O stock foi atualizado.",
  anulado: "Levantamento anulado. As unidades voltaram ao stock reservado.",
};

export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await getContext();
  const { id } = await params;
  const sp = await searchParams;
  const bundle = await getOrderBundle(ctx.businessId, id);
  if (!bundle) notFound();
  const { order, payments, refunds, history } = bundle;

  const store = nameOfStore(ctx, order.storeId);
  const balance = balanceOf(order.totalCents, order.paidCents);
  const isOpen = order.fulfillment === "awaiting" || order.fulfillment === "ready";
  const message = typeof sp.msg === "string" ? MESSAGES[sp.msg] : undefined;
  const justPaid = typeof sp.pagamento === "string" ? payments.find((p) => p.id === sp.pagamento) : undefined;
  const missingLines = order.lines.filter((l) => l.reserved < l.qty).length;
  const sortedPayments = [...payments].sort((a, b) => b.createdAtMs - a.createdAtMs);

  return (
    <main className={`screen${isOpen ? " with-bar" : ""}`}>
      <div className="top">
        <BackLink href="/encomendas" label="Encomendas" />
        <div className="top-actions">
          <a
            className="icon-btn"
            href={whatsappLink(
              order.customerPhone,
              order.fulfillment === "ready" ? readyMessage(order, store) : balance > 0 ? reminderMessage(order, store) : `Olá ${order.customerName}, sobre a encomenda ${order.number}: `,
            )}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Enviar mensagem por WhatsApp a ${order.customerName}`}
          >
            <Icon name="chat" size={22} />
          </a>
          {isOpen ? (
            <Link href={`/encomendas/${order.id}/editar`} className="btn btn-sm" style={{ border: "none" }}>
              Editar
            </Link>
          ) : null}
        </div>
      </div>

      {message ? <Notice tone="ok">{message}</Notice> : null}
      {justPaid ? (
        <div className="alert alert-ok" role="status" style={{ flexDirection: "column", gap: 10 }}>
          <span>Pagamento de {formatMT(justPaid.amountCents)} registado.</span>
          <a
            className="btn btn-sm"
            style={{ alignSelf: "flex-start", background: "#fff" }}
            href={whatsappLink(
              order.customerPhone,
              receiptMessage(order, store, {
                amountCents: justPaid.amountCents,
                methodLabel: methodLabel(justPaid.method),
                dateLabel: shortDayYear(justPaid.date),
              }),
            )}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Icon name="chat" size={18} />
            Enviar comprovativo por WhatsApp
          </a>
        </div>
      ) : null}

      <div className="stack">
        <p className="p kicker tnum" style={{ fontSize: 13 }}>
          {order.number}
        </p>
        <h1 className="h1 sm">{order.customerName}</h1>
        {order.customerPhone ? <p className="p muted tnum">{formatPhone(order.customerPhone)}</p> : null}
        <div className="pills" style={{ marginTop: 8 }}>
          {order.fulfillment !== "cancelled" ? <FinPill order={order} long /> : null}
          <FulPill fulfillment={order.fulfillment} long />
        </div>
        <p className="p small muted" style={{ marginTop: 6 }}>
          Criada a {order.createdDate ? dayMonth(order.createdDate) : "—"} na {store}
          {order.expectedDate && order.fulfillment === "awaiting" ? `. Chegada prevista: ${shortDayYear(order.expectedDate)}` : ""}
        </p>
        {order.notes ? <p className="p small">Nota: {order.notes}</p> : null}
      </div>

      {order.fulfillment === "collected" ? (
        <Notice tone="info">
          Levantada {order.collectedDate ? `a ${shortDayYear(order.collectedDate)}` : ""} na {store}
          {order.collectedByName ? `, registado por ${order.collectedByName}` : ""}.
          {order.collectedNote ? ` Nota: ${order.collectedNote}` : ""}
        </Notice>
      ) : null}
      {order.fulfillment === "cancelled" ? (
        <Notice tone="info">
          Cancelada{order.cancelledAtMs ? ` a ${shortDayFromMs(order.cancelledAtMs, ctx.tz)}` : ""}. Motivo: {order.cancelReason ?? "—"}.
          {order.retainedCents > 0 ? ` Valor retido: ${formatMT(order.retainedCents)}.` : ""}
        </Notice>
      ) : null}

      <section className="sheet pad" aria-label="Pagamento da encomenda">
        <div className="between" style={{ alignItems: "flex-end" }}>
          <div>
            <p className="label">{balance > 0 ? "Em falta" : "Pago"}</p>
            <BigMoney cents={balance > 0 ? balance : order.paidCents} tone={balance > 0 ? "owed" : undefined} size="md" />
          </div>
          <p className="p small muted tnum" style={{ textAlign: "right", lineHeight: "18px" }}>
            de {formatMT(order.totalCents)}
            <br />
            pago {formatMT(order.paidCents)}
          </p>
        </div>
        <PaymentBar order={order} payments={payments} />
      </section>

      <section className="section" aria-labelledby="artigos">
        <h2 id="artigos" className="h2">
          Artigos
        </h2>
        <div className="sheet">
          {order.lines.map((line) => (
            <div key={line.id} className="row" style={{ alignItems: "flex-start" }}>
              <div className="row-main">
                <span className="row-title">{line.name}</span>
                <span className="row-sub tnum">
                  {line.qty} × {formatCents(line.priceCents)}
                </span>
                {isOpen ? (
                  line.reserved >= line.qty ? (
                    <span className="status-line ready">
                      <Icon name="check" size={14} stroke={2.4} />
                      Reservado na loja
                    </span>
                  ) : (
                    <span className="status-line wait">
                      <Icon name="clock" size={14} stroke={2} />
                      {line.reserved > 0 ? `${line.reserved} de ${line.qty} reservados` : "A aguardar mercadoria"}
                    </span>
                  )
                ) : null}
              </div>
              <span className="strong tnum nowrap" style={{ fontSize: 15 }}>
                {formatCents(line.priceCents * line.qty)}
              </span>
            </div>
          ))}
          <div className="totals">
            <div>
              <span className="muted">Subtotal</span>
              <span>{formatCents(order.subtotalCents)}</span>
            </div>
            <div>
              <span className="muted">Desconto</span>
              <span>{formatCents(order.discountCents)}</span>
            </div>
            <div className="strong" style={{ fontSize: 16 }}>
              <span>Total</span>
              <span>{formatMT(order.totalCents)}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="pagamentos">
        <h2 id="pagamentos" className="h2">
          Pagamentos
        </h2>
        <div className="sheet">
          {sortedPayments.length === 0 && refunds.length === 0 ? (
            <p className="empty">Ainda não há pagamentos.</p>
          ) : null}
          {sortedPayments.map((p) => (
            <div key={p.id} className="row tight">
              <div className="row-main">
                <span className={`row-title tnum${p.status === "reversed" ? " strike muted" : ""}`}>{formatMT(p.amountCents)}</span>
                <span className="row-sub">
                  {methodLabel(p.method)}, {shortDay(p.date)}
                  {p.reference ? `, ref. ${p.reference}` : ""}, por {p.byName}
                </span>
                {p.status === "reversed" ? <span className="row-sub due-text">Estornado: {p.reverseReason}</span> : null}
              </div>
              {p.status === "valid" ? (
                <>
                  <a
                    className="icon-btn ghost"
                    href={whatsappLink(
                      order.customerPhone,
                      receiptMessage(order, store, { amountCents: p.amountCents, methodLabel: methodLabel(p.method), dateLabel: shortDayYear(p.date) }),
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Partilhar comprovativo do pagamento de ${formatMT(p.amountCents)}`}
                  >
                    <Icon name="share" />
                  </a>
                  {isOpen ? (
                    <Link href={`/encomendas/${order.id}/estorno/${p.id}`} className="link-btn" style={{ padding: "0 8px" }}>
                      Estornar
                    </Link>
                  ) : null}
                </>
              ) : null}
            </div>
          ))}
          {refunds.map((r) => (
            <div key={r.id} className="row">
              <div className="row-main">
                <span className="row-title tnum">Reembolso de {formatMT(r.amountCents)}</span>
                <span className="row-sub">
                  {methodLabel(r.method)}, {shortDay(r.date)}, por {r.byName}. {r.reason}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="section" aria-labelledby="mais">
        <h2 id="mais" className="h2">
          Mais ações
        </h2>
        <div className="sheet">
          {order.customerId ? (
            <Link href={`/clientes/${order.customerId}`} className="row">
              <span className="row-main row-title">Ficha do cliente</span>
              <Icon name="chevron" size={18} />
            </Link>
          ) : null}
          {isOpen && order.paidCents > 0 ? (
            <Link href={`/encomendas/${order.id}/reembolso`} className="row">
              <span className="row-main row-title">Registar reembolso</span>
              <Icon name="chevron" size={18} />
            </Link>
          ) : null}
          {isOpen ? (
            <Link href={`/encomendas/${order.id}/cancelar`} className="row">
              <span className="row-main row-title due-text">Cancelar encomenda</span>
              <Icon name="chevron" size={18} />
            </Link>
          ) : null}
          {order.fulfillment === "collected" ? (
            <Link href={`/encomendas/${order.id}/anular-levantamento`} className="row">
              <span className="row-main row-title">Anular levantamento</span>
              <Icon name="chevron" size={18} />
            </Link>
          ) : null}
        </div>
      </section>

      {history.length ? (
        <details className="history">
          <summary>Histórico de alterações ({history.length})</summary>
          <div className="sheet">
            {history.map((h) => (
              <div key={h.id} className="row">
                <div className="row-main">
                  <span className="row-title" style={{ fontSize: 15 }}>
                    {h.label}
                  </span>
                  <span className="row-sub">
                    {h.atMs ? `${shortDayFromMs(h.atMs, ctx.tz)} às ${timeFromMs(h.atMs, ctx.tz)}, ` : ""}
                    {h.byName}
                    {h.reason ? `. Motivo: ${h.reason}` : ""}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </details>
      ) : null}

      {isOpen ? (
        <div className="bottom-bar">
          <div className="bottom-bar-inner">
            {balance > 0 ? (
              <p className="bar-note owed-text">
                <Icon name="lock" size={16} stroke={2} />
                Faltam {formatMT(balance)} para poder levantar
              </p>
            ) : missingLines > 0 ? (
              <p className="bar-note" style={{ color: "var(--aguardar)" }}>
                <Icon name="clock" size={16} stroke={2} />
                Paga. {missingLines === 1 ? "1 artigo a aguardar mercadoria" : `${missingLines} artigos a aguardar mercadoria`}
              </p>
            ) : (
              <p className="bar-note ok-text">
                <Icon name="check" size={16} stroke={2.4} />
                Paga e pronta para levantar
              </p>
            )}
            {balance > 0 ? (
              <>
                <Link href={`/encomendas/${order.id}/pagamento`} className="btn btn-primary">
                  Registar pagamento
                </Link>
                <Link href={`/encomendas/${order.id}/levantamento`} className="btn">
                  Confirmar levantamento
                </Link>
              </>
            ) : (
              <Link href={`/encomendas/${order.id}/levantamento`} className={missingLines > 0 ? "btn" : "btn btn-primary"}>
                Confirmar levantamento
              </Link>
            )}
          </div>
        </div>
      ) : null}
    </main>
  );
}
