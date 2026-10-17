import type { Metadata } from "next";
import { getContext } from "@/lib/session";
import { listOpenOrders } from "@/lib/server/data";
import { agoLabel, daysBetween, todayIso } from "@/lib/dates";
import { markArrivedMany } from "@/app/actions/orders";
import ArrivalForm from "@/components/ArrivalForm";
import { BackLink } from "@/components/ui";

export const metadata: Metadata = { title: "Mercadoria chegou" };

export default async function ArrivalPage() {
  const ctx = await getContext();
  const today = todayIso(ctx.tz);
  const waiting = (await listOpenOrders(ctx.businessId))
    .filter((o) => o.storeId === ctx.storeId && o.fulfillment === "awaiting")
    .sort((a, b) => a.createdAtMs - b.createdAtMs);

  const rows = waiting.map((o) => {
    const names = o.lines.map((l) => (l.qty > 1 ? `${l.qty}× ${l.name}` : l.name));
    const items = names.length > 2 ? `${names.slice(0, 2).join("; ")} e mais ${names.length - 2}` : names.join("; ");
    return {
      id: o.id,
      number: o.number,
      customerName: o.customerName,
      items: items || "sem artigos",
      waited: agoLabel(o.createdDate ? daysBetween(o.createdDate, today) : 0),
    };
  });

  return (
    <main className="screen with-bar">
      <BackLink href="/" label="Início" />
      <div className="stack" style={{ marginTop: -8 }}>
        <h1 className="h1 sm">Mercadoria chegou</h1>
        <p className="p muted">Escolha as encomendas cuja mercadoria já está na {ctx.store?.name ?? "loja"}.</p>
      </div>
      <ArrivalForm action={markArrivedMany} rows={rows} />
    </main>
  );
}
