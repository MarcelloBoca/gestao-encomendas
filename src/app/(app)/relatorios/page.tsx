import type { Metadata } from "next";
import Link from "next/link";
import { getContext } from "@/lib/session";
import { ordersCollectedBetween, ordersCreatedSince, paymentsBetween, refundsBetween } from "@/lib/server/data";
import { inStore, reportStore, type SearchParams } from "@/lib/server/report-params";
import { shortDay, startOfDayMs, todayIso } from "@/lib/dates";
import { formatShort } from "@/lib/money";
import { PERIODS, percentages, periodById, periodRange, receivedBuckets } from "@/lib/report-series";
import type { PaymentMethod } from "@/lib/types";
import Icon from "@/components/Icon";
import ReceivedChart from "@/components/ReceivedChart";

export const metadata: Metadata = { title: "Relatórios" };

// Cores fixas por método (validadas para o fundo escuro). Os restantes métodos juntam-se em "Outros".
const METHOD_SLOTS: { id: string; label: string; color: string; methods: PaymentMethod[] }[] = [
  { id: "numerario", label: "Numerário", color: "#D55181", methods: ["numerario"] },
  { id: "mpesa", label: "M-Pesa", color: "#3987E5", methods: ["mpesa"] },
  { id: "emola", label: "e-Mola", color: "#C98500", methods: ["emola"] },
  { id: "outros", label: "Outros", color: "#A897A1", methods: ["mkesh", "transferencia", "outro"] },
];

const DONUT_R = 36;
const DONUT_C = 2 * Math.PI * DONUT_R;

export default async function ReportsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await getContext();
  const params = await searchParams;
  const period = periodById(typeof params.p === "string" ? params.p : undefined);
  const store = reportStore(ctx, params);
  const today = todayIso(ctx.tz);
  const { from } = periodRange(period.id, today);

  const [created, payments, refunds, collected] = await Promise.all([
    ordersCreatedSince(ctx.businessId, startOfDayMs(from, ctx.tz)),
    paymentsBetween(ctx.businessId, from, today),
    refundsBetween(ctx.businessId, from, today),
    ordersCollectedBetween(ctx.businessId, from, today),
  ]);

  const valid = payments.filter((p) => p.status === "valid" && inStore(store.storeId, p.storeId));
  const storeRefunds = refunds.filter((r) => inStore(store.storeId, r.storeId));
  const buckets = receivedBuckets(period.id, today, [
    ...valid.map((p) => ({ date: p.date, cents: p.amountCents })),
    ...storeRefunds.map((r) => ({ date: r.date, cents: -r.amountCents })),
  ]);
  const received = buckets.reduce((s, b) => s + b.cents, 0);

  const slots = METHOD_SLOTS.map((slot) => ({
    ...slot,
    cents: valid.filter((p) => slot.methods.includes(p.method)).reduce((s, p) => s + p.amountCents, 0),
  }));
  const shares = percentages(slots.map((s) => s.cents));
  const usedSlots = slots.map((s, i) => ({ ...s, pct: shares[i] })).filter((s) => s.cents > 0);
  const methodTotal = usedSlots.reduce((s, x) => s + x.cents, 0);

  const createdHere = created.filter((o) => inStore(store.storeId, o.storeId) && o.fulfillment !== "cancelled").length;
  const collectedHere = collected.filter((o) => inStore(store.storeId, o.storeId)).length;

  const unit = period.id === "trimestre" ? "semana" : "dia";
  const best = buckets.reduce((a, b) => (b.cents > a.cents ? b : a), buckets[0]);
  const average = buckets.length ? received / buckets.length : 0;
  let highlight = "Ainda não há pagamentos neste período.";
  if (best && best.cents > 0) {
    const ratio = average > 0 ? best.cents / average : 0;
    const comparison = ratio >= 1.8 ? ", quase o dobro da média" : ratio >= 1.3 ? ", bem acima da média" : "";
    const name = period.id === "semana" ? best.longLabel : period.id === "mes" ? `O dia ${best.longLabel}` : `A ${best.longLabel}`;
    highlight = `${name} foi ${period.id === "trimestre" ? "a melhor semana" : "o melhor dia"}: ${formatShort(best.cents)} MT${comparison}.`;
  }

  const href = (p: string, loja: string) => `/relatorios?p=${p}&loja=${loja}`;
  const periodLabel = `de ${shortDay(from)} a ${shortDay(today)}`;

  let offset = 0;
  const gap = usedSlots.length > 1 ? 2 : 0;

  return (
    <main className="screen dark-page" style={{ gap: 16 }}>
      <div>
        <h1 className="h1">Relatórios</h1>
        <p className="sub">
          {store.label}, {periodLabel}
        </p>
      </div>

      <nav className="segmented" aria-label="Período">
        {PERIODS.map((x) => (
          <Link key={x.id} href={href(x.id, store.param)} aria-current={x.id === period.id ? "true" : undefined}>
            {x.label}
          </Link>
        ))}
      </nav>

      {ctx.activeStores.length > 1 ? (
        <nav className="chip-row dark-chips" aria-label="Loja">
          {ctx.activeStores.map((s) => (
            <Link key={s.id} href={href(period.id, s.id)} className="chip" aria-current={store.param === s.id ? "true" : undefined}>
              {s.name}
            </Link>
          ))}
          <Link href={href(period.id, "todas")} className="chip" aria-current={store.param === "todas" ? "true" : undefined}>
            Todas as lojas
          </Link>
        </nav>
      ) : null}

      <section className="dark-card" aria-labelledby="recebido">
        <div className="between" style={{ alignItems: "flex-start" }}>
          <span className="inline" style={{ gap: 10, flexWrap: "nowrap" }}>
            <span className="badge-icon" style={{ width: 36, height: 36, background: "var(--rosa)", color: "var(--ameixa)" }} aria-hidden="true">
              <Icon name="trend" size={18} stroke={2} />
            </span>
            <h2 id="recebido">Recebido por {unit}</h2>
          </span>
          <span className="stack" style={{ alignItems: "flex-end", gap: 0 }}>
            <span className="tiny dark-muted">Total</span>
            <span className="tnum nowrap" style={{ fontFamily: "var(--serif)", fontSize: 24, lineHeight: "28px" }}>
              {formatShort(received)} MT
            </span>
          </span>
        </div>
        <ReceivedChart buckets={buckets} unitLabel={unit} />
        <details>
          <summary className="tiny dark-muted" style={{ cursor: "pointer", minHeight: 32, display: "flex", alignItems: "center" }}>
            Ver em tabela
          </summary>
          <table className="tiny tnum" style={{ width: "100%", borderCollapse: "collapse", marginTop: 6 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", fontWeight: 700, padding: "4px 0" }}>{unit === "dia" ? "Dia" : "Semana"}</th>
                <th style={{ textAlign: "right", fontWeight: 700, padding: "4px 0" }}>Recebido (MT)</th>
              </tr>
            </thead>
            <tbody>
              {buckets.map((b) => (
                <tr key={b.from} style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                  <td style={{ padding: "4px 0" }}>{b.from === b.to ? shortDay(b.from) : `${shortDay(b.from)} a ${shortDay(b.to)}`}</td>
                  <td style={{ padding: "4px 0", textAlign: "right" }}>{formatShort(b.cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </section>

      <div className="dark-grid">
        <section className="dark-card sm" aria-labelledby="metodo">
          <h2 id="metodo">Por método</h2>
          {usedSlots.length === 0 ? (
            <p className="tiny dark-muted" style={{ margin: 0 }}>
              Sem pagamentos neste período.
            </p>
          ) : (
            <>
              <svg
                width="96"
                height="96"
                viewBox="0 0 96 96"
                role="img"
                aria-label={usedSlots.map((s) => `${s.label} ${s.pct}%`).join(", ")}
                style={{ alignSelf: "center" }}
              >
                {usedSlots.map((s) => {
                  const length = (s.cents / methodTotal) * DONUT_C;
                  const visible = Math.max(0.5, length - gap);
                  const circle = (
                    <circle
                      key={s.id}
                      cx="48"
                      cy="48"
                      r={DONUT_R}
                      fill="none"
                      stroke={s.color}
                      strokeWidth="14"
                      strokeDasharray={`${visible.toFixed(2)} ${DONUT_C.toFixed(2)}`}
                      strokeDashoffset={(-offset).toFixed(2)}
                      transform="rotate(-90 48 48)"
                    >
                      <title>{`${s.label}: ${formatShort(s.cents)} MT (${s.pct}%)`}</title>
                    </circle>
                  );
                  offset += length;
                  return circle;
                })}
                <text x="48" y="50" textAnchor="middle" fontSize="18" fontWeight="800" fill="#FFFFFF">
                  {usedSlots.length}
                </text>
                <text x="48" y="63" textAnchor="middle" fontSize="10" fontWeight="600" fill="#FFFFFF" fillOpacity="0.72">
                  {usedSlots.length === 1 ? "método" : "métodos"}
                </text>
              </svg>
              <ul className="legend">
                {usedSlots.map((s) => (
                  <li key={s.id}>
                    <span className="dot" style={{ background: s.color }} aria-hidden="true" />
                    <span>{s.label}</span>
                    <span className="strong">{s.pct}%</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
        <div className="dark-stack">
          <section className="dark-card sm" aria-labelledby="destaque" style={{ flex: 1 }}>
            <span className="inline" style={{ gap: 8, flexWrap: "nowrap", color: "var(--rosa)" }}>
              <Icon name="bulb" size={20} />
              <h2 id="destaque" style={{ color: "#FFFFFF" }}>
                Destaque
              </h2>
            </span>
            <p className="small" style={{ margin: 0, lineHeight: "19px", color: "rgba(255,255,255,0.86)" }}>
              {highlight}
            </p>
          </section>
          <div className="dark-card sm" style={{ gap: 4 }}>
            <span className="tiny dark-muted">Encomendas novas</span>
            <span className="tnum" style={{ fontSize: 22, fontWeight: 800 }}>
              {createdHere}
            </span>
          </div>
          <div className="dark-card sm" style={{ gap: 4 }}>
            <span className="tiny dark-muted">Levantadas</span>
            <span className="tnum" style={{ fontSize: 22, fontWeight: 800 }}>
              {collectedHere}
            </span>
          </div>
        </div>
      </div>

      <Link href={`/relatorios/fecho?loja=${store.param}`} className="banner-rose">
        <span className="row-main">
          <span style={{ fontSize: 16, fontWeight: 800 }}>Fecho de caixa de hoje</span>
          <span className="small" style={{ color: "var(--ameixa-3)" }}>
            Recebido por método e por utilizador
          </span>
        </span>
        <span className="go" aria-hidden="true">
          <Icon name="chevron" size={18} stroke={2.4} />
        </span>
      </Link>

      <nav className="dark-list" aria-label="Outros relatórios">
        <Link href={`/relatorios/dividas?loja=${store.param}`}>
          Dívidas por antiguidade
          <span className="chev">
            <Icon name="chevron" size={18} stroke={2} />
          </span>
        </Link>
        <Link href={`/relatorios/prontas?loja=${store.param}`}>
          Prontas por levantar
          <span className="chev">
            <Icon name="chevron" size={18} stroke={2} />
          </span>
        </Link>
        <Link href={`/relatorios/correcoes?loja=${store.param}`}>
          Correções e estornos
          <span className="chev">
            <Icon name="chevron" size={18} stroke={2} />
          </span>
        </Link>
        <Link href="/encomendas?estado=todas">
          Todas as encomendas
          <span className="chev">
            <Icon name="chevron" size={18} stroke={2} />
          </span>
        </Link>
      </nav>
    </main>
  );
}
