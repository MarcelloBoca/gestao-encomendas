import type { Metadata } from "next";
import Link from "next/link";
import { getContext } from "@/lib/session";
import { listCategories, listItems } from "@/lib/server/data";
import { stockAt } from "@/lib/server/repo";
import { formatCents } from "@/lib/money";
import { fold } from "@/lib/text";
import Icon from "@/components/Icon";
import StorePicker from "@/components/StorePicker";
import { Empty, Notice } from "@/components/ui";

export const metadata: Metadata = { title: "Stock" };

const MESSAGES: Record<string, string> = {
  transferencia: "Transferência registada.",
};

export default async function StockPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await getContext();
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.slice(0, 80) : "";
  const showArchived = params.arquivados === "1";
  const message = typeof params.msg === "string" ? MESSAGES[params.msg] : undefined;
  const [items, categories] = await Promise.all([listItems(ctx.businessId), listCategories(ctx.businessId)]);
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));

  const needle = fold(q);
  const visible = items
    .filter((i) => i.archived === showArchived)
    .filter((i) => !needle || fold(i.name).includes(needle) || fold(categoryName.get(i.categoryId ?? "") ?? "").includes(needle));
  const archivedCount = items.filter((i) => i.archived).length;

  return (
    <main className="screen">
      <div className="top">
        <h1 className="h1">Stock</h1>
        <Link href="/stock/artigos/novo" className="icon-btn solid" aria-label="Novo artigo">
          <Icon name="plus" size={22} stroke={2.2} />
        </Link>
      </div>
      {message ? <Notice tone="ok">{message}</Notice> : null}
      <StorePicker stores={ctx.activeStores} storeId={ctx.storeId} back="/stock" />

      <div className="sheet">
        <Link href="/stock/rececao" className="row">
          <span className="badge-icon tone-ok" aria-hidden="true">
            <Icon name="truck" />
          </span>
          <span className="row-main">
            <span className="row-title">Registar receção de mercadoria</span>
            <span className="row-sub">Reserva logo para as encomendas em espera</span>
          </span>
          <Icon name="chevron" size={18} />
        </Link>
        <Link href="/stock/ajuste" className="row">
          <span className="badge-icon tone-wait" aria-hidden="true">
            <Icon name="edit" />
          </span>
          <span className="row-main">
            <span className="row-title">Ajustar stock</span>
            <span className="row-sub">Corrigir quantidades, com motivo</span>
          </span>
          <Icon name="chevron" size={18} />
        </Link>
        {ctx.activeStores.length > 1 ? (
          <Link href="/stock/transferencia" className="row">
            <span className="badge-icon tone-ready" aria-hidden="true">
              <Icon name="swap" />
            </span>
            <span className="row-main">
              <span className="row-title">Transferir entre lojas</span>
            </span>
            <Icon name="chevron" size={18} />
          </Link>
        ) : null}
        <Link href="/stock/categorias" className="row">
          <span className="badge-icon tone-wait" aria-hidden="true">
            <Icon name="list" />
          </span>
          <span className="row-main">
            <span className="row-title">Categorias</span>
          </span>
          <Icon name="chevron" size={18} />
        </Link>
      </div>

      <form action="/stock" method="get" role="search">
        {showArchived ? <input type="hidden" name="arquivados" value="1" /> : null}
        <label className="search">
          <Icon name="search" size={18} stroke={2} />
          <span className="visually-hidden">Pesquisar artigos</span>
          <input type="search" name="q" defaultValue={q} placeholder="Artigo ou categoria" enterKeyHint="search" />
        </label>
      </form>

      <section className="section" aria-labelledby="artigos">
        <div className="section-head">
          <h2 id="artigos" className="h2">
            {showArchived ? "Artigos arquivados" : `Artigos na ${ctx.store?.name ?? "loja"}`}
          </h2>
          {archivedCount > 0 || showArchived ? (
            <Link href={showArchived ? "/stock" : "/stock?arquivados=1"} className="small strong">
              {showArchived ? "Ver ativos" : `Arquivados (${archivedCount})`}
            </Link>
          ) : null}
        </div>
        <div className="sheet">
          {visible.length === 0 ? (
            <Empty>{q ? "Nenhum artigo corresponde à pesquisa." : showArchived ? "Não há artigos arquivados." : "Ainda não há artigos. Crie o primeiro com o botão +."}</Empty>
          ) : (
            visible.map((item) => {
              const level = stockAt(item, ctx.storeId);
              return (
                <Link key={item.id} href={`/stock/artigos/${item.id}`} className="row">
                  <span className="row-main">
                    <span className="row-title">{item.name}</span>
                    <span className="row-sub tnum">
                      {categoryName.get(item.categoryId ?? "") ?? "Sem categoria"}, {formatCents(item.priceCents)} MT
                    </span>
                  </span>
                  <span className="stack tnum" style={{ textAlign: "right", gap: 0 }}>
                    <span className="strong" style={{ fontSize: 16 }}>
                      {level.available} disp.
                    </span>
                    <span className="tiny muted nowrap">
                      {level.physical} na loja, {level.reserved} reserv.
                    </span>
                  </span>
                </Link>
              );
            })
          )}
        </div>
      </section>
    </main>
  );
}
