import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getContext } from "@/lib/session";
import { getCustomerBundle } from "@/lib/server/data";
import { shortDay } from "@/lib/dates";
import { balanceOf } from "@/lib/domain";
import { formatMT } from "@/lib/money";
import { formatPhone, whatsappLink } from "@/lib/phone";
import Icon from "@/components/Icon";
import { BackLink, Empty, FinPill, FulPill } from "@/components/ui";

export const metadata: Metadata = { title: "Cliente" };

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getContext();
  const { id } = await params;
  const bundle = await getCustomerBundle(ctx.businessId, id);
  if (!bundle) notFound();
  const { customer, orders } = bundle;
  const active = orders.filter((o) => o.fulfillment !== "cancelled");
  const paid = active.reduce((s, o) => s + o.paidCents, 0);
  const owed = orders
    .filter((o) => o.fulfillment === "awaiting" || o.fulfillment === "ready")
    .reduce((s, o) => s + balanceOf(o.totalCents, o.paidCents), 0);

  return (
    <main className="screen">
      <BackLink href="/clientes" label="Clientes" />
      <div className="stack" style={{ marginTop: -8 }}>
        <h1 className="h1 sm">{customer.name}</h1>
        <p className="p muted tnum">{customer.phone ? formatPhone(customer.phone) : "Sem telefone"}</p>
      </div>
      {customer.phone ? (
        <a className="btn" style={{ border: "none" }} href={whatsappLink(customer.phone, `Olá ${customer.name}, `)} target="_blank" rel="noopener noreferrer">
          <Icon name="chat" size={18} stroke={2} />
          Abrir conversa no WhatsApp
        </a>
      ) : null}
      <section className="sheet pad" aria-label="Resumo do cliente">
        <div className="split" style={{ borderTop: "none", paddingTop: 0 }}>
          <div className="stat">
            <span className="stat-label">Total pago</span>
            <span className="stat-value">{formatMT(paid)}</span>
          </div>
          <div className="stat">
            <span className="stat-label">
              <span className="dot owed" aria-hidden="true" />
              Em dívida
            </span>
            <span className={`stat-value${owed > 0 ? " owed-text" : ""}`}>{formatMT(owed)}</span>
          </div>
        </div>
      </section>
      <section className="section" aria-labelledby="encomendas">
        <h2 id="encomendas" className="h2">
          Encomendas ({orders.length})
        </h2>
        <div className="sheet">
          {orders.length === 0 ? (
            <Empty>Sem encomendas.</Empty>
          ) : (
            orders.map((o) => (
              <Link key={o.id} href={`/encomendas/${o.id}`} className="order-row">
                <span className="between kicker tnum">
                  <span>{o.number}</span>
                  <span>{o.createdDate ? shortDay(o.createdDate) : ""}</span>
                </span>
                <span className="between center">
                  <span className="pills">
                    {o.fulfillment !== "cancelled" ? <FinPill order={o} /> : null}
                    <FulPill fulfillment={o.fulfillment} />
                  </span>
                  <span className="strong tnum nowrap">{formatMT(o.totalCents)}</span>
                </span>
              </Link>
            ))
          )}
        </div>
      </section>
    </main>
  );
}
