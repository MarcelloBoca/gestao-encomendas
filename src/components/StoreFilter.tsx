import Link from "next/link";
import type { Store } from "@/lib/types";

/** Filtro de loja nos relatórios (links GET, funciona sem JavaScript). */
export default function StoreFilter({
  stores,
  current,
  hrefFor,
}: {
  stores: Store[];
  current: string;
  hrefFor: (loja: string) => string;
}) {
  if (stores.length <= 1) return null;
  return (
    <nav className="chip-row" aria-label="Loja">
      {stores.map((s) => (
        <Link key={s.id} href={hrefFor(s.id)} className="chip" aria-current={current === s.id ? "true" : undefined}>
          {s.name}
        </Link>
      ))}
      <Link href={hrefFor("todas")} className="chip" aria-current={current === "todas" ? "true" : undefined}>
        Todas as lojas
      </Link>
    </nav>
  );
}
