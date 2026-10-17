"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { centsToInput, formatCents, formatMT, parseMoney } from "@/lib/money";
import { formatPhone, normalizePhone } from "@/lib/phone";
import type { ActionState, Store } from "@/lib/types";
import type { FormItem } from "@/lib/form-items";
import Icon from "./Icon";
import { FormAlert, PendingProvider, SubmitButton, useSubmitAction } from "./forms";
import { initials } from "./ui";


export interface FormCustomer {
  id: string;
  name: string;
  phone: string;
}

interface LineState {
  key: string;
  lineId?: string;
  itemId: string;
  qty: number;
  price: string;
  reserved: number;
}

export interface OrderFormInitial {
  orderId: string;
  storeId: string;
  customerName: string;
  customerPhone: string;
  expectedDate: string;
  discount: string;
  notes: string;
  totalCents: number;
  paidCents: number;
  lines: { lineId: string; itemId: string; qty: number; price: string; reserved: number }[];
}

let counter = 0;
const nextKey = () => `l${Date.now().toString(36)}${(counter++).toString(36)}`;

export default function OrderForm({
  action,
  formKey,
  stores,
  defaultStoreId,
  items,
  customers,
  initial,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  formKey: string;
  stores: Store[];
  defaultStoreId: string;
  items: FormItem[];
  customers: FormCustomer[];
  initial?: OrderFormInitial;
}) {
  const editing = Boolean(initial);
  const confirmRef = useRef<HTMLInputElement>(null);

  const [storeId, setStoreId] = useState(initial?.storeId ?? defaultStoreId);
  const [phone, setPhone] = useState(initial ? formatPhone(initial.customerPhone) : "");
  const [name, setName] = useState(initial?.customerName ?? "");
  const [customerId, setCustomerId] = useState("");
  const [discount, setDiscount] = useState(initial?.discount ?? "0,00");
  const [expectedDate, setExpectedDate] = useState(initial?.expectedDate ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [lines, setLines] = useState<LineState[]>(
    initial
      ? initial.lines.map((l) => ({ key: nextKey(), lineId: l.lineId, itemId: l.itemId, qty: l.qty, price: l.price, reserved: l.reserved }))
      : [{ key: nextKey(), itemId: "", qty: 1, price: "", reserved: 0 }],
  );

  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const selectable = items.filter((i) => !i.archived);
  const phoneDigits = normalizePhone(phone);
  const match = !editing && phoneDigits.length >= 9 ? customers.find((c) => c.phone === phoneDigits) : undefined;

  const subtotal = lines.reduce((s, l) => s + (parseMoney(l.price) ?? 0) * l.qty, 0);
  const discountCents = parseMoney(discount) ?? 0;
  const total = Math.max(0, subtotal - discountCents);

  // Estimativa no telemóvel; a reserva real é feita no servidor.
  const hints = useMemo(() => {
    const used = new Map<string, number>();
    return lines.map((line) => {
      const item = itemsById.get(line.itemId);
      if (!item) return null;
      const need = Math.max(0, line.qty - line.reserved);
      if (need === 0) return { ready: true, text: "Reservado na loja" };
      const free = (item.available[storeId] ?? 0) - (used.get(item.id) ?? 0);
      const take = Math.max(0, Math.min(need, free));
      used.set(item.id, (used.get(item.id) ?? 0) + take);
      if (take >= need) return { ready: true, text: line.reserved > 0 ? "Em stock: fica tudo reservado" : "Em stock: fica reservado" };
      if (take + line.reserved > 0) return { ready: false, text: `Só ${take + line.reserved} de ${line.qty} em stock: o resto fica a aguardar` };
      return { ready: false, text: "Sem stock: fica a aguardar mercadoria" };
    });
  }, [lines, itemsById, storeId]);

  const waitingCount = hints.filter((h) => h && !h.ready).length;
  const filledLines = lines.filter((l) => l.itemId);

  function update(key: string, patch: Partial<LineState>) {
    setLines((current) => current.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function chooseItem(key: string, itemId: string) {
    const item = itemsById.get(itemId);
    setLines((current) =>
      current.map((l) => (l.key === key ? { ...l, itemId, lineId: l.itemId === itemId ? l.lineId : l.lineId, price: item ? centsToInput(item.priceCents) : l.price } : l)),
    );
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
    filledLines.map((l) => ({ ...(l.lineId ? { lineId: l.lineId } : {}), itemId: l.itemId, qty: l.qty, price: l.price || "0" })),
  );

  return (
    <form onSubmit={onSubmit} className="stack-md" style={{ gap: 18 }}>
      <PendingProvider pending={pending}>
      <input type="hidden" name="key" value={formKey} />
      <input type="hidden" name="lines" value={payload} />
      <input type="hidden" name="customerId" value={match && customerId === match.id ? customerId : ""} />
      {initial ? <input type="hidden" name="orderId" value={initial.orderId} /> : <input type="hidden" name="storeId" value={storeId} />}
      <input ref={confirmRef} type="hidden" name="confirm" defaultValue="0" />

      <FormAlert state={state} />

      {!editing ? (
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
          Telefone do cliente
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
        {match ? (
          <div className="suggestion">
            <span className="avatar" aria-hidden="true">
              {initials(match.name)}
            </span>
            <span className="row-main">
              <span className="strong" style={{ fontSize: 15 }}>
                {match.name}
              </span>
              <span className="row-sub">Cliente registado</span>
            </span>
            <button
              type="button"
              className={`chip${customerId === match.id ? " on" : ""}`}
              aria-pressed={customerId === match.id}
              onClick={() => {
                setCustomerId(match.id);
                setName(match.name);
              }}
            >
              {customerId === match.id ? (
                <>
                  <Icon name="check" size={14} stroke={2.8} />
                  Escolhido
                </>
              ) : (
                "Usar"
              )}
            </button>
          </div>
        ) : null}
      </div>

      <div className="field">
        <label className="label" htmlFor="customerName">
          Nome do cliente
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

      <div className="field">
        <p className="label">Artigos</p>
        {selectable.length === 0 && !editing ? (
          <p className="alert alert-info">
            Ainda não há artigos. <Link href="/stock/artigos/novo">Crie o primeiro artigo</Link> e volte a esta encomenda.
          </p>
        ) : null}
        <div className="sheet">
          {lines.map((line, index) => {
            const hint = hints[index];
            const item = itemsById.get(line.itemId);
            return (
              <div key={line.key} className="line-card">
                <div className="between center">
                  <label className="visually-hidden" htmlFor={`item-${line.key}`}>
                    Artigo {index + 1}
                  </label>
                  <select
                    id={`item-${line.key}`}
                    className="select"
                    value={line.itemId}
                    onChange={(e) => chooseItem(line.key, e.target.value)}
                    style={{ flex: 1 }}
                  >
                    <option value="">Escolher artigo…</option>
                    {item && item.archived ? <option value={item.id}>{item.name} (arquivado)</option> : null}
                    {selectable.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="icon-btn ghost"
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
                  <label className="inline small muted" style={{ flexWrap: "nowrap" }}>
                    Preço
                    <input
                      className="input money"
                      style={{ width: 120, minHeight: 44 }}
                      inputMode="decimal"
                      value={line.price}
                      onChange={(e) => update(line.key, { price: e.target.value })}
                      aria-label={`Preço unitário do artigo ${index + 1}`}
                    />
                  </label>
                </div>
                {hint ? (
                  <span className={`status-line ${hint.ready ? "ready" : "wait"}`}>
                    <Icon name={hint.ready ? "check" : "clock"} size={14} stroke={2.2} />
                    {hint.text}
                  </span>
                ) : null}
              </div>
            );
          })}
          <button
            type="button"
            className="btn btn-text"
            onClick={() => setLines((current) => [...current, { key: nextKey(), itemId: "", qty: 1, price: "", reserved: 0 }])}
          >
            <Icon name="plus" size={18} stroke={2.2} />
            Adicionar artigo
          </button>
        </div>
      </div>

      <div className="split" style={{ borderTop: "none", paddingTop: 0 }}>
        <div className="field">
          <label className="label" htmlFor="discount">
            Desconto (MT)
          </label>
          <input
            id="discount"
            name="discount"
            className="input money"
            inputMode="decimal"
            value={discount}
            onChange={(e) => setDiscount(e.target.value)}
          />
        </div>
        <div className="field">
          <label className="label" htmlFor="expectedDate">
            Chegada prevista
          </label>
          <input
            id="expectedDate"
            name="expectedDate"
            type="date"
            className="input"
            value={expectedDate}
            onChange={(e) => setExpectedDate(e.target.value)}
          />
        </div>
      </div>

      <div className="field">
        <label className="label" htmlFor="notes">
          Notas (opcional)
        </label>
        <textarea id="notes" name="notes" className="textarea" maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <div className="bottom-bar">
        <div className="bottom-bar-inner">
          <div className="between">
            <span className="label">Total</span>
            <span className="money-big" style={{ fontSize: 26, lineHeight: "32px" }}>
              {formatCents(total)} <span className="unit">MT</span>
            </span>
          </div>
          {initial && initial.paidCents > 0 ? (
            <p className="hint">Já pago: {formatMT(initial.paidCents)}. O total não pode ficar abaixo deste valor.</p>
          ) : null}
          {filledLines.length > 0 && waitingCount > 0 ? (
            <p className="hint" style={{ color: "var(--aguardar)" }}>
              {filledLines.length - waitingCount} de {filledLines.length} artigos em stock: a encomenda fica a aguardar mercadoria.
            </p>
          ) : null}
          {state.error ? (
            <p className="hint due-text" role="alert">
              {state.error}
            </p>
          ) : null}
          <SubmitButton disabled={filledLines.length === 0 || filledLines.length !== lines.length}>
            {editing ? "Guardar alterações" : "Gravar encomenda"}
          </SubmitButton>
        </div>
      </div>
      </PendingProvider>
    </form>
  );
}
