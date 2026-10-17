import type { Metadata } from "next";
import { randomUUID } from "crypto";
import { getContext } from "@/lib/session";
import { listItems } from "@/lib/server/data";
import { stockAt } from "@/lib/server/repo";
import { adjustStock } from "@/app/actions/stock";
import { ActionForm, SubmitButton } from "@/components/forms";
import { BackLink, Notice } from "@/components/ui";

export const metadata: Metadata = { title: "Ajustar stock" };

export default async function AdjustPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await getContext();
  const params = await searchParams;
  const preselected = typeof params.artigo === "string" ? params.artigo : "";
  const items = (await listItems(ctx.businessId)).filter((i) => !i.archived || i.id === preselected);

  return (
    <main className="screen narrow">
      <BackLink href={preselected ? `/stock/artigos/${preselected}` : "/stock"} label={preselected ? "Artigo" : "Stock"} />
      <div className="stack" style={{ marginTop: -8 }}>
        <h1 className="h1 sm">Ajustar stock</h1>
        <p className="p muted">{ctx.store?.name}</p>
      </div>
      {items.length === 0 ? (
        <Notice tone="info">Ainda não há artigos.</Notice>
      ) : (
        <ActionForm action={adjustStock}>
          <input type="hidden" name="key" value={randomUUID()} />
          <input type="hidden" name="storeId" value={ctx.storeId} />
          <div className="field">
            <label className="label" htmlFor="itemId">
              Artigo
            </label>
            <select id="itemId" name="itemId" className="select" defaultValue={preselected} required>
              <option value="" disabled>
                Escolher artigo…
              </option>
              {items.map((item) => {
                const level = stockAt(item, ctx.storeId);
                return (
                  <option key={item.id} value={item.id}>
                    {item.name} ({level.physical} na loja, {level.available} disponíveis)
                  </option>
                );
              })}
            </select>
          </div>
          <fieldset style={{ border: "none", margin: 0, padding: 0 }}>
            <legend className="label" style={{ marginBottom: 8 }}>
              Tipo de ajuste
            </legend>
            <div className="option-grid" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
              <label className="option">
                <input type="radio" name="direction" value="entrada" defaultChecked />
                <span>Acrescentar</span>
              </label>
              <label className="option">
                <input type="radio" name="direction" value="saida" />
                <span>Retirar</span>
              </label>
            </div>
          </fieldset>
          <div className="field">
            <label className="label" htmlFor="qty">
              Quantidade
            </label>
            <input id="qty" name="qty" className="input" inputMode="numeric" pattern="[0-9]*" required defaultValue="1" />
            <p className="hint">Só pode retirar unidades disponíveis; as reservadas para encomendas ficam protegidas.</p>
          </div>
          <div className="field">
            <label className="label" htmlFor="reason">
              Motivo
            </label>
            <textarea id="reason" name="reason" className="textarea" required maxLength={500} placeholder="Ex.: contagem do inventário, artigo danificado" />
          </div>
          <SubmitButton>Gravar ajuste</SubmitButton>
        </ActionForm>
      )}
    </main>
  );
}
