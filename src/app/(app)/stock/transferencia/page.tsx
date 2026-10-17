import type { Metadata } from "next";
import { randomUUID } from "crypto";
import { getContext } from "@/lib/session";
import { listItems } from "@/lib/server/data";
import { stockAt } from "@/lib/server/repo";
import { todayIso } from "@/lib/dates";
import { transferStock } from "@/app/actions/stock";
import { ActionForm, SubmitButton } from "@/components/forms";
import { BackLink, Notice } from "@/components/ui";

export const metadata: Metadata = { title: "Transferir stock" };

export default async function TransferPage() {
  const ctx = await getContext();
  const items = (await listItems(ctx.businessId)).filter((i) => !i.archived);
  const others = ctx.activeStores.filter((s) => s.id !== ctx.storeId);
  const today = todayIso(ctx.tz);

  return (
    <main className="screen narrow">
      <BackLink href="/stock" label="Stock" />
      <div className="stack" style={{ marginTop: -8 }}>
        <h1 className="h1 sm">Transferir entre lojas</h1>
        <p className="p muted">A partir da {ctx.store?.name}</p>
      </div>
      {others.length === 0 ? (
        <Notice tone="info">Precisa de pelo menos duas lojas ativas. Crie outra loja em Definições.</Notice>
      ) : (
        <ActionForm action={transferStock}>
          <input type="hidden" name="key" value={randomUUID()} />
          <input type="hidden" name="fromStoreId" value={ctx.storeId} />
          <div className="field">
            <label className="label" htmlFor="toStoreId">
              Para a loja
            </label>
            <select id="toStoreId" name="toStoreId" className="select" required defaultValue={others[0].id}>
              {others.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="label" htmlFor="itemId">
              Artigo
            </label>
            <select id="itemId" name="itemId" className="select" required defaultValue="">
              <option value="" disabled>
                Escolher artigo…
              </option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({stockAt(item, ctx.storeId).available} disponíveis aqui)
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="label" htmlFor="qty">
              Quantidade
            </label>
            <input id="qty" name="qty" className="input" inputMode="numeric" pattern="[0-9]*" required defaultValue="1" />
          </div>
          <div className="field">
            <label className="label" htmlFor="date">
              Data
            </label>
            <input id="date" name="date" type="date" className="input" defaultValue={today} max={today} required />
          </div>
          <p className="p small muted">Na loja de destino, as unidades ficam logo reservadas para as encomendas em espera.</p>
          <SubmitButton>Transferir</SubmitButton>
        </ActionForm>
      )}
    </main>
  );
}
