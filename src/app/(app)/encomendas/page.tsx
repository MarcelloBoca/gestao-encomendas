import type { Metadata } from "next";
import Link from "next/link";
import { getContext } from "@/lib/session";
import { listOrders } from "@/lib/server/data";
import { shortDay, todayIso } from "@/lib/dates";
import { balanceOf, financialStatus } from "@/lib/domain";
import { formatCents, formatMT } from "@/lib/money";
import { normalizePhone } from "@/lib/phone";
import { fold } from "@/lib/text";
import type { Order } from "@/lib/types";
import Icon from "@/components/Icon";
import StorePicker from "@/components/StorePicker";
import { Empty, FinPill, FulPill } from "@/components/ui";

export const metadata: Metadata = { title: "Encomendas" };

const FILTERS: { id: string; label: string; test: (o: Order, today: string) => boolean }[] = [
  { id: "abertas", label: "Em aberto", test: (o) => o.fulfillment === "awaiting" || o.fulfillment === "ready" },
  { id: "porpagar", label: "Por pagar", test: (o) => isOpen(o) && financialStatus(o.totalCents, o.paidCents) === "unpaid" },
  { id: "parcial", label: "Parcial", test: (o) => isOpen(o) && financialStatus(o.totalCents, o.paidCents) === "partial" },
  { id: "pagas", label: "Pagas", test: (o) => isOpen(o) && financialStatus(o.totalCents, o.paidCents) === "paid" },
  { id: "prontas", label: "Prontas", test: (o) => o.fulfillment === "ready" },
  { id: "aguardar", label: "A aguardar", test: (o) => o.fulfillment === "awaiting" },
  { id: "atrasadas", label: "Atrasadas", test: (o, today) => o.fulfillment === "awaiting" && !!o.expectedDate && o.expectedDate < today },
  { id: "levantadas", label: "Levantadas", test: (o) => o.fulfillment === "collected" },
  { id: "canceladas", label: "Canceladas", test: (o) => o.fulfillment === "cancelled" },
  { id: "todas", label: "Todas", test: () => true },
];

function isOpen(o: Order): boolean {
  return o.fulfillment === "awaiting" || o.fulfillment === "ready";
}

function rightNote(order: Order): { text: string; className: string } {
  if (order.fulfillment === "cancelled") return { text: "Cancelada", className: "muted" };
  if (order.fulfillment === "collected") {
    return { text: order.collectedDate ? `Levantada a ${shortDay(order.collectedDate)}` : "Levantada", className: "muted" };
  }
  const balance = balanceOf(order.totalCents, order.paidCents);
  if (balance === 0) return { text: "Pago", className: "ok-text" };
  const status = financialStatus(order.totalCents, order.paidCents);
  return { text: `Faltam ${formatCents(balance)}`, className: status === "unpaid" ? "due-text" : "owed-text" };
}

export default async function OrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await getContext();
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.slice(0, 80) : "";
  const filterId = typeof params.estado === "string" && FILTERS.some((f) => f.id === params.estado) ? params.estado : "abertas";
  const filter = FILTERS.find((f) => f.id === filterId)!;
  const today = todayIso(ctx.tz);

  const all = (await listOrders(ctx.businessId, 600)).filter((o) => o.storeId === ctx.storeId);
  const needle = fold(q);
  const digits = normalizePhone(q);
  const searched = needle
    ? all.filter(
        (o) =>
          fold(o.number).includes(needle) ||
          fold(o.customerName).includes(needle) ||
          (digits.length >= 3 && o.customerPhone.includes(digits)),
      )
    : all;
  const visible = searched.filter((o) => filter.test(o, today));

  const href = (estado: string) => {
    const sp = new URLSearchParams();
    if (estado !== "abertas") sp.set("estado", estado);
    if (q) sp.set("q", q);
    const s = sp.toString();
    return s ? `/encomendas?${s}` : "/encomendas";
  };

  return (
    <main className="screen">
      <div className="top">
        <h1 className="h1">Encomendas</h1>
        <Link href="/encomendas/nova" className="icon-btn solid" aria-label="Nova encomenda">
          <Icon name="plus" size={22} stroke={2.2} />
        </Link>
      </div>

      <div className="inline" style={{ justifyContent: "space-between" }}>
        <StorePicker stores={ctx.activeStores} storeId={ctx.storeId} back="/encomendas" />
        <Link href="/clientes" className="chip">
          <Icon name="users" size={18} />
          Clientes
        </Link>
      </div>

      <form action="/encomendas" method="get" role="search">
        {filterId !== "abertas" ? <input type="hidden" name="estado" value={filterId} /> : null}
        <label className="search">
          <Icon name="search" size={18} stroke={2} />
          <span className="visually-hidden">Pesquisar encomendas</span>
          <input type="search" name="q" defaultValue={q} placeholder="Número, nome ou telefone" enterKeyHint="search" />
        </label>
      </form>

      <nav className="chip-row" aria-label="Filtrar por estado">
        {FILTERS.map((f) => {
          const count = searched.filter((o) => f.test(o, today)).length;
          return (
            <Link key={f.id} href={href(f.id)} className="chip" aria-current={f.id === filterId ? "true" : undefined}>
              {f.label} {count}
            </Link>
          );
        })}
      </nav>

      <div className="sheet">
        {visible.length === 0 ? (
          <Empty>{q ? "Nenhuma encomenda corresponde à pesquisa." : "Não há encomendas neste estado."}</Empty>
        ) : (
          visible.map((order) => {
            const note = rightNote(order);
            const late = order.fulfillment === "awaiting" && order.expectedDate && order.expectedDate < today;
            return (
              <Link key={order.id} href={`/encomendas/${order.id}`} className="order-row">
                <span className="between kicker tnum">
                  <span>{order.number}</span>
                  <span className={late ? "due-text" : undefined}>
                    {order.createdDate ? shortDay(order.createdDate) : ""}
                    {late ? ", atrasada" : ""}
                  </span>
                </span>
                <span className="between">
                  <span className="row-title">{order.customerName}</span>
                  <span className="strong tnum nowrap" style={{ fontSize: 15 }}>
                    {formatMT(order.totalCents)}
                  </span>
                </span>
                <span className="between center">
                  <span className="pills">
                    {order.fulfillment !== "cancelled" ? <FinPill order={order} /> : null}
                    <FulPill fulfillment={order.fulfillment} />
                  </span>
                  <span className={`small strong tnum nowrap ${note.className}`}>{note.text}</span>
                </span>
              </Link>
            );
          })
        )}
      </div>
    </main>
  );
}
