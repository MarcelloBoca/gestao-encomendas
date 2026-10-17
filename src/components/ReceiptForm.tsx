"use client";

import Link from "next/link";
import { startTransition, useActionState, useState } from "react";
import { readyMessage, whatsappLink } from "@/lib/phone";
import type { ReceiptState, Store } from "@/lib/types";
import type { FormItem } from "@/lib/form-items";
import Icon from "./Icon";
import { FormAlert, PendingProvider, SubmitButton } from "./forms";
import { FinPill } from "./ui";

interface Line {
  key: string;
  itemId: string;
  qty: number;
}

let counter = 0;
const nextKey = () => `r${Date.now().toString(36)}${(counter++).toString(36)}`;

export default function ReceiptForm({
  action,
  formKey,
  stores,
  defaultStoreId,
  items,
  today,
  missing,
}: {
  action: (prev: ReceiptState, fd: FormData) => Promise<ReceiptState>;
  formKey: string;
  stores: Store[];
  defaultStoreId: string;
  items: FormItem[];
  today: string;
  missing: Record<string, Record<string, number>>;
}) {
  const [state, dispatch, pending] = useActionState(action, {} as ReceiptState);
  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    const formData = new FormData(event.currentTarget);
    startTransition(() => dispatch(formData));
  };
  const [storeId, setStoreId] = useState(defaultStoreId);
  const [lines, setLines] = useState<Line[]>([{ key: nextKey(), itemId: "", qty: 1 }]);
  const selectable = items.filter((i) => !i.archived);
  const filled = lines.filter((l) => l.itemId);
  const missingHere = missing[storeId] ?? {};

  if (state.ok) {
    const ready = state.ready ?? [];
    return (
      <div className="stack-md" style={{ gap: 20 }}>
        <div className="stack" style={{ gap: 6 }}>
          <span className="badge-icon big tone-ok" aria-hidden="true">
            <Icon name="check" size={24} stroke={2.6} />
          </span>
          <h1 className="h1 sm" style={{ marginTop: 4 }}>
            Receção gravada
          </h1>
          <p className="p muted">{state.storeName}</p>
        </div>
        <section className="section" aria-labelledby="entrou">
          <h2 id="entrou" className="h2">
            Entrou no stock
          </h2>
          <div className="sheet tnum">
            {(state.received ?? []).map((r) => (
              <div key={r.name} className="row">
                <span className="row-main" style={{ fontSize: 16 }}>
                  {r.name}
                </span>
                <span className="strong ok-text">+{r.qty}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="section" aria-labelledby="prontas">
          <div>
            <h2 id="prontas" className="h2">
              {ready.length === 0
                ? "Nenhuma encomenda ficou pronta"
                : ready.length === 1
                  ? "1 encomenda ficou pronta"
                  : `${ready.length} encomendas ficaram prontas`}
            </h2>
            {ready.length > 0 ? <p className="p small muted">Reservadas pela ordem em que foram feitas.</p> : null}
          </div>
          {ready.length > 0 ? (
            <div className="sheet">
              {ready.map((o) => (
                <div key={o.id} className="row tight">
                  <Link href={`/encomendas/${o.id}`} className="row-main" style={{ textDecoration: "none", color: "inherit" }}>
                    <span className="kicker tnum">{o.number}</span>
                    <span className="row-title">{o.customerName}</span>
                  </Link>
                  <FinPill order={o} />
                  <a
                    className="chip"
                    style={{ borderColor: "var(--tinta)", color: "var(--tinta)", fontWeight: 700 }}
                    href={whatsappLink(o.customerPhone, readyMessage(o, state.storeName ?? ""))}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Avisar ${o.customerName} por WhatsApp`}
                  >
                    <Icon name="chat" size={16} stroke={2} />
                    Avisar
                  </a>
                </div>
              ))}
            </div>
          ) : null}
        </section>
        <a href="/stock/rececao" className="btn">
          Registar outra receção
        </a>
        <Link href="/" className="btn btn-primary">
          Concluir
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="stack-md" style={{ gap: 18 }}>
      <PendingProvider pending={pending}>
      <input type="hidden" name="key" value={formKey} />
      <input type="hidden" name="storeId" value={storeId} />
      <input
        type="hidden"
        name="lines"
        value={JSON.stringify(filled.map((l) => ({ itemId: l.itemId, qty: l.qty })))}
      />
      <FormAlert state={state} />

      {stores.length > 1 ? (
        <div className="field">
          <label className="label" htmlFor="store">
            Loja
          </label>
          <select id="store" className="select" value={storeId} onChange={(e) => setStoreId(e.target.value)}>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="field">
        <label className="label" htmlFor="date">
          Data da chegada
        </label>
        <input id="date" name="date" type="date" className="input" defaultValue={today} max={today} required />
      </div>

      <div className="field">
        <p className="label">Artigos recebidos</p>
        <div className="sheet">
          {lines.map((line, index) => {
            const waiting = line.itemId ? missingHere[line.itemId] ?? 0 : 0;
            return (
              <div key={line.key} className="line-card">
                <div className="between center">
                  <label className="visually-hidden" htmlFor={`item-${line.key}`}>
                    Artigo {index + 1}
                  </label>
                  <select
                    id={`item-${line.key}`}
                    className="select"
                    style={{ flex: 1 }}
                    value={line.itemId}
                    onChange={(e) => setLines((c) => c.map((l) => (l.key === line.key ? { ...l, itemId: e.target.value } : l)))}
                  >
                    <option value="">Escolher artigo…</option>
                    {selectable.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name}
                        {missingHere[i.id] ? ` (faltam ${missingHere[i.id]} para encomendas)` : ""}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="icon-btn ghost"
                    aria-label={`Remover artigo ${index + 1}`}
                    disabled={lines.length === 1}
                    onClick={() => setLines((c) => c.filter((l) => l.key !== line.key))}
                  >
                    <Icon name="close" size={18} stroke={2} />
                  </button>
                </div>
                <div className="between center">
                  <div className="stepper" role="group" aria-label={`Quantidade recebida do artigo ${index + 1}`}>
                    <button type="button" aria-label="Menos um" onClick={() => setLines((c) => c.map((l) => (l.key === line.key ? { ...l, qty: Math.max(1, l.qty - 1) } : l)))}>
                      −
                    </button>
                    <input
                      aria-label="Quantidade"
                      inputMode="numeric"
                      value={line.qty}
                      onChange={(e) => {
                        const n = Math.max(1, Math.min(100000, Number(e.target.value.replace(/\D/g, "")) || 1));
                        setLines((c) => c.map((l) => (l.key === line.key ? { ...l, qty: n } : l)));
                      }}
                      style={{ width: 56, border: "none", textAlign: "center", fontWeight: 700, fontSize: 16, background: "transparent" }}
                    />
                    <button type="button" aria-label="Mais um" onClick={() => setLines((c) => c.map((l) => (l.key === line.key ? { ...l, qty: Math.min(100000, l.qty + 1) } : l)))}>
                      +
                    </button>
                  </div>
                  {waiting > 0 ? <span className="small muted">{waiting} em falta em encomendas</span> : null}
                </div>
              </div>
            );
          })}
          <button type="button" className="btn btn-text" onClick={() => setLines((c) => [...c, { key: nextKey(), itemId: "", qty: 1 }])}>
            <Icon name="plus" size={18} stroke={2.2} />
            Adicionar artigo
          </button>
        </div>
      </div>

      <p className="p small muted">
        Ao gravar, as unidades ficam reservadas para as encomendas em espera desta loja, das mais antigas para as mais recentes.
      </p>
      <SubmitButton disabled={filled.length === 0 || filled.length !== lines.length}>Gravar receção</SubmitButton>
      {selectable.length === 0 ? (
        <p className="alert alert-info">
          Ainda não há artigos. <Link href="/stock/artigos/novo">Crie o primeiro artigo</Link>.
        </p>
      ) : null}
      </PendingProvider>
    </form>
  );
}
