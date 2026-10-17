"use client";

import Link from "next/link";
import { useState } from "react";
import { readyMessage, whatsappLink } from "@/lib/phone";
import type { ActionState, ArrivalState } from "@/lib/types";
import Icon from "./Icon";
import { PendingProvider, SubmitButton, useSubmitAction } from "./forms";

export interface WaitingRow {
  id: string;
  number: string;
  customerName: string;
  items: string;
  waited: string;
}

export default function ArrivalForm({
  action,
  rows,
}: {
  action: (prev: ArrivalState, fd: FormData) => Promise<ArrivalState>;
  rows: WaitingRow[];
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const { state: raw, pending, onSubmit } = useSubmitAction(action as (prev: ActionState, fd: FormData) => Promise<ActionState>, (form) => {
    const key = form.elements.namedItem("key");
    if (key instanceof HTMLInputElement) key.value = crypto.randomUUID();
    return true;
  });
  const state = raw as ArrivalState;
  const present = new Set(rows.map((r) => r.id));
  const chosen = selected.filter((id) => present.has(id));
  const allChosen = rows.length > 0 && chosen.length === rows.length;

  function toggle(id: string) {
    setSelected((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
  }

  return (
    <div className="stack-md" style={{ gap: 16 }}>
      {state.ok && state.ready?.length ? (
        <section className="section" aria-labelledby="prontas-agora">
          <p className="alert alert-ok" role="status">
            <Icon name="check" size={18} stroke={2.6} />
            {state.message} Avise as clientes:
          </p>
          <h2 id="prontas-agora" className="visually-hidden">
            Encomendas que ficaram prontas
          </h2>
          <div className="sheet">
            {state.ready.map((order) => (
              <div key={order.id} className="row tight">
                <Link href={`/encomendas/${order.id}`} className="row-main" style={{ textDecoration: "none", color: "inherit" }}>
                  <span className="row-title">{order.customerName}</span>
                  <span className="tiny muted tnum">{order.number}</span>
                </Link>
                <a
                  className="btn btn-sm"
                  style={{ border: "none", background: "var(--rosa-claro)", color: "var(--rosa-texto)" }}
                  href={whatsappLink(order.customerPhone, readyMessage(order, state.storeName ?? ""))}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Icon name="chat" size={16} stroke={2} />
                  Avisar
                </a>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {state.error ? (
        <p className="alert alert-error" role="alert">
          {state.error}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <div className="sheet">
          <p className="empty">Não há encomendas a aguardar mercadoria nesta loja.</p>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="stack-md" style={{ gap: 16 }}>
          <PendingProvider pending={pending}>
            <input type="hidden" name="key" defaultValue="" />
            <div className="between center">
              <p className="p small muted">
                {rows.length} {rows.length === 1 ? "encomenda" : "encomendas"} a aguardar, das mais antigas para as mais recentes.
              </p>
              <button type="button" className="link-btn" onClick={() => setSelected(allChosen ? [] : rows.map((r) => r.id))}>
                {allChosen ? "Limpar" : "Escolher todas"}
              </button>
            </div>
            <div className="sheet">
              {rows.map((row) => (
                <label key={row.id} className="radio-row" style={{ alignItems: "center" }}>
                  <input type="checkbox" name="orderId" value={row.id} checked={chosen.includes(row.id)} onChange={() => toggle(row.id)} />
                  <span className="row-main">
                    <span className="row-title">{row.customerName}</span>
                    <span className="tiny muted">
                      <span className="tnum">{row.number}</span>, {row.items}
                    </span>
                  </span>
                  <span className="tiny strong wait-text nowrap">{row.waited}</span>
                </label>
              ))}
            </div>
            <div className="bottom-bar">
              <div className="bottom-bar-inner">
                <p className="hint">As encomendas escolhidas passam a Prontas. Só podem ser levantadas depois de pagas.</p>
                <SubmitButton disabled={chosen.length === 0} pendingText="A marcar…">
                  {chosen.length === 0
                    ? "Escolha as encomendas"
                    : `Marcar ${chosen.length === 1 ? "1 encomenda" : `${chosen.length} encomendas`} como chegadas`}
                </SubmitButton>
              </div>
            </div>
          </PendingProvider>
        </form>
      )}
    </div>
  );
}
