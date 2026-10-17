import type { Metadata } from "next";
import { getContext } from "@/lib/session";
import { listCategories } from "@/lib/server/data";
import { saveCategory, setCategoryArchived } from "@/app/actions/stock";
import { ActionForm, SubmitButton } from "@/components/forms";
import { BackLink, Empty } from "@/components/ui";

export const metadata: Metadata = { title: "Categorias" };

export default async function CategoriesPage() {
  const ctx = await getContext();
  const categories = await listCategories(ctx.businessId);
  const active = categories.filter((c) => !c.archived);
  const archived = categories.filter((c) => c.archived);

  return (
    <main className="screen narrow">
      <BackLink href="/stock" label="Stock" />
      <h1 className="h1 sm" style={{ marginTop: -8 }}>
        Categorias
      </h1>

      <section className="sheet pad" aria-labelledby="nova">
        <h2 id="nova" className="h2">
          Nova categoria
        </h2>
        <ActionForm action={saveCategory}>
          <div className="field">
            <label className="visually-hidden" htmlFor="new-category">
              Nome da categoria
            </label>
            <input id="new-category" name="name" className="input" required maxLength={80} placeholder="Ex.: Electrodomésticos" />
          </div>
          <SubmitButton>Criar categoria</SubmitButton>
        </ActionForm>
      </section>

      <section className="section" aria-labelledby="ativas">
        <h2 id="ativas" className="h2">
          Ativas
        </h2>
        <div className="sheet">
          {active.length === 0 ? <Empty>Ainda não há categorias.</Empty> : null}
          {active.map((c) => (
            <div key={c.id} className="line-card">
              <ActionForm action={saveCategory} className="inline">
                <input type="hidden" name="categoryId" value={c.id} />
                <label className="visually-hidden" htmlFor={`cat-${c.id}`}>
                  Nome
                </label>
                <input id={`cat-${c.id}`} name="name" className="input" defaultValue={c.name} required maxLength={80} style={{ flex: 1, minWidth: 0 }} />
                <SubmitButton className="btn btn-sm">Guardar</SubmitButton>
              </ActionForm>
              <ActionForm action={setCategoryArchived} className="inline">
                <input type="hidden" name="categoryId" value={c.id} />
                <input type="hidden" name="archived" value="1" />
                <SubmitButton className="link-btn" pendingText="A arquivar…">
                  Arquivar
                </SubmitButton>
              </ActionForm>
            </div>
          ))}
        </div>
      </section>

      {archived.length ? (
        <section className="section" aria-labelledby="arquivadas">
          <h2 id="arquivadas" className="h2">
            Arquivadas
          </h2>
          <div className="sheet">
            {archived.map((c) => (
              <div key={c.id} className="row">
                <span className="row-main row-title muted">{c.name}</span>
                <ActionForm action={setCategoryArchived} className="inline">
                  <input type="hidden" name="categoryId" value={c.id} />
                  <input type="hidden" name="archived" value="0" />
                  <SubmitButton className="link-btn" pendingText="A reativar…">
                    Reativar
                  </SubmitButton>
                </ActionForm>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
