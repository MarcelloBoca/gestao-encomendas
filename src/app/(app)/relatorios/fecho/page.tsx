import type { Metadata } from "next";
import Link from "next/link";
import { getContext } from "@/lib/session";
import { auditSince, paymentsBetween, refundsBetween } from "@/lib/server/data";
import { inStore, reportStore, type SearchParams } from "@/lib/server/report-params";
import { addDays, isValidIsoDay, longDay, startOfDayMs, todayIso } from "@/lib/dates";
import { formatCents, formatMT } from "@/lib/money";
import { PAYMENT_METHODS } from "@/lib/types";
import Icon from "@/components/Icon";
import StoreFilter from "@/components/StoreFilter";
import { BackLink, Empty } from "@/components/ui";

export const metadata: Metadata = { title: "Fecho de caixa" };

export default async function CashClosePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await getContext();
  const params = await searchParams;
  const today = todayIso(ctx.tz);
  const day = typeof params.dia === "string" && isValidIsoDay(params.dia) && params.dia <= today ? params.dia : today;
  const store = reportStore(ctx, params);

  const dayStart = startOfDayMs(day, ctx.tz);
  const nextStart = startOfDayMs(addDays(day, 1), ctx.tz);
  const [payments, refunds, audit] = await Promise.all([
    paymentsBetween(ctx.businessId, day, day),
    refundsBetween(ctx.businessId, day, day),
    auditSince(ctx.businessId, dayStart),
  ]);

  const valid = payments.filter((p) => p.status === "valid" && inStore(store.storeId, p.storeId));
  const dayRefunds = refunds.filter((r) => inStore(store.storeId, r.storeId));
  const gross = valid.reduce((s, p) => s + p.amountCents, 0);
  const refunded = dayRefunds.reduce((s, r) => s + r.amountCents, 0);
  const corrections = audit.filter((a) => a.kind === "correcao" && a.atMs < nextStart && inStore(store.storeId, a.storeId));

  const byMethod = PAYMENT_METHODS.map((m) => {
    const list = valid.filter((p) => p.method === m.id);
    return { ...m, count: list.length, cents: list.reduce((s, p) => s + p.amountCents, 0) };
  }).filter((m) => m.count > 0);
  const maxMethod = Math.max(1, ...byMethod.map((m) => m.cents));
  const cashIn = valid.filter((p) => p.method === "numerario").reduce((s, p) => s + p.amountCents, 0);
  const cashOut = dayRefunds.filter((r) => r.method === "numerario").reduce((s, r) => s + r.amountCents, 0);
  const cashRefundCount = dayRefunds.filter((r) => r.method === "numerario").length;

  const users = new Map<string, { name: string; count: number; cents: number }>();
  for (const p of valid) {
    const entry = users.get(p.byUid) ?? { name: p.byName, count: 0, cents: 0 };
    entry.count += 1;
    entry.cents += p.amountCents;
    users.set(p.byUid, entry);
  }
  const byUser = [...users.values()].sort((a, b) => b.cents - a.cents);
  const href = (loja: string) => `/relatorios/fecho?dia=${day}&loja=${loja}`;

  return (
    <main className="screen">
      <BackLink href="/relatorios" label="Relatórios" />
      <h1 className="h1" style={{ marginTop: -8 }}>
        Fecho de caixa
      </h1>
      <form action="/relatorios/fecho" method="get" className="inline">
        <input type="hidden" name="loja" value={store.param} />
        <label className="visually-hidden" htmlFor="dia">
          Dia
        </label>
        <input id="dia" name="dia" type="date" className="input" defaultValue={day} max={today} style={{ width: "auto", flex: 1 }} />
        <button type="submit" className="btn btn-sm">
          Ver
        </button>
      </form>
      <StoreFilter stores={ctx.activeStores} current={store.param} hrefFor={href} />
      <p className="p muted" style={{ marginTop: -8 }}>
        {longDay(day)}, {store.label}
      </p>

      <section className="sheet pad" aria-label="Total do dia">
        <div>
          <p className="label">Líquido do dia</p>
          <p className="money-big">
            {formatCents(gross - refunded)} <span className="unit">MT</span>
          </p>
        </div>
        <div className="split tnum">
          <div className="stat">
            <span className="stat-label">Recebido</span>
            <span className="stat-value">{formatCents(gross)}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Reembolsos</span>
            <span className="stat-value">{refunded > 0 ? `−${formatCents(refunded)}` : "0,00"}</span>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="metodo">
        <h2 id="metodo" className="h2">
          Por método
        </h2>
        <div className="sheet tnum">
          {byMethod.length === 0 ? <Empty>Sem pagamentos neste dia.</Empty> : null}
          {byMethod.map((m) => (
            <div key={m.id} className="line-card">
              <div className="between">
                <span style={{ fontSize: 15, fontWeight: 600 }}>
                  {m.label}{" "}
                  <span className="small muted" style={{ fontWeight: 400 }}>
                    {m.count} {m.count === 1 ? "pagamento" : "pagamentos"}
                  </span>
                </span>
                <span className="strong">{formatCents(m.cents)}</span>
              </div>
              <div className="bar-track" aria-hidden="true">
                <div className="bar-fill" style={{ width: `${Math.max(2, Math.round((m.cents / maxMethod) * 100))}%` }} />
              </div>
            </div>
          ))}
          <div className="row" style={{ background: "var(--cinza-claro)" }}>
            <span className="row-main">
              <span className="row-title">Dinheiro na gaveta</span>
              <span className="row-sub">
                Numerário{cashRefundCount ? ` menos ${cashRefundCount} ${cashRefundCount === 1 ? "reembolso" : "reembolsos"}` : ""}
              </span>
            </span>
            <span className="strong" style={{ fontSize: 16 }}>
              {formatMT(cashIn - cashOut)}
            </span>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="utilizador">
        <h2 id="utilizador" className="h2">
          Por utilizador
        </h2>
        <div className="sheet tnum">
          {byUser.length === 0 ? <Empty>Sem pagamentos neste dia.</Empty> : null}
          {byUser.map((u) => (
            <div key={u.name} className="row">
              <span className="row-main">
                <span className="row-title" style={{ fontSize: 15 }}>
                  {u.name}
                </span>
                <span className="row-sub">
                  {u.count} {u.count === 1 ? "pagamento" : "pagamentos"}
                </span>
              </span>
              <span className="strong">{formatCents(u.cents)}</span>
            </div>
          ))}
        </div>
      </section>

      <Link href={`/relatorios/correcoes?loja=${store.param}&de=${day}&ate=${day}`} className="sheet row" style={{ borderRadius: 20 }}>
        <span className="badge-icon tone-owed" aria-hidden="true">
          <Icon name="undo" />
        </span>
        <span className="row-main">
          <span className="row-title">
            {corrections.length === 0 ? "Sem correções neste dia" : `${corrections.length} ${corrections.length === 1 ? "correção" : "correções"} neste dia`}
          </span>
          <span className="row-sub">Estornos, reembolsos, ajustes e cancelamentos, com motivo</span>
        </span>
        <Icon name="chevron" size={18} />
      </Link>
    </main>
  );
}
