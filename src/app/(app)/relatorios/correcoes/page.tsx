import type { Metadata } from "next";
import Link from "next/link";
import { getContext, storeName } from "@/lib/session";
import { auditSince } from "@/lib/server/data";
import { inStore, reportStore, type SearchParams } from "@/lib/server/report-params";
import { addDays, isValidIsoDay, shortDay, shortDayFromMs, startOfDayMs, timeFromMs, todayIso } from "@/lib/dates";
import StoreFilter from "@/components/StoreFilter";
import { BackLink, Empty } from "@/components/ui";

export const metadata: Metadata = { title: "Correções" };

export default async function CorrectionsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await getContext();
  const params = await searchParams;
  const store = reportStore(ctx, params);
  const today = todayIso(ctx.tz);
  const to = typeof params.ate === "string" && isValidIsoDay(params.ate) ? params.ate : today;
  const from = typeof params.de === "string" && isValidIsoDay(params.de) && params.de <= to ? params.de : addDays(to, -29);
  const endMs = startOfDayMs(addDays(to, 1), ctx.tz);

  const entries = (await auditSince(ctx.businessId, startOfDayMs(from, ctx.tz))).filter(
    (a) => a.kind === "correcao" && a.atMs < endMs && inStore(store.storeId, a.storeId),
  );

  return (
    <main className="screen">
      <BackLink href="/relatorios" label="Relatórios" />
      <h1 className="h1 sm" style={{ marginTop: -8 }}>
        Correções
      </h1>
      <form action="/relatorios/correcoes" method="get" className="stack-md">
        <input type="hidden" name="loja" value={store.param} />
        <div className="split" style={{ borderTop: "none", paddingTop: 0 }}>
          <div className="field">
            <label className="label" htmlFor="de">
              De
            </label>
            <input id="de" name="de" type="date" className="input" defaultValue={from} max={today} />
          </div>
          <div className="field">
            <label className="label" htmlFor="ate">
              Até
            </label>
            <input id="ate" name="ate" type="date" className="input" defaultValue={to} max={today} />
          </div>
        </div>
        <button type="submit" className="btn btn-sm" style={{ alignSelf: "flex-start" }}>
          Ver período
        </button>
      </form>
      <StoreFilter
        stores={ctx.activeStores}
        current={store.param}
        hrefFor={(loja) => `/relatorios/correcoes?loja=${loja}&de=${from}&ate=${to}`}
      />
      <p className="p muted" style={{ marginTop: -8 }}>
        {entries.length} {entries.length === 1 ? "correção" : "correções"} de {shortDay(from)} a {shortDay(to)}.
      </p>
      <div className="sheet">
        {entries.length === 0 ? <Empty>Sem correções neste período.</Empty> : null}
        {entries.map((entry) => {
          const content = (
            <span className="row-main">
              <span className="row-title" style={{ fontSize: 15 }}>
                {entry.label}
              </span>
              <span className="row-sub">
                {entry.orderNumber ? `${entry.orderNumber}, ` : ""}
                {entry.atMs ? `${shortDayFromMs(entry.atMs, ctx.tz)} às ${timeFromMs(entry.atMs, ctx.tz)}, ` : ""}
                {entry.byName}
                {store.storeId === null && entry.storeId ? `, ${storeName(ctx, entry.storeId)}` : ""}
              </span>
              {entry.reason ? <span className="row-sub">Motivo: {entry.reason}</span> : null}
            </span>
          );
          return entry.orderId ? (
            <Link key={entry.id} href={`/encomendas/${entry.orderId}`} className="row">
              {content}
            </Link>
          ) : (
            <div key={entry.id} className="row">
              {content}
            </div>
          );
        })}
      </div>
    </main>
  );
}
