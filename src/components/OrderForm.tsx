"use client";

import { useRef, useState } from "react";
import { formatCents, formatMT, parseMoney } from "@/lib/money";
import { formatPhone, normalizePhone } from "@/lib/phone";
import type { ActionState, Store } from "@/lib/types";
import Icon from "./Icon";
import { FormAlert, PendingProvider, SubmitButton, useSubmitAction } from "./forms";
import { Avatar } from "./ui";

export interface FormCustomer {
  id: string;
  name: string;
  phone: string;
}

interface LineState {
  key: string;
  lineId?: string;
  name: string;
  qty: number;
  price: string;
}

export interface OrderFormInitial {
  orderId: string;
  customerName: string;
  customerPhone: string;
  notes: string;
  totalCents: number;
  paidCents: number;
  lines: { lineId: string; name: string; qty: number; price: string }[];
}

let counter = 0;
const nextKey = () => `l${Date.now().toString(36)}${(counter++).toString(36)}`;
const emptyLine = (): LineState => ({ key: nextKey(), name: "", qty: 1, price: "" });

export default function OrderForm({
  action,
  formKey,
  stores,
  defaultStoreId,
  customers,
  initial,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  formKey: string;
  stores: Store[];
  defaultStoreId: string;
  customers: FormCustomer[];
  initial?: OrderFormInitial;
}) {
  const editing = Boolean(initial);
  const confirmRef = useRef<HTMLInputElement>(null);

  const [storeId, setStoreId] = useState(defaultStoreId);
  const [phone, setPhone] = useState(initial ? formatPhone(initial.customerPhone) : "");
  const [name, setName] = useState(initial?.customerName ?? "");
  const [customerId, setCustomerId] = useState("");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [lines, setLines] = useState<LineState[]>(
    initial ? initial.lines.map((l) => ({ key: nextKey(), lineId: l.lineId, name: l.name, qty: l.qty, price: l.price })) : [emptyLine()],
  );

  const phoneDigits = normalizePhone(phone);
  const match = !editing && phoneDigits.length >= 9 ? customers.find((c) => c.phone === phoneDigits) : undefined;
  const total = lines.reduce((s, l) => s + (parseMoney(l.price) ?? 0) * l.qty, 0);
  const complete = lines.length > 0 && lines.every((l) => l.name.trim() && l.price.trim() && parseMoney(l.price) !== null);

  function update(key: string, patch: Partial<LineState>) {
    setLines((current) => current.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  const { state, pending, onSubmit } = useSubmitAction(action, () => {
    if (initial && total !== initial.totalCents && confirmRef.current) {
      const ok = window.confirm(
        `O valor acordado passa de ${formatMT(initial.totalCents)} para ${formatMT(total)}. Os pagamentos já registados mantêm-se. Confirmar?`,
      );
      if (!ok) return false;
      confirmRef.current.value = "1";
    }
    return true;
  });

  const payload = JSON.stringify(
    lines.map((l) => ({ ...(l.lineId ? { lineId: l.lineId } : {}), name: l.name, qty: l.qty, price: l.price || "0" })),
  );

  return (
    <form onSubmit={onSubmit} className="stack-md" style={{ gap: 20 }}>
      <PendingProvider pending={pending}>
        <input type="hidden" name="key" value={formKey} />
        <input type="hidden" name="lines" value={payload} />
        <input type="hidden" name="customerId" value={match && customerId === match.id ? customerId : ""} />
        {initial ? <input type="hidden" name="orderId" value={initial.orderId} /> : <input type="hidden" name="storeId" value={storeId} />}
        <input ref={confirmRef} type="hidden" name="confirm" defaultValue="0" />

        <FormAlert state={state} />

        <section className="section" aria-labelledby="cliente">
          <h2 id="cliente" className="h2">
            Cliente
          </h2>
          <div className="card stack-md" style={{ padding: 16, boxShadow: "none", gap: 14 }}>
            {!editing && stores.length > 1 ? (
              <div className="field">
                <label className="label" htmlFor="store">
                  Loja
                </label>
                <select id="store" className="select" value={storeId} onChange={(e) => setStoreId(e.target.value)}>
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.prefix})
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className="field">
              <label className="label" htmlFor="customerPhone">
                Telefone
              </label>
              <input
                id="customerPhone"
                name="customerPhone"
                type="tel"
                inputMode="tel"
                autoComplete="off"
                className="input tnum"
                placeholder="Ex.: 84 123 4567"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  setCustomerId("");
                }}
              />
            </div>
            {match ? (
              <div className="suggestion">
                <Avatar name={match.name} solid />
                <span className="row-main">
                  <span className="strong" style={{ fontSize: 15 }}>
                    {match.name}
                  </span>
                  <span className="tiny muted">Cliente registada</span>
                </span>
                <button
                  type="button"
                  className={`chip${customerId === match.id ? " on" : " outline"}`}
                  style={{ minHeight: 40, padding: "0 12px", fontSize: 13 }}
                  aria-pressed={customerId === match.id}
                  onClick={() => {
                    setCustomerId(match.id);
                    setName(match.name);
                  }}
                >
                  {customerId === match.id ? (
                    <>
                      <Icon name="check" size={14} stroke={3} />
                      Escolhida
                    </>
                  ) : (
                    "Usar"
                  )}
                </button>
              </div>
            ) : null}
            <div className="field">
              <label className="label" htmlFor="customerName">
                Nome
              </label>
              <input
                id="customerName"
                name="customerName"
                className="input"
                required
                maxLength={120}
                autoComplete="off"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          </div>
        </section>

        <section className="section" aria-labelledby="artigos">
          <div>
            <h2 id="artigos" className="h2">
              Artigos
            </h2>
            <p className="hint" style={{ marginTop: 2 }}>
              Escreva o artigo como quer que apareça no comprovativo.
            </p>
          </div>
          <div className="sheet">
            {lines.map((line, index) => (
              <div key={line.key} className="line-card">
                <div className="between center" style={{ gap: 8 }}>
                  <label className="visually-hidden" htmlFor={`artigo-${line.key}`}>
                    Artigo {index + 1}
                  </label>
                  <input
                    id={`artigo-${line.key}`}
                    className="input"
                    style={{ flex: 1, minWidth: 0, fontWeight: 600 }}
                    placeholder="Ex.: Botas de cano alto, castanhas, nº 37"
                    maxLength={160}
                    autoComplete="off"
                    value={line.name}
                    onChange={(e) => update(line.key, { name: e.target.value })}
                  />
                  <button
                    type="button"
                    className="icon-btn ghost"
                    style={{ color: "var(--fraco)" }}
                    aria-label={`Remover artigo ${index + 1}`}
                    onClick={() => setLines((current) => current.filter((l) => l.key !== line.key))}
                    disabled={lines.length === 1}
                  >
                    <Icon name="close" size={18} stroke={2} />
                  </button>
                </div>
                <div className="between center">
                  <div className="stepper" role="group" aria-label={`Quantidade do artigo ${index + 1}`}>
                    <button type="button" aria-label="Menos um" onClick={() => update(line.key, { qty: Math.max(1, line.qty - 1) })}>
                      −
                    </button>
                    <output aria-live="polite">{line.qty}</output>
                    <button type="button" aria-label="Mais um" onClick={() => update(line.key, { qty: Math.min(10000, line.qty + 1) })}>
                      +
                    </button>
                  </div>
                  <label className="inline small muted" style={{ flexWrap: "nowrap", fontWeight: 600 }}>
                    Preço
                    <input
                      className="input money"
                      style={{ width: 124, minHeight: 44 }}
                      inputMode="decimal"
                      placeholder="0,00"
                      value={line.price}
                      onChange={(e) => update(line.key, { price: e.target.value })}
                      aria-label={`Preço unitário do artigo ${index + 1}`}
                    />
                  </label>
                </div>
              </div>
            ))}
            <button type="button" className="btn btn-text" onClick={() => setLines((current) => [...current, emptyLine()])}>
              <Icon name="plus" size={18} stroke={2.4} />
              Adicionar artigo
            </button>
          </div>
        </section>

        <div className="field">
          <label className="label" htmlFor="notes">
            Notas (opcional)
          </label>
          <textarea
            id="notes"
            name="notes"
            className="textarea"
            maxLength={1000}
            placeholder="Ex.: prefere levantar ao sábado"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <div className="bottom-bar">
          <div className="bottom-bar-inner">
            <div className="between">
              <span className="label" style={{ fontSize: 15 }}>
                Total
              </span>
              <span className="bar-total">
                {formatCents(total)} <span className="unit">MT</span>
              </span>
            </div>
            {initial && initial.paidCents > 0 ? (
              <p className="hint">Já pago: {formatMT(initial.paidCents)}. O total não pode ficar abaixo deste valor.</p>
            ) : !editing ? (
              <p className="hint">A encomenda fica a aguardar mercadoria até marcar a chegada.</p>
            ) : null}
            {state.error ? (
              <p className="hint strong due-text" role="alert">
                {state.error}
              </p>
            ) : null}
            <SubmitButton disabled={!complete}>{editing ? "Guardar alterações" : "Gravar encomenda"}</SubmitButton>
          </div>
        </div>
      </PendingProvider>
    </form>
  );
}
