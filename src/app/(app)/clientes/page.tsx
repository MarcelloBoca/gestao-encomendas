import type { Metadata } from "next";
import Link from "next/link";
import { getContext } from "@/lib/session";
import { listCustomers, listOpenOrders } from "@/lib/server/data";
import { balanceOf } from "@/lib/domain";
import { formatMT } from "@/lib/money";
import { formatPhone, normalizePhone } from "@/lib/phone";
import { fold } from "@/lib/text";
import Icon from "@/components/Icon";
import { Avatar, Empty } from "@/components/ui";

export const metadata: Metadata = { title: "Clientes" };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await getContext();
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.slice(0, 80) : "";
  const [customers, open] = await Promise.all([listCustomers(ctx.businessId), listOpenOrders(ctx.businessId)]);

  const debt = new Map<string, number>();
  for (const order of open) {
    const balance = balanceOf(order.totalCents, order.paidCents);
    if (balance > 0) debt.set(order.customerId, (debt.get(order.customerId) ?? 0) + balance);
  }

  const needle = fold(q);
  const digits = normalizePhone(q);
  const visible = needle
    ? customers.filter((c) => fold(c.name).includes(needle) || (digits.length >= 3 && c.phone.includes(digits)))
    : customers;

  return (
    <main className="screen">
      <div className="top">
        <h1 className="h1">Clientes</h1>
        <Link href="/encomendas/nova" className="icon-btn solid" aria-label="Nova encomenda">
          <Icon name="plus" size={22} stroke={2.2} />
        </Link>
      </div>
      <form action="/clientes" method="get" role="search">
        <label className="search">
          <Icon name="search" size={18} stroke={2} />
          <span className="visually-hidden">Pesquisar clientes</span>
          <input type="search" name="q" defaultValue={q} placeholder="Nome ou telefone" enterKeyHint="search" />
        </label>
      </form>
      <div className="sheet">
        {visible.length === 0 ? (
          <Empty>{q ? "Nenhuma cliente corresponde à pesquisa." : "As clientes aparecem aqui quando criar encomendas."}</Empty>
        ) : (
          visible.map((c) => {
            const owed = debt.get(c.id) ?? 0;
            return (
              <Link key={c.id} href={`/clientes/${c.id}`} className="row">
                <Avatar name={c.name} />
                <span className="row-main">
                  <span className="row-title">{c.name}</span>
                  <span className="row-sub tnum">{c.phone ? formatPhone(c.phone) : "Sem telefone"}</span>
                </span>
                {owed > 0 ? <span className="small strong owed-text tnum nowrap">Deve {formatMT(owed)}</span> : null}
                <span className="chev">
                  <Icon name="chevron" size={18} stroke={2} />
                </span>
              </Link>
            );
          })
        )}
      </div>
    </main>
  );
}
