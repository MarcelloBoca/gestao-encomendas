import type { Metadata } from "next";
import Link from "next/link";
import { getContext, storeName } from "@/lib/session";
import { listOpenOrders } from "@/lib/server/data";
import { inStore, reportStore, type SearchParams } from "@/lib/server/report-params";
import { agoLabel, daysBetween, isoDay, todayIso } from "@/lib/dates";
import { readyMessage, whatsappLink } from "@/lib/phone";
import Icon from "@/components/Icon";
import StoreFilter from "@/components/StoreFilter";
import { BackLink, Empty, FinPill } from "@/components/ui";

export const metadata: Metadata = { title: "Prontas por levantar" };

export default async function ReadyReportPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await getContext();
  const params = await searchParams;
  const store = reportStore(ctx, params);
  const today = todayIso(ctx.tz);
  const ready = (await listOpenOrders(ctx.businessId))
    .filter((o) => o.fulfillment === "ready" && inStore(store.storeId, o.storeId))
    .map((o) => ({ order: o, days: o.readyAtMs ? daysBetween(isoDay(new Date(o.readyAtMs), ctx.tz), today) : 0 }))
    .sort((a, b) => b.days - a.days);

  return (
    <main className="screen">
      <BackLink href="/relatorios" label="Relatórios" />
      <h1 className="h1 sm" style={{ marginTop: -8 }}>
        Prontas por levantar
      </h1>
      <StoreFilter stores={ctx.activeStores} current={store.param} hrefFor={(loja) => `/relatorios/prontas?loja=${loja}`} />
      <p className="p muted" style={{ marginTop: -8 }}>
        {ready.length} {ready.length === 1 ? "encomenda pronta" : "encomendas prontas"}, das mais antigas para as mais recentes.
      </p>
      <div className="sheet">
        {ready.length === 0 ? <Empty>Não há encomendas prontas.</Empty> : null}
        {ready.map(({ order, days }) => (
          <div key={order.id} className="row tight">
            <Link href={`/encomendas/${order.id}`} className="row-main" style={{ textDecoration: "none", color: "inherit" }}>
              <span className={`kicker tnum${days > 7 ? " owed-text" : ""}`}>
                {order.number}, pronta {agoLabel(days)}
              </span>
              <span className="row-title">{order.customerName}</span>
            </Link>
            <FinPill order={order} />
            <a
              className="icon-btn ghost"
              href={whatsappLink(order.customerPhone, readyMessage(order, storeName(ctx, order.storeId)))}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Avisar ${order.customerName} por WhatsApp`}
            >
              <Icon name="chat" size={22} />
            </a>
          </div>
        ))}
      </div>
    </main>
  );
}
