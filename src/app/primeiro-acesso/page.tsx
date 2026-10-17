import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { hasAnyLogin } from "@/lib/server/data";
import { setupFirstAdmin } from "@/app/actions/auth";
import { ActionForm, SubmitButton } from "@/components/forms";
import { BackLink, Notice } from "@/components/ui";

export const metadata: Metadata = { title: "Primeiro acesso" };
export const dynamic = "force-dynamic";

export default async function FirstAccessPage() {
  if (await hasAnyLogin()) redirect("/login");
  const codeConfigured = Boolean(process.env.SETUP_CODE?.trim());

  return (
    <main className="screen narrow">
      <BackLink href="/login" label="Entrada" />
      <div className="stack" style={{ marginTop: -8 }}>
        <h1 className="h1 sm">Primeiro acesso</h1>
        <p className="p muted">
          Crie a conta da administradora da loja. Depois disso, é a administradora que cria as contas das outras pessoas em Definições.
        </p>
      </div>

      {!codeConfigured ? (
        <Notice tone="warn">Falta definir o código de configuração (SETUP_CODE) no Vercel. Defina-o e volte a abrir esta página.</Notice>
      ) : null}

      <div className="sheet pad">
        <ActionForm action={setupFirstAdmin}>
          <div className="field">
            <label className="label" htmlFor="code">
              Código de configuração
            </label>
            <input id="code" name="code" type="password" className="input" autoComplete="off" required maxLength={200} />
            <p className="hint">O código SETUP_CODE definido no Vercel. Só serve para criar esta primeira conta.</p>
          </div>
          <div className="field">
            <label className="label" htmlFor="name">
              O seu nome
            </label>
            <input id="name" name="name" className="input" autoComplete="name" required maxLength={80} />
          </div>
          <div className="field">
            <label className="label" htmlFor="username">
              Utilizador
            </label>
            <input
              id="username"
              name="username"
              className="input"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
              maxLength={32}
              placeholder="Ex.: fatima"
            />
            <p className="hint">3 a 32 caracteres: letras sem acentos, números, ponto, hífen ou sublinhado.</p>
          </div>
          <div className="field">
            <label className="label" htmlFor="password">
              Palavra-passe
            </label>
            <input id="password" name="password" type="password" className="input" autoComplete="new-password" required minLength={8} maxLength={128} />
            <p className="hint">Pelo menos 8 caracteres.</p>
          </div>
          <div className="field">
            <label className="label" htmlFor="confirm">
              Repetir a palavra-passe
            </label>
            <input id="confirm" name="confirm" type="password" className="input" autoComplete="new-password" required minLength={8} maxLength={128} />
          </div>
          <SubmitButton pendingText="A criar…" disabled={!codeConfigured}>
            Criar conta e entrar
          </SubmitButton>
        </ActionForm>
      </div>
    </main>
  );
}
