import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getContext, storeName } from "@/lib/session";
import { getItem, listCategories, movementsForItem } from "@/lib/server/data";
import { stockAt } from "@/lib/server/repo";
import { shortDay } from "@/lib/dates";
import { saveItem, setItemArchived } from "@/app/actions/stock";
import ItemFields from "@/components/ItemFields";
import { ActionForm, SubmitButton } from "@/components/forms";
import { BackLink, Empty, Notice } from "@/components/ui";
import type { MovementType } from "@/lib/types";

export const metadata: Metadata = { title: "Artigo" };

const TYPE_LABEL: Record<MovementType, string> = {
  rececao: "Receção",
  transferencia: "Transferência",
  ajuste: "Ajuste",
  levantamento: "Levantamento",
  anulacao: "Anulação de levantamento",
};

const MESSAGES: Record<string, string> = {
  guardado: "Artigo guardado.",
  ajuste: "Ajuste registado.",
};

export default async function ItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await getContext();
  const { id } = await params;
  const sp = await searchParams;
  const [item, categories, movements] = await Promise.all([
    getItem(ctx.businessId, id),
    listCategories(ctx.businessId),
    movementsForItem(ctx.businessId, id),
  ]);
  if (!item) notFound();
  const message = typeof sp.msg === "string" ? MESSAGES[sp.msg] : undefined;

  return (
    <main className="screen narrow">
      <BackLink href="/stock" label="Stock" />
      <div className="stack" style={{ marginTop: -8 }}>
        <h1 className="h1 sm">{item.name}</h1>
        {item.archived ? <p className="p muted">Arquivado: não aparece em novas encomendas.</p> : null}
      </div>
      {message ? <Notice tone="ok">{message}</Notice> : null}

      <section className="section" aria-labelledby="stock">
        <div className="section-head">
          <h2 id="stock" className="h2">
            Stock por loja
          </h2>
          <Link href={`/stock/ajuste?artigo=${item.id}`} className="small strong">
            Ajustar
          </Link>
        </div>
        <div className="sheet tnum">
          {ctx.activeStores.map((store) => {
            const level = stockAt(item, store.id);
            return (
              <div key={store.id} className="row">
                <span className="row-main">
                  <span className="row-title">{store.name}</span>
                  <span className="row-sub">
                    {level.physical} na loja, {level.reserved} reservados para encomendas
                  </span>
                </span>
                <span className="strong" style={{ fontSize: 16 }}>
                  {level.available} disp.
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="section" aria-labelledby="dados">
        <h2 id="dados" className="h2">
          Dados do artigo
        </h2>
        <div className="sheet pad">
          <ActionForm action={saveItem}>
            <ItemFields item={item} categories={categories} />
            <SubmitButton>Guardar</SubmitButton>
          </ActionForm>
        </div>
      </section>

      <section className="section" aria-labelledby="movimentos">
        <h2 id="movimentos" className="h2">
          Movimentos recentes
        </h2>
        <div className="sheet">
          {movements.length === 0 ? (
            <Empty>Ainda não há movimentos.</Empty>
          ) : (
            movements.map((m) => (
              <div key={m.id} className="row">
                <span className="row-main">
                  <span className="row-title" style={{ fontSize: 15 }}>
                    {TYPE_LABEL[m.type]}
                    {m.orderNumber ? ` ${m.orderNumber}` : ""}
                  </span>
                  <span className="row-sub">
                    {storeName(ctx, m.storeId)}, {m.date ? shortDay(m.date) : ""}, {m.byName}
                    {m.reason ? `. ${m.reason}` : ""}
                  </span>
                </span>
                <span className={`strong tnum ${m.qty > 0 ? "ok-text" : ""}`}>
                  {m.qty > 0 ? "+" : "−"}
                  {Math.abs(m.qty)}
                </span>
              </div>
            ))
          )}
        </div>
      </section>

      <ActionForm action={setItemArchived} confirmText={item.archived ? undefined : "Arquivar este artigo? Deixa de aparecer em novas encomendas."}>
        <input type="hidden" name="itemId" value={item.id} />
        <input type="hidden" name="archived" value={item.archived ? "0" : "1"} />
        <SubmitButton className="btn">{item.archived ? "Reativar artigo" : "Arquivar artigo"}</SubmitButton>
      </ActionForm>
    </main>
  );
}
