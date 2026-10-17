import Link from "next/link";
import { getContext } from "@/lib/session";
import { listOpenOrders, paymentsBetween, refundsBetween } from "@/lib/server/data";
import { agoLabel, daysBetween, isoDay, longDay, todayIso } from "@/lib/dates";
import { balanceOf } from "@/lib/domain";
import { formatMT } from "@/lib/money";
import { readyMessage, whatsappLink } from "@/lib/phone";
import Icon from "@/components/Icon";
import StorePicker from "@/components/StorePicker";
import { BigMoney, Empty, FinPill } from "@/components/ui";

export default async function HomePage() {
  const ctx = await getContext();
  const today = todayIso(ctx.tz);
  const [open, payments, refunds] = await Promise.all([
    listOpenOrders(ctx.businessId),
    paymentsBetween(ctx.businessId, today, today),
    refundsBetween(ctx.businessId, today, today),
  ]);

  const storeOrders = open.filter((o) => o.storeId === ctx.storeId);
  const validPayments = payments.filter((p) => p.status === "valid" && p.storeId === ctx.storeId);
  const storeRefunds = refunds.filter((r) => r.storeId === ctx.storeId);
  const received = validPayments.reduce((s, p) => s + p.amountCents, 0) - storeRefunds.reduce((s, r) => s + r.amountCents, 0);

  const owed = storeOrders.reduce((s, o) => s + balanceOf(o.totalCents, o.paidCents), 0);
  const ready = storeOrders
    .filter((o) => o.fulfillment === "ready")
    .sort((a, b) => (a.readyAtMs ?? 0) - (b.readyAtMs ?? 0));
  const oldDebts = storeOrders.filter((o) => balanceOf(o.totalCents, o.paidCents) > 0 && daysBetween(o.createdDate || today, today) > 60);
  const oldDebtTotal = oldDebts.reduce((s, o) => s + balanceOf(o.totalCents, o.paidCents), 0);
  const late = storeOrders.filter((o) => o.fulfillment === "awaiting" && o.expectedDate && o.expectedDate < today);
  const staleReady = ready.filter((o) => o.readyAtMs && daysBetween(isoDay(new Date(o.readyAtMs), ctx.tz), today) > 7);
  const storeName = ctx.store?.name ?? "";

  const paymentsLabel = `${validPayments.length} ${validPayments.length === 1 ? "pagamento" : "pagamentos"}`;
  const refundsLabel = storeRefunds.length ? ` e ${storeRefunds.length} ${storeRefunds.length === 1 ? "reembolso" : "reembolsos"}` : "";

  return (
    <main className="screen">
      <div className="stack-md" style={{ gap: 8 }}>
        <div className="top">
          <StorePicker stores={ctx.activeStores} storeId={ctx.storeId} back="/" />
          <div className="top-actions">
            <Link href="/definicoes" className="icon-btn" aria-label="Definições">
              <Icon name="settings" size={20} />
            </Link>
            <Link href="/encomendas/nova" className="icon-btn solid" aria-label="Nova encomenda">
              <Icon name="plus" size={22} stroke={2.2} />
            </Link>
          </div>
        </div>
        <div>
          <h1 className="h1">Hoje</h1>
          <p className="p muted">{longDay(today)}</p>
        </div>
      </div>

      <section className="sheet pad" aria-label="Resumo do dia">
        <div>
          <p className="label">Recebido hoje</p>
          <BigMoney cents={received} />
          <p className="p small muted">
            {paymentsLabel}
            {refundsLabel}
          </p>
        </div>
        <div className="split">
          <Link href="/relatorios/dividas" className="stat">
            <span className="stat-label">
              <span className="dot owed" aria-hidden="true" />
              Em dívida
            </span>
            <span className="stat-value">{formatMT(owed)}</span>
          </Link>
          <Link href="/encomendas?estado=prontas" className="stat">
            <span className="stat-label">
              <span className="dot ready" aria-hidden="true" />
              Prontas a levantar
            </span>
            <span className="stat-value">
              {ready.length} {ready.length === 1 ? "encomenda" : "encomendas"}
            </span>
          </Link>
        </div>
      </section>

      {oldDebts.length || late.length || staleReady.length ? (
        <section className="section" aria-labelledby="atencao">
          <h2 id="atencao" className="h2">
            Precisa de atenção
          </h2>
          <div className="sheet">
            {oldDebts.length ? (
              <Link href="/relatorios/dividas" className="row">
                <span className="badge-icon tone-owed" aria-hidden="true">
                  <Icon name="clock" />
                </span>
                <span className="row-main">
                  <span className="row-title">
                    {oldDebts.length} {oldDebts.length === 1 ? "dívida" : "dívidas"} com mais de 60 dias
                  </span>
                  <span className="row-sub">Faltam {formatMT(oldDebtTotal)} no total</span>
                </span>
                <Icon name="chevron" size={18} />
              </Link>
            ) : null}
            {late.length ? (
              <Link href="/encomendas?estado=atrasadas" className="row">
                <span className="badge-icon tone-wait" aria-hidden="true">
                  <Icon name="box" />
                </span>
                <span className="row-main">
                  <span className="row-title">
                    {late.length} {late.length === 1 ? "encomenda atrasada" : "encomendas atrasadas"}
                  </span>
                  <span className="row-sub">A data prevista de chegada já passou</span>
                </span>
                <Icon name="chevron" size={18} />
              </Link>
            ) : null}
            {staleReady.length ? (
              <Link href="/relatorios/prontas" className="row">
                <span className="badge-icon tone-ready" aria-hidden="true">
                  <Icon name="clock" />
                </span>
                <span className="row-main">
                  <span className="row-title">
                    {staleReady.length} {staleReady.length === 1 ? "pronta" : "prontas"} há mais de 7 dias
                  </span>
                  <span className="row-sub">Mercadoria parada na loja</span>
                </span>
                <Icon name="chevron" size={18} />
              </Link>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="section" aria-labelledby="prontas">
        <div className="section-head">
          <h2 id="prontas" className="h2">
            Prontas a levantar
          </h2>
          {ready.length > 3 ? (
            <Link href="/encomendas?estado=prontas" className="small strong">
              Ver as {ready.length}
            </Link>
          ) : null}
        </div>
        <div className="sheet">
          {ready.length === 0 ? (
            <Empty>Nenhuma encomenda pronta. Quando registar a receção de mercadoria, as encomendas reservadas aparecem aqui.</Empty>
          ) : (
            ready.slice(0, 3).map((order) => (
              <div key={order.id} className="row tight">
                <Link href={`/encomendas/${order.id}`} className="row-main" style={{ textDecoration: "none", color: "inherit", minHeight: 44, justifyContent: "center" }}>
                  <span className="kicker tnum">
                    {order.number}
                    {order.readyAtMs ? `, pronta ${agoLabel(daysBetween(isoDay(new Date(order.readyAtMs), ctx.tz), today))}` : ""}
                  </span>
                  <span className="row-title">{order.customerName}</span>
                </Link>
                <FinPill order={order} />
                <a
                  className="icon-btn ghost"
                  href={whatsappLink(order.customerPhone, readyMessage(order, storeName))}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Avisar ${order.customerName} por WhatsApp`}
                >
                  <Icon name="chat" size={22} />
                </a>
              </div>
            ))
          )}
        </div>
      </section>

      {storeOrders.length === 0 ? (
        <Link href="/encomendas/nova" className="btn btn-primary">
          Criar a primeira encomenda
        </Link>
      ) : null}
    </main>
  );
}
