import type { Metadata } from "next";
import Link from "next/link";
import { getContext } from "@/lib/session";
import { listOpenOrders, ordersCollectedBetween, ordersCreatedSince, paymentsBetween, refundsBetween } from "@/lib/server/data";
import { inStore, reportStore, type SearchParams } from "@/lib/server/report-params";
import { addDays, firstOfMonth, shortDay, startOfDayMs, todayIso } from "@/lib/dates";
import { balanceOf } from "@/lib/domain";
import { formatMT } from "@/lib/money";
import Icon from "@/components/Icon";
import StoreFilter from "@/components/StoreFilter";

export const metadata: Metadata = { title: "Relatórios" };

const PERIODS = [
  { id: "hoje", label: "Hoje" },
  { id: "7d", label: "7 dias" },
  { id: "30d", label: "30 dias" },
  { id: "mes", label: "Este mês" },
];

const REPORTS = [
  { href: "/relatorios/fecho", title: "Fecho de caixa", sub: "Recebido por método, dia e utilizador" },
  { href: "/relatorios/dividas", title: "Dívidas por antiguidade", sub: "Encomendas com saldo, por idade" },
  { href: "/relatorios/prontas", title: "Prontas por levantar", sub: "Mercadoria parada na loja" },
  { href: "/relatorios/a-pedir", title: "Artigos a pedir", sub: "Quantidades encomendadas ainda sem stock" },
  { href: "/relatorios/correcoes", title: "Correções", sub: "Estornos, reembolsos, ajustes, cancelamentos" },
];

export default async function ReportsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await getContext();
  const params = await searchParams;
  const period = typeof params.p === "string" && PERIODS.some((x) => x.id === params.p) ? params.p : "hoje";
  const store = reportStore(ctx, params);
  const today = todayIso(ctx.tz);
  const from =
    period === "7d" ? addDays(today, -6) : period === "30d" ? addDays(today, -29) : period === "mes" ? firstOfMonth(today) : today;

  const [created, payments, refunds, open, collected] = await Promise.all([
    ordersCreatedSince(ctx.businessId, startOfDayMs(from, ctx.tz)),
    paymentsBetween(ctx.businessId, from, today),
    refundsBetween(ctx.businessId, from, today),
    listOpenOrders(ctx.businessId),
    ordersCollectedBetween(ctx.businessId, from, today),
  ]);

  const createdHere = created.filter((o) => inStore(store.storeId, o.storeId) && o.fulfillment !== "cancelled");
  const createdValue = createdHere.reduce((s, o) => s + o.totalCents, 0);
  const received =
    payments.filter((p) => p.status === "valid" && inStore(store.storeId, p.storeId)).reduce((s, p) => s + p.amountCents, 0) -
    refunds.filter((r) => inStore(store.storeId, r.storeId)).reduce((s, r) => s + r.amountCents, 0);
  const openHere = open.filter((o) => inStore(store.storeId, o.storeId));
  const owed = openHere.reduce((s, o) => s + balanceOf(o.totalCents, o.paidCents), 0);
  const ready = openHere.filter((o) => o.fulfillment === "ready").length;
  const collectedHere = collected.filter((o) => inStore(store.storeId, o.storeId)).length;

  const href = (p: string, loja: string) => `/relatorios?p=${p}&loja=${loja}`;
  const periodLabel = from === today ? "hoje" : `de ${shortDay(from)} a ${shortDay(today)}`;

  return (
    <main className="screen">
      <h1 className="h1">Relatórios</h1>
      <nav className="chip-row" aria-label="Período">
        {PERIODS.map((x) => (
          <Link key={x.id} href={href(x.id, store.param)} className="chip" aria-current={x.id === period ? "true" : undefined}>
            {x.label}
          </Link>
        ))}
      </nav>
      <StoreFilter stores={ctx.activeStores} current={store.param} hrefFor={(loja) => href(period, loja)} />

      <section className="sheet pad" aria-label="Painel do período">
        <div>
          <p className="label">Recebido, {periodLabel}</p>
          <p className="money-big md">{formatMT(received)}</p>
          <p className="hint">Pela data de cada pagamento, menos reembolsos.</p>
        </div>
        <div className="split">
          <div className="stat">
            <span className="stat-label">Encomendas criadas</span>
            <span className="stat-value">{createdHere.length}</span>
            <span className="hint">{formatMT(createdValue)}, pela data da encomenda</span>
          </div>
          <div className="stat">
            <span className="stat-label">Levantadas</span>
            <span className="stat-value">{collectedHere}</span>
            <span className="hint">Pela data do levantamento</span>
          </div>
        </div>
        <div className="split">
          <div className="stat">
            <span className="stat-label">
              <span className="dot owed" aria-hidden="true" />
              Em dívida agora
            </span>
            <span className="stat-value owed-text">{formatMT(owed)}</span>
          </div>
          <div className="stat">
            <span className="stat-label">
              <span className="dot ready" aria-hidden="true" />
              Prontas agora
            </span>
            <span className="stat-value">{ready}</span>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="relatorios">
        <h2 id="relatorios" className="h2">
          Relatórios detalhados
        </h2>
        <div className="sheet">
          {REPORTS.map((r) => (
            <Link key={r.href} href={`${r.href}?loja=${store.param}`} className="row">
              <span className="row-main">
                <span className="row-title">{r.title}</span>
                <span className="row-sub">{r.sub}</span>
              </span>
              <Icon name="chevron" size={18} />
            </Link>
          ))}
          <Link href="/encomendas?estado=todas" className="row">
            <span className="row-main">
              <span className="row-title">Encomendas por estado</span>
              <span className="row-sub">Por pagar, parciais, pagas, levantadas, canceladas</span>
            </span>
            <Icon name="chevron" size={18} />
          </Link>
        </div>
      </section>
    </main>
  );
}
