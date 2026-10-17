import { centsToInput } from "@/lib/money";
import type { Category, Item } from "@/lib/types";

/** Campos do formulário de artigo (usado dentro de um ActionForm). */
export default function ItemFields({ item, categories }: { item?: Item; categories: Category[] }) {
  const active = categories.filter((c) => !c.archived || c.id === item?.categoryId);
  return (
    <>
      {item ? <input type="hidden" name="itemId" value={item.id} /> : null}
      <div className="field">
        <label className="label" htmlFor="name">
          Nome
        </label>
        <input id="name" name="name" className="input" required maxLength={120} defaultValue={item?.name ?? ""} placeholder="Ex.: Fogão 4 bocas" />
      </div>
      <div className="field">
        <label className="label" htmlFor="categoryId">
          Categoria
        </label>
        <select id="categoryId" name="categoryId" className="select" defaultValue={item?.categoryId ?? ""}>
          <option value="">Sem categoria</option>
          {active.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label className="label" htmlFor="price">
          Preço predefinido (MT)
        </label>
        <input
          id="price"
          name="price"
          className="input money"
          inputMode="decimal"
          required
          defaultValue={item ? centsToInput(item.priceCents) : ""}
          placeholder="0,00"
        />
        <p className="hint">Em cada encomenda pode acordar outro preço.</p>
      </div>
    </>
  );
}
