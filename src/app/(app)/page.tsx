import Link from "next/link";
import { getContext } from "@/lib/session";
import { listOpenOrders, paymentsBetween, refundsBetween } from "@/lib/server/data";
import { agoLabel, daysBetween, hourNow, isoDay, longDay, todayIso } from "@/lib/dates";
import { balanceOf, greeting } from "@/lib/domain";
import { formatCents, formatMT, formatShort } from "@/lib/money";
import { readyMessage, whatsappLink } from "@/lib/phone";
import { plural } from "@/lib/text";
import Icon from "@/components/Icon";
import StorePicker from "@/components/StorePicker";
import { Avatar, Empty, FinPill } from "@/components/ui";

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

  const withBalance = storeOrders.filter((o) => balanceOf(o.totalCents, o.paidCents) > 0);
  const owed = withBalance.reduce((s, o) => s + balanceOf(o.totalCents, o.paidCents), 0);
  const ready = storeOrders.filter((o) => o.fulfillment === "ready").sort((a, b) => (a.readyAtMs ?? 0) - (b.readyAtMs ?? 0));
  const readyDays = (ms: number | null) => (ms ? daysBetween(isoDay(new Date(ms), ctx.tz), today) : 0);

  const oldDebts = withBalance.filter((o) => daysBetween(o.createdDate || today, today) > 60);
  const oldDebtTotal = oldDebts.reduce((s, o) => s + balanceOf(o.totalCents, o.paidCents), 0);
  const longWait = storeOrders.filter((o) => o.fulfillment === "awaiting" && daysBetween(o.createdDate || today, today) > 15);
  const staleReady = ready.filter((o) => readyDays(o.readyAtMs) > 7);
  const storeName = ctx.store?.name ?? "";
  const firstName = ctx.name.trim().split(/\s+/)[0] ?? "";

  const receivedNote = `${plural(validPayments.length, "pagamento", "pagamentos")}${
    storeRefunds.length ? ` e ${plural(storeRefunds.length, "reembolso", "reembolsos")}` : ""
  }`;

  return (
    <main className="screen">
      <header className="hero">
        <svg className="hero-deco" width="240" height="280" viewBox="150 0 240 280" aria-hidden="true">
          <path d="M180 300 C 230 230, 250 170, 300 130 S 380 70, 420 60" fill="none" stroke="#ECB0DC" strokeOpacity="0.22" strokeWidth="1.5" />
          <path d="M210 300 C 260 240, 290 190, 330 160 S 400 110, 430 104" fill="none" stroke="#ECB0DC" strokeOpacity="0.12" strokeWidth="1.5" />
          <path d="M332 92 l4 10 l10 4 l-10 4 l-4 10 l-4 -10 l-10 -4 l10 -4 z" fill="#ECB0DC" fillOpacity="0.5" />
        </svg>
        <div className="hero-bar on-dark">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="hero-logo" src="/icon-192.png" alt="Sola.chic" width={44} height={44} />
          <StorePicker stores={ctx.activeStores} storeId={ctx.storeId} back="/" />
          <span style={{ flex: 1 }} />
          <Link href="/definicoes" className="icon-btn glass" aria-label="Definições">
            <Icon name="settings" size={20} />
          </Link>
        </div>
        <h1>
          {greeting(hourNow(ctx.tz))}
          {firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="hero-sub">{longDay(today)}</p>
      </header>

      <Link href="/relatorios/fecho" className="card today-card lift" aria-label={`Recebido hoje: ${formatMT(received)}. Ver fecho de caixa`}>
        <span className="row-main" style={{ gap: 4 }}>
          <span className="label" style={{ fontWeight: 600 }}>
            Recebido hoje
          </span>
          <span className="money-big">
            {formatCents(received)} <span className="unit">MT</span>
          </span>
          <span className="small muted">{receivedNote}</span>
        </span>
        <span className="go" aria-hidden="true">
          <Icon name="chevron" size={18} stroke={2.2} />
        </span>
      </Link>

      <div className="tiles">
        <Link href="/relatorios/dividas" className="tile">
          <span className="tile-head">
            <span className="badge-icon sm tone-owed" aria-hidden="true">
              <Icon name="clock" size={17} stroke={2} />
            </span>
            Em dívida
          </span>
          <span className="tile-value">{formatShort(owed)} MT</span>
          <span className="tiny muted">em {plural(withBalance.length, "encomenda", "encomendas")}</span>
        </Link>
        <Link href="/encomendas?estado=prontas" className="tile">
          <span className="tile-head">
            <span className="badge-icon sm tone-ready" aria-hidden="true">
              <Icon name="bag" size={17} stroke={2} />
            </span>
            Prontas
          </span>
          <span className="tile-value">{plural(ready.length, "encomenda", "encomendas")}</span>
          <span className="tiny muted">à espera da cliente</span>
        </Link>
      </div>

      <section className="section" aria-labelledby="acoes">
        <h2 id="acoes" className="h2">
          Ações rápidas
        </h2>
        <div className="quick">
          <Link href="/encomendas/nova">
            <span className="quick-icon solid" aria-hidden="true">
              <Icon name="plus" size={24} stroke={2.2} />
            </span>
            Nova encomenda
          </Link>
          <Link href="/encomendas?estado=porpagar">
            <span className="quick-icon" aria-hidden="true">
              <Icon name="wallet" size={24} />
            </span>
            Registar pagamento
          </Link>
          <Link href="/encomendas/chegada">
            <span className="quick-icon" aria-hidden="true">
              <Icon name="box" size={24} />
            </span>
            Mercadoria chegou
          </Link>
          <Link href="/clientes">
            <span className="quick-icon" aria-hidden="true">
              <Icon name="users" size={24} />
            </span>
            Clientes
          </Link>
        </div>
      </section>

      {oldDebts.length || longWait.length || staleReady.length ? (
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
                  <span className="row-title">{plural(oldDebts.length, "dívida", "dívidas")} com mais de 60 dias</span>
                  <span className="row-sub">Faltam {formatMT(oldDebtTotal)} no total</span>
                </span>
                <span className="chev">
                  <Icon name="chevron" size={18} stroke={2} />
                </span>
              </Link>
            ) : null}
            {longWait.length ? (
              <Link href="/encomendas/chegada" className="row">
                <span className="badge-icon tone-wait" aria-hidden="true">
                  <Icon name="box" />
                </span>
                <span className="row-main">
                  <span className="row-title">{longWait.length} à espera de mercadoria há +15 dias</span>
                  <span className="row-sub">Marque a chegada quando o fornecedor entregar</span>
                </span>
                <span className="chev">
                  <Icon name="chevron" size={18} stroke={2} />
                </span>
              </Link>
            ) : null}
            {staleReady.length ? (
              <Link href="/relatorios/prontas" className="row">
                <span className="badge-icon tone-ready" aria-hidden="true">
                  <Icon name="bag" />
                </span>
                <span className="row-main">
                  <span className="row-title">
                    {staleReady.length} {staleReady.length === 1 ? "pronta" : "prontas"} há mais de 7 dias
                  </span>
                  <span className="row-sub">Lembre a cliente de vir levantar</span>
                </span>
                <span className="chev">
                  <Icon name="chevron" size={18} stroke={2} />
                </span>
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
          {ready.length > 3 ? <Link href="/encomendas?estado=prontas">Ver as {ready.length}</Link> : null}
        </div>
        <div className="sheet">
          {ready.length === 0 ? (
            <Empty>Nenhuma encomenda pronta. Quando a mercadoria chegar, marque a chegada e a encomenda aparece aqui.</Empty>
          ) : (
            ready.slice(0, 3).map((order) => (
              <div key={order.id} className="row tight">
                <Avatar name={order.customerName} />
                <Link
                  href={`/encomendas/${order.id}`}
                  className="row-main"
                  style={{ textDecoration: "none", color: "inherit", minHeight: 44, justifyContent: "center" }}
                >
                  <span className="row-title">{order.customerName}</span>
                  <span className="tiny muted tnum">
                    {order.number}, pronta {agoLabel(readyDays(order.readyAtMs))}
                  </span>
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
