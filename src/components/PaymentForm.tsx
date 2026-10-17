"use client";

import { useState } from "react";
import { centsToInput, formatMT, parseMoney } from "@/lib/money";
import { PAYMENT_METHODS, type ActionState, type PaymentMethod } from "@/lib/types";
import Icon from "./Icon";
import { FormAlert, PendingProvider, SubmitButton, useSubmitAction } from "./forms";

export default function PaymentForm({
  action,
  formKey,
  orderId,
  balanceCents,
  today,
  mode,
  maxCents,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  formKey: string;
  orderId: string;
  balanceCents: number;
  today: string;
  mode: "payment" | "refund";
  maxCents: number;
}) {
  const { state, pending, onSubmit } = useSubmitAction(action);
  const [amount, setAmount] = useState(centsToInput(maxCents));
  const [method, setMethod] = useState<PaymentMethod>("numerario");
  const cents = parseMoney(amount);
  const isAll = cents === maxCents;
  const tooMuch = cents !== null && cents > maxCents;
  const afterBalance = cents !== null ? Math.max(0, balanceCents - cents) : balanceCents;
  const isPayment = mode === "payment";

  return (
    <form onSubmit={onSubmit} className="stack-md" style={{ gap: 16 }}>
      <PendingProvider pending={pending}>
      <input type="hidden" name="key" value={formKey} />
      <input type="hidden" name="orderId" value={orderId} />
      <FormAlert state={state} />

      <div className="stack" style={{ alignItems: "center", gap: 6 }}>
        <label className="label" htmlFor="amount">
          Valor
        </label>
        <div className="big-amount">
          <input
            id="amount"
            name="amount"
            inputMode="decimal"
            autoComplete="off"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-describedby="amount-help"
          />
          <span>MT</span>
        </div>
        <div className="inline" style={{ justifyContent: "center", marginTop: 4 }}>
          <button type="button" className={`chip${isAll ? " soft-on" : ""}`} aria-pressed={isAll} onClick={() => setAmount(centsToInput(maxCents))}>
            {isPayment ? "Tudo o que falta" : "Tudo o que foi pago"}
          </button>
        </div>
        <p id="amount-help" className={`hint${tooMuch ? " due-text" : ""}`}>
          {tooMuch ? `O máximo é ${formatMT(maxCents)}.` : isPayment ? `Em falta: ${formatMT(balanceCents)}` : `Pago até agora: ${formatMT(maxCents)}`}
        </p>
      </div>

      <fieldset style={{ border: "none", margin: 0, padding: 0 }}>
        <legend className="label" style={{ marginBottom: 8 }}>
          Método
        </legend>
        <div className="option-grid">
          {PAYMENT_METHODS.map((m) => (
            <label key={m.id} className="option">
              <input type="radio" name="method" value={m.id} checked={method === m.id} onChange={() => setMethod(m.id)} />
              <span>{m.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {isPayment ? (
        <div className="field">
          <label className="label" htmlFor="reference">
            Referência da transação
          </label>
          <input id="reference" name="reference" className="input" maxLength={80} placeholder="Ex.: 9KT2XQ81" autoComplete="off" />
          <p className="hint">
            {method === "numerario" ? "Opcional para numerário." : "Recomendado para M-Pesa, e-Mola, mKesh e transferências."}
          </p>
        </div>
      ) : null}

      <div className="group">
        <label className="group-row">
          <span className="muted">Data</span>
          <input type="date" name="date" defaultValue={today} max={today} required />
        </label>
        {isPayment ? (
          <label className="group-row">
            <span className="muted">Nota</span>
            <input type="text" name="note" placeholder="Opcional" maxLength={300} />
          </label>
        ) : (
          <label className="group-row">
            <span className="muted">Motivo</span>
            <input type="text" name="reason" placeholder="Obrigatório" maxLength={500} required />
          </label>
        )}
      </div>

      {isPayment && cents !== null && cents > 0 && !tooMuch ? (
        afterBalance === 0 ? (
          <p className="alert alert-ok">
            <Icon name="check" size={18} stroke={2.4} />
            A encomenda fica paga.
          </p>
        ) : (
          <p className="alert alert-warn">Depois deste pagamento ficam a faltar {formatMT(afterBalance)}.</p>
        )
      ) : null}

      <SubmitButton disabled={cents === null || cents <= 0 || tooMuch}>
        {cents && cents > 0 && !tooMuch ? `${isPayment ? "Registar" : "Reembolsar"} ${formatMT(cents)}` : isPayment ? "Registar pagamento" : "Registar reembolso"}
      </SubmitButton>
      </PendingProvider>
    </form>
  );
}
