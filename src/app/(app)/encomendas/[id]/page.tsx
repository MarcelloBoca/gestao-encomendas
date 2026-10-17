import type { Metadata } from "next";
import { randomUUID } from "crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getContext, storeName as nameOfStore } from "@/lib/session";
import { getOrderBundle } from "@/lib/server/data";
import { agoLabel, dayMonth, daysBetween, shortDay, shortDayFromMs, shortDayYear, timeFromMs, todayIso } from "@/lib/dates";
import { balanceOf, collectBlockers, financialStatus, isOpen, paidPercent } from "@/lib/domain";
import { formatCents, formatMT } from "@/lib/money";
import { formatPhone, readyMessage, receiptMessage, reminderMessage, whatsappLink } from "@/lib/phone";
import { plural } from "@/lib/text";
import { methodLabel } from "@/lib/types";
import { markArrived, undoArrival } from "@/app/actions/orders";
import Icon, { MoreIcon } from "@/components/Icon";
import InlineAction from "@/components/InlineAction";
import { BackLink, Notice, PayProgress, Ring } from "@/components/ui";

export const metadata: Metadata = { title: "Encomenda" };

const MESSAGES: Record<string, string> = {
  criada: "Encomenda criada. Fica a aguardar mercadoria até marcar a chegada.",
  alterada: "Encomenda alterada.",
  cancelada: "Encomenda cancelada.",
  estorno: "Pagamento estornado.",
  reembolso: "Reembolso registado.",
  chegou: "Mercadoria marcada como chegada. Pode avisar a cliente.",
  desmarcada: "A encomenda voltou a aguardar mercadoria.",
  levantada: "Levantamento confirmado.",
  anulado: "Levantamento anulado. A encomenda voltou a Pronta para levantar.",
};

const FIN_TAG = {
  unpaid: { label: "Por pagar", className: "due-text", tone: "tone-due" },
  partial: { label: "Parcial", className: "owed-text", tone: "tone-owed" },
  paid: { label: "Paga", className: "ok-text", tone: "tone-ok" },
} as const;

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

  const today = todayIso(ctx.tz);
  const store = nameOfStore(ctx, order.storeId);
  const balance = balanceOf(order.totalCents, order.paidCents);
  const open = isOpen(order.fulfillment);
  const blockers = collectBlockers(order);
  const fin = financialStatus(order.totalCents, order.paidCents);
  const percent = paidPercent(order.totalCents, order.paidCents);
  const message = typeof sp.msg === "string" ? MESSAGES[sp.msg] : undefined;
  const justPaid = typeof sp.pagamento === "string" ? payments.find((p) => p.id === sp.pagamento) : undefined;
  const validPayments = payments.filter((p) => p.status === "valid");
  const sortedPayments = [...payments].sort((a, b) => b.createdAtMs - a.createdAtMs);
  const waitingDays = order.createdDate ? daysBetween(order.createdDate, today) : 0;
  const orderField = { orderId: order.id };

  const chatText =
    order.fulfillment === "ready"
      ? readyMessage(order, store)
      : balance > 0 && open
        ? reminderMessage(order, store)
        : `Olá ${order.customerName}, sobre a encomenda ${order.number}: `;

  return (
    <main className={`screen${open ? " with-bar" : ""}`}>
      <div className="top">
        <BackLink href="/encomendas" label="Encomendas" />
        <div className="top-actions">
          <a
            className="icon-btn"
            href={whatsappLink(order.customerPhone, chatText)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Enviar mensagem por WhatsApp a ${order.customerName}`}
          >
            <Icon name="chat" size={21} />
          </a>
          <details className="menu">
            <summary className="icon-btn" aria-label="Mais ações" style={{ color: "var(--ameixa)" }}>
              <MoreIcon />
            </summary>
            <div className="menu-list">
              {open ? (
                <Link href={`/encomendas/${order.id}/editar`}>
                  <Icon name="edit" size={18} />
                  Editar encomenda
                </Link>
              ) : null}
              {order.customerId ? (
                <Link href={`/clientes/${order.customerId}`}>
                  <Icon name="users" size={18} />
                  Ficha da cliente
                </Link>
              ) : null}
              {open && order.paidCents > 0 ? (
                <Link href={`/encomendas/${order.id}/reembolso`}>
                  <Icon name="undo" size={18} />
                  Registar reembolso
                </Link>
              ) : null}
              {order.fulfillment === "ready" ? (
                <InlineAction
                  action={undoArrival}
                  fields={{ ...orderField, key: randomUUID() }}
                  className=""
                  pendingText="A desmarcar…"
                  confirmText="A encomenda volta a aguardar mercadoria. Confirmar?"
                  label={
                    <>
                      <Icon name="box" size={18} />
                      Desmarcar chegada
                    </>
                  }
                />
              ) : null}
              {order.fulfillment === "collected" ? (
                <Link href={`/encomendas/${order.id}/anular-levantamento`}>
                  <Icon name="undo" size={18} />
                  Anular levantamento
                </Link>
              ) : null}
              {open ? (
                <Link href={`/encomendas/${order.id}/cancelar`} className="danger">
                  <Icon name="close" size={18} />
                  Cancelar encomenda
                </Link>
              ) : null}
            </div>
          </details>
        </div>
      </div>

      {message ? <Notice tone="ok">{message}</Notice> : null}
      {justPaid ? (
        <div className="alert alert-ok" role="status" style={{ flexDirection: "column", gap: 10 }}>
          <span>Pagamento de {formatMT(justPaid.amountCents)} registado.</span>
          <a
            className="btn btn-sm"
            style={{ alignSelf: "flex-start", border: "none" }}
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
        <p className="number">{order.number}</p>
        <h1 className="h1 sm">{order.customerName}</h1>
        {order.customerPhone ? <p className="p muted tnum">{formatPhone(order.customerPhone)}</p> : null}
        <p className="p small muted" style={{ marginTop: 4 }}>
          Criada a {order.createdDate ? dayMonth(order.createdDate) : "—"} na {store}
        </p>
        {order.notes ? (
          <p className="p small" style={{ marginTop: 4 }}>
            Nota: {order.notes}
          </p>
        ) : null}
      </div>

      {order.fulfillment === "cancelled" ? (
        <Notice tone="info">
          Cancelada{order.cancelledAtMs ? ` a ${shortDayFromMs(order.cancelledAtMs, ctx.tz)}` : ""}. Motivo: {order.cancelReason ?? "—"}.
          {order.retainedCents > 0 ? ` Valor retido: ${formatMT(order.retainedCents)}.` : ""}
        </Notice>
      ) : null}

      <section className="pay-card" aria-label="Pagamento da encomenda">
        <Ring size={112} stroke={12} percent={percent} color={balance === 0 ? "#1F7A55" : "#8E2F6B"} label={`${percent}% pago`}>
          <text x="56" y="58" textAnchor="middle" fontSize="24" fontWeight="800" fill="#241821">
            {percent}%
          </text>
          <text x="56" y="76" textAnchor="middle" fontSize="12" fontWeight="600" fill="#76636F">
            pago
          </text>
        </Ring>
        <div className="stack" style={{ minWidth: 0 }}>
          {balance > 0 ? (
            <>
              <span className="label" style={{ fontWeight: 600 }}>
                Faltam
              </span>
              <span className="money-big md owed">
                {formatCents(balance)} <span className="unit">MT</span>
              </span>
              <span className="small muted tnum">
                Pago {formatCents(order.paidCents)} de {formatMT(order.totalCents)}
              </span>
            </>
          ) : (
            <>
              <span className="label" style={{ fontWeight: 600 }}>
                Pago
              </span>
              <span className="money-big md" style={{ color: "var(--paga)" }}>
                {formatCents(order.paidCents)} <span className="unit">MT</span>
              </span>
              <span className="small muted">
                {validPayments.length ? `em ${plural(validPayments.length, "pagamento", "pagamentos")}` : "Sem pagamentos"}
              </span>
            </>
          )}
        </div>
      </section>

      {order.fulfillment !== "cancelled" ? (
        <section className="section" aria-labelledby="estado">
          <h2 id="estado" className="h2">
            Estado
          </h2>
          <div className="cards">
            <div className="status-card">
              <span className={`badge-icon ${order.fulfillment === "awaiting" ? "tone-wait" : "tone-ok"}`} aria-hidden="true">
                <Icon name={order.fulfillment === "awaiting" ? "box" : "check"} size={20} stroke={order.fulfillment === "awaiting" ? 1.8 : 2.4} />
              </span>
              <span className="row-main">
                <span className="row-title">Mercadoria</span>
                <span className="row-sub">
                  {order.fulfillment === "awaiting"
                    ? `A aguardar desde ${order.createdDate ? shortDay(order.createdDate) : "—"}, ${agoLabel(waitingDays)}`
                    : `Chegou${order.readyAtMs ? ` a ${shortDayFromMs(order.readyAtMs, ctx.tz)}` : ""}${order.readyByName ? `, marcada por ${order.readyByName}` : ""}`}
                </span>
              </span>
              {order.fulfillment === "awaiting" ? (
                <InlineAction
                  action={markArrived}
                  fields={{ ...orderField, key: randomUUID() }}
                  className="btn btn-primary btn-sm"
                  pendingText="A marcar…"
                  label="Chegou"
                />
              ) : (
                <span className="tag ok-text">Chegou</span>
              )}
            </div>

            <div className="status-card col">
              <span className="oc-head">
                <span className={`badge-icon ${FIN_TAG[fin].tone}`} aria-hidden="true">
                  <Icon name="wallet" size={20} />
                </span>
                <span className="row-main">
                  <span className="row-title">Pagamento</span>
                  <span className="row-sub">
                    {validPayments.length ? `${plural(validPayments.length, "parcela registada", "parcelas registadas")}` : "Ainda sem pagamentos"}
                  </span>
                </span>
                <span className={`tag ${FIN_TAG[fin].className}`}>{FIN_TAG[fin].label}</span>
              </span>
              <PayProgress totalCents={order.totalCents} paidCents={order.paidCents} />
            </div>

            <div className="status-card">
              {order.fulfillment === "collected" ? (
                <>
                  <span className="badge-icon tone-ok" aria-hidden="true">
                    <Icon name="check" size={20} stroke={2.4} />
                  </span>
                  <span className="row-main">
                    <span className="row-title">Levantamento</span>
                    <span className="row-sub">
                      Levantada{order.collectedDate ? ` a ${shortDayYear(order.collectedDate)}` : ""}
                      {order.collectedByName ? `, registado por ${order.collectedByName}` : ""}
                      {order.collectedNote ? `. ${order.collectedNote}` : ""}
                    </span>
                  </span>
                  <span className="tag ok-text">Feito</span>
                </>
              ) : blockers.length ? (
                <>
                  <span className="badge-icon tone-blocked" aria-hidden="true">
                    <Icon name="lock" size={20} />
                  </span>
                  <span className="row-main">
                    <span className="row-title">Levantamento</span>
                    <span className="row-sub">Possível quando estiver paga e a mercadoria tiver chegado</span>
                  </span>
                  <span className="tag" style={{ color: "var(--bloqueado)" }}>
                    Bloqueado
                  </span>
                </>
              ) : (
                <>
                  <span className="badge-icon tone-ready" aria-hidden="true">
                    <Icon name="bag" size={20} />
                  </span>
                  <span className="row-main">
                    <span className="row-title">Levantamento</span>
                    <span className="row-sub">Paga e com a mercadoria na loja</span>
                  </span>
                  <span className="tag ready-text">Pode levantar</span>
                </>
              )}
            </div>
          </div>
        </section>
      ) : null}

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
              </div>
              <span className="strong tnum nowrap" style={{ fontSize: 15 }}>
                {formatCents(line.priceCents * line.qty)}
              </span>
            </div>
          ))}
          <div className="totals">
            <span>Total</span>
            <span>{formatMT(order.totalCents)}</span>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="pagamentos">
        <h2 id="pagamentos" className="h2">
          Pagamentos
        </h2>
        <div className="sheet">
          {sortedPayments.length === 0 && refunds.length === 0 ? <p className="empty">Ainda não há pagamentos.</p> : null}
          {sortedPayments.map((p) => (
            <div key={p.id} className="row tight">
              <div className="row-main">
                <span className={`row-title tnum${p.status === "reversed" ? " strike muted" : ""}`}>{formatMT(p.amountCents)}</span>
                <span className="tiny muted">
                  {methodLabel(p.method)}, {shortDay(p.date)}
                  {p.reference ? `, ref. ${p.reference}` : ""}, por {p.byName}
                </span>
                {p.status === "reversed" ? <span className="tiny due-text">Estornado: {p.reverseReason}</span> : null}
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
                  {open ? (
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
                <span className="tiny muted">
                  {methodLabel(r.method)}, {shortDay(r.date)}, por {r.byName}. {r.reason}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {history.length ? (
        <details className="history">
          <summary>Histórico ({history.length})</summary>
          <div className="sheet">
            {history.map((h) => (
              <div key={h.id} className="row">
                <div className="row-main">
                  <span className="row-title" style={{ fontWeight: 600 }}>
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

      {open ? (
        <div className="bottom-bar">
          <div className="bottom-bar-inner">
            {blockers.length === 0 ? (
              <p className="bar-note ok-text">
                <Icon name="check" size={16} stroke={2.4} />
                Paga e pronta para levantar
              </p>
            ) : blockers.includes("balance") ? (
              <p className="bar-note owed-text">
                <Icon name="lock" size={16} stroke={2} />
                Faltam {formatMT(balance)}
                {blockers.includes("arrival") ? " e a chegada da mercadoria" : " para poder levantar"}
              </p>
            ) : (
              <p className="bar-note wait-text">
                <Icon name="box" size={16} stroke={2} />
                Paga. Falta a chegada da mercadoria
              </p>
            )}
            {blockers.includes("balance") ? (
              <Link href={`/encomendas/${order.id}/pagamento`} className="btn btn-primary">
                Registar pagamento
              </Link>
            ) : blockers.includes("arrival") ? (
              <InlineAction action={markArrived} fields={{ ...orderField, key: randomUUID() }} pendingText="A marcar…" label="Mercadoria chegou" />
            ) : null}
            <Link
              href={`/encomendas/${order.id}/levantamento`}
              className={blockers.length === 0 ? "btn btn-primary" : "btn btn-quiet"}
            >
              Confirmar levantamento
            </Link>
          </div>
        </div>
      ) : null}
    </main>
  );
}
