"use client";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const config = error.message?.startsWith("Configuração do Firebase");
  return (
    <main className="login">
      <div className="stack">
        <h1 className="h1 sm">Algo correu mal</h1>
        <p className="p muted">
          {config
            ? error.message
            : "Não foi possível carregar esta página. Verifique a ligação à internet e tente de novo."}
        </p>
      </div>
      <button type="button" className="btn btn-primary" onClick={() => reset()}>
        Tentar de novo
      </button>
      <a href="/" className="btn">
        Ir para o início
      </a>
    </main>
  );
}
