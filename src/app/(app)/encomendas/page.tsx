import type { Metadata } from "next";
import Link from "next/link";
import { getContext } from "@/lib/session";
import { listOrders } from "@/lib/server/data";
import { shortDay } from "@/lib/dates";
import { balanceOf, financialStatus, isOpen } from "@/lib/domain";
import { formatShort } from "@/lib/money";
import { normalizePhone } from "@/lib/phone";
import { fold, plural } from "@/lib/text";
import type { Order } from "@/lib/types";
import Icon from "@/components/Icon";
import StorePicker from "@/components/StorePicker";
import { Avatar, Empty, FulTag, PayProgress, Ring } from "@/components/ui";

export const metadata: Metadata = { title: "Encomendas" };

const FILTERS: { id: string; label: string; test: (o: Order) => boolean }[] = [
  { id: "abertas", label: "Em aberto", test: (o) => isOpen(o.fulfillment) },
  { id: "prontas", label: "Prontas", test: (o) => o.fulfillment === "ready" },
  { id: "porpagar", label: "Por pagar", test: (o) => isOpen(o.fulfillment) && balanceOf(o.totalCents, o.paidCents) > 0 },
  { id: "aguardar", label: "A aguardar", test: (o) => o.fulfillment === "awaiting" },
  { id: "levantadas", label: "Levantadas", test: (o) => o.fulfillment === "collected" },
  { id: "canceladas", label: "Canceladas", test: (o) => o.fulfillment === "cancelled" },
  { id: "todas", label: "Todas", test: () => true },
];

function footNote(order: Order): { text: React.ReactNode; className: string } {
  if (order.fulfillment === "cancelled") return { text: "Cancelada", className: "muted" };
  if (order.fulfillment === "collected") {
    return { text: order.collectedDate ? `Levantada a ${shortDay(order.collectedDate)}` : "Levantada", className: "muted" };
  }
  const status = financialStatus(order.totalCents, order.paidCents);
  if (status === "paid") {
    return {
      text: (
        <>
          <Icon name="check" size={13} stroke={3} />
          Paga
        </>
      ),
      className: "ok-text",
    };
  }
  if (status === "unpaid") return { text: "Por pagar", className: "due-text" };
  return { text: `Faltam ${formatShort(balanceOf(order.totalCents, order.paidCents))}`, className: "owed-text" };
}

export default async function OrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await getContext();
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.slice(0, 80) : "";
  const filterId = typeof params.estado === "string" && FILTERS.some((f) => f.id === params.estado) ? params.estado : "abertas";
  const filter = FILTERS.find((f) => f.id === filterId)!;

  const all = (await listOrders(ctx.businessId, 600)).filter((o) => o.storeId === ctx.storeId);
  const needle = fold(q);
  const digits = normalizePhone(q);
  const searched = needle
    ? all.filter(
        (o) =>
          fold(o.number).includes(needle) ||
          fold(o.customerName).includes(needle) ||
          (digits.length >= 3 && o.customerPhone.includes(digits)) ||
          o.lines.some((l) => fold(l.name).includes(needle)),
      )
    : all;
  const visible = searched.filter(filter.test);

  const open = all.filter((o) => isOpen(o.fulfillment));
  const readyCount = open.filter((o) => o.fulfillment === "ready").length;
  const debtors = open.filter((o) => balanceOf(o.totalCents, o.paidCents) > 0);
  const owed = debtors.reduce((s, o) => s + balanceOf(o.totalCents, o.paidCents), 0);
  const debtorCount = new Set(debtors.map((o) => o.customerId || o.customerName)).size;

  const href = (estado: string) => {
    const sp = new URLSearchParams();
    if (estado !== "abertas") sp.set("estado", estado);
    if (q) sp.set("q", q);
    const s = sp.toString();
    return s ? `/encomendas?${s}` : "/encomendas";
  };

  return (
    <main className="screen" style={{ gap: 16 }}>
      <div className="top">
        <h1 className="h1">Encomendas</h1>
        <Link href="/encomendas/nova" className="icon-btn solid" aria-label="Nova encomenda">
          <Icon name="plus" size={22} stroke={2.2} />
        </Link>
      </div>

      {ctx.activeStores.length > 1 ? (
        <div>
          <StorePicker stores={ctx.activeStores} storeId={ctx.storeId} back="/encomendas" />
        </div>
      ) : null}

      <form action="/encomendas" method="get" role="search">
        {filterId !== "abertas" ? <input type="hidden" name="estado" value={filterId} /> : null}
        <label className="search">
          <Icon name="search" size={18} stroke={2} />
          <span className="visually-hidden">Pesquisar encomendas</span>
          <input type="search" name="q" defaultValue={q} placeholder="Nome, telefone, número ou artigo" enterKeyHint="search" />
        </label>
      </form>

      <nav className="chip-row" aria-label="Filtrar por estado">
        {FILTERS.map((f) => (
          <Link key={f.id} href={href(f.id)} className="chip" aria-current={f.id === filterId ? "true" : undefined}>
            {f.label}
          </Link>
        ))}
      </nav>

      {!q ? (
        <div className="summary">
          <Link href={href("prontas")} className="summary-ring" style={{ textDecoration: "none", color: "inherit" }}>
            <Ring
              size={76}
              stroke={8}
              percent={open.length ? (readyCount / open.length) * 100 : 0}
              color="#6A3AA2"
              label={`${readyCount} de ${open.length} encomendas prontas`}
            >
              <text x="38" y="44" textAnchor="middle" fontSize="18" fontWeight="800" fill="#241821">
                {readyCount}/{open.length}
              </text>
            </Ring>
            <span className="stack" style={{ gap: 2 }}>
              <span className="strong" style={{ fontSize: 14 }}>
                Prontas
              </span>
              <span className="tiny muted" style={{ lineHeight: "16px" }}>
                das encomendas em aberto
              </span>
            </span>
          </Link>
          <Link href="/relatorios/dividas" className="summary-dark">
            <span className="k">Em dívida</span>
            <span className="v">{formatShort(owed)} MT</span>
            <span className="s">{plural(debtorCount, "cliente", "clientes")}</span>
          </Link>
        </div>
      ) : null}

      {visible.length === 0 ? (
        <div className="sheet">
          <Empty>{q ? "Nenhuma encomenda corresponde à pesquisa." : "Não há encomendas neste estado."}</Empty>
        </div>
      ) : (
        <div className="cards">
          {visible.map((order) => {
            const note = footNote(order);
            const count = order.lines.reduce((s, l) => s + l.qty, 0);
            return (
              <Link key={order.id} href={`/encomendas/${order.id}`} className="oc">
                <span className="oc-head">
                  <Avatar name={order.customerName} />
                  <span className="row-main">
                    <span className="row-title">{order.customerName}</span>
                    <span className="tiny muted tnum">
                      {order.number}, {plural(count, "artigo", "artigos")}
                    </span>
                  </span>
                  <FulTag fulfillment={order.fulfillment} />
                </span>
                {order.fulfillment !== "cancelled" ? <PayProgress totalCents={order.totalCents} paidCents={order.paidCents} /> : null}
                <span className="oc-foot">
                  <span className="muted">
                    Pago {formatShort(order.paidCents)} de {formatShort(order.totalCents)} MT
                  </span>
                  <span className={`tag ${note.className}`}>{note.text}</span>
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
