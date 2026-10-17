import type { Metadata } from "next";
import Link from "next/link";
import { getContext } from "@/lib/session";
import { listOpenOrders } from "@/lib/server/data";
import { inStore, reportStore, type SearchParams } from "@/lib/server/report-params";
import { daysBetween, todayIso } from "@/lib/dates";
import { ageBucket, balanceOf } from "@/lib/domain";
import { formatCents, formatMT } from "@/lib/money";
import StoreFilter from "@/components/StoreFilter";
import { BackLink, Empty, FulPill } from "@/components/ui";

export const metadata: Metadata = { title: "Dívidas por antiguidade" };

const GROUPS = [
  { id: "60+", label: "Mais de 60 dias" },
  { id: "31-60", label: "31 a 60 dias" },
  { id: "0-30", label: "Até 30 dias" },
] as const;

export default async function DebtsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await getContext();
  const params = await searchParams;
  const store = reportStore(ctx, params);
  const today = todayIso(ctx.tz);
  const open = (await listOpenOrders(ctx.businessId))
    .filter((o) => inStore(store.storeId, o.storeId))
    .map((o) => ({ order: o, balance: balanceOf(o.totalCents, o.paidCents), days: daysBetween(o.createdDate || today, today) }))
    .filter((x) => x.balance > 0)
    .sort((a, b) => b.days - a.days);
  const total = open.reduce((s, x) => s + x.balance, 0);

  return (
    <main className="screen">
      <BackLink href="/relatorios" label="Relatórios" />
      <h1 className="h1 sm" style={{ marginTop: -8 }}>
        Dívidas por antiguidade
      </h1>
      <StoreFilter stores={ctx.activeStores} current={store.param} hrefFor={(loja) => `/relatorios/dividas?loja=${loja}`} />
      <section className="sheet pad" aria-label="Total em dívida">
        <p className="label">Em dívida, {store.label}</p>
        <p className="money-big md owed">{formatMT(total)}</p>
        <p className="hint">Encomendas em aberto com saldo, pela idade desde a criação.</p>
      </section>
      {open.length === 0 ? <Empty>Não há dívidas em aberto.</Empty> : null}
      {GROUPS.map((group) => {
        const rows = open.filter((x) => ageBucket(x.days) === group.id);
        if (rows.length === 0) return null;
        const sum = rows.reduce((s, x) => s + x.balance, 0);
        return (
          <section key={group.id} className="section" aria-label={group.label}>
            <div className="section-head">
              <h2 className="h2">{group.label}</h2>
              <span className="small strong owed-text tnum">{formatMT(sum)}</span>
            </div>
            <div className="sheet">
              {rows.map(({ order, balance, days }) => (
                <Link key={order.id} href={`/encomendas/${order.id}`} className="order-row">
                  <span className="between kicker tnum">
                    <span>{order.number}</span>
                    <span>{days} dias</span>
                  </span>
                  <span className="between">
                    <span className="row-title">{order.customerName}</span>
                    <span className="strong owed-text tnum nowrap">{formatCents(balance)}</span>
                  </span>
                  <span className="between center">
                    <FulPill fulfillment={order.fulfillment} />
                    <span className="small muted tnum">de {formatCents(order.totalCents)}</span>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </main>
  );
}
