import Link from "next/link";

export default function NotFound() {
  return (
    <main className="login">
      <div className="stack">
        <h1 className="h1 sm">Não encontrado</h1>
        <p className="p muted">Esta página ou registo já não existe.</p>
      </div>
      <Link href="/" className="btn btn-primary">
        Ir para o início
      </Link>
    </main>
  );
}
