import { shortDay } from "@/lib/dates";
import { balanceOf } from "@/lib/domain";
import { formatCents } from "@/lib/money";
import type { Order, Payment } from "@/lib/types";

/** Barra com uma secção por parcela paga e a parte em falta tracejada. */
export default function PaymentBar({ order, payments }: { order: Order; payments: Payment[] }) {
  if (order.totalCents <= 0) return null;
  const valid = payments.filter((p) => p.status === "valid").sort((a, b) => a.date.localeCompare(b.date) || a.createdAtMs - b.createdAtMs);
  const sumValid = valid.reduce((s, p) => s + p.amountCents, 0);
  const balance = balanceOf(order.totalCents, order.paidCents);

  const segments: { key: string; cents: number; label: string }[] =
    sumValid === order.paidCents
      ? valid.map((p) => ({ key: p.id, cents: p.amountCents, label: shortDay(p.date) }))
      : order.paidCents > 0
        ? [{ key: "pago", cents: order.paidCents, label: "pago" }]
        : [];

  const showLegend = segments.length <= 3;

  return (
    <div className="stack-md" style={{ gap: 8 }}>
      <div className="paybar" aria-hidden="true">
        {segments.map((s) => (
          <span key={s.key} style={{ flex: `${s.cents} 1 0` }} />
        ))}
        {balance > 0 ? <span className="owed" style={{ flex: `${balance} 1 0` }} /> : null}
      </div>
      {showLegend ? (
        <div className="paylegend">
          {segments.map((s) => (
            <span key={s.key} style={{ flex: `${s.cents} 1 0` }}>
              <span className="amount">{formatCents(s.cents)}</span>
              <span>{s.label}</span>
            </span>
          ))}
          {balance > 0 ? (
            <span style={{ flex: `${balance} 1 0`, alignItems: "flex-end" }}>
              <span className="amount owed-text">{formatCents(balance)}</span>
              <span>em falta</span>
            </span>
          ) : null}
        </div>
      ) : (
        <p className="hint">
          {segments.length} parcelas pagas{balance > 0 ? `, faltam ${formatCents(balance)}` : ""}
        </p>
      )}
    </div>
  );
}
