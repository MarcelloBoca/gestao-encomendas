import type { Metadata } from "next";
import Link from "next/link";
import { getContext } from "@/lib/session";
import { listCategories } from "@/lib/server/data";
import { saveItem } from "@/app/actions/stock";
import ItemFields from "@/components/ItemFields";
import { ActionForm, SubmitButton } from "@/components/forms";
import { BackLink } from "@/components/ui";

export const metadata: Metadata = { title: "Novo artigo" };

export default async function NewItemPage() {
  const ctx = await getContext();
  const categories = await listCategories(ctx.businessId);
  return (
    <main className="screen narrow">
      <BackLink href="/stock" label="Stock" />
      <h1 className="h1 sm" style={{ marginTop: -8 }}>
        Novo artigo
      </h1>
      <ActionForm action={saveItem}>
        <ItemFields categories={categories} />
        <SubmitButton>Criar artigo</SubmitButton>
      </ActionForm>
      {categories.length === 0 ? (
        <p className="p small muted">
          Ainda não há categorias. <Link href="/stock/categorias">Criar categorias</Link>
        </p>
      ) : null}
      <p className="p small muted">O stock começa a zero. Registe uma receção de mercadoria quando os artigos chegarem.</p>
    </main>
  );
}
