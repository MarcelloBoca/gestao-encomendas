import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireSessionUser } from "@/lib/session";
import { col } from "@/lib/server/repo";
import { changePassword } from "@/app/actions/auth";
import { ActionForm, SubmitButton } from "@/components/forms";
import { BackLink, Notice } from "@/components/ui";

export const metadata: Metadata = { title: "Palavra-passe" };
export const dynamic = "force-dynamic";

export default async function PasswordPage() {
  const session = await requireSessionUser();
  const snap = await col.users().doc(session.uid).get();
  if (!snap.exists) redirect("/sair");
  const forced = Boolean(snap.get("mustChangePassword"));
  const username = String(snap.get("username") ?? "");

  return (
    <main className="screen narrow">
      {forced ? null : <BackLink href="/definicoes" label="Definições" />}
      <div className="stack" style={{ marginTop: forced ? 24 : -8 }}>
        <h1 className="h1 sm">
          {forced ? "Escolha a sua " : "Mudar "}
          <span className="nowrap">palavra-passe</span>
        </h1>
        <p className="p muted">
          {forced
            ? "Entrou com uma palavra-passe temporária. Escolha uma só sua para continuar."
            : "Depois de mudar, as sessões abertas noutros aparelhos terminam."}
        </p>
      </div>

      {!username ? (
        <Notice tone="info">Esta conta ainda não tem utilizador. Peça à administradora da loja para criar uma conta para si.</Notice>
      ) : (
        <div className="sheet pad">
          <ActionForm action={changePassword}>
            <input type="text" name="username" value={username} autoComplete="username" readOnly hidden />
            {forced ? null : (
              <div className="field">
                <label className="label" htmlFor="current">
                  Palavra-passe atual
                </label>
                <input id="current" name="current" type="password" className="input" autoComplete="current-password" required maxLength={128} />
              </div>
            )}
            <div className="field">
              <label className="label" htmlFor="password">
                Nova palavra-passe
              </label>
              <input id="password" name="password" type="password" className="input" autoComplete="new-password" required minLength={8} maxLength={128} />
              <p className="hint">Pelo menos 8 caracteres. Evite datas de nascimento e o nome da loja.</p>
            </div>
            <div className="field">
              <label className="label" htmlFor="confirm">
                Repetir a nova palavra-passe
              </label>
              <input id="confirm" name="confirm" type="password" className="input" autoComplete="new-password" required minLength={8} maxLength={128} />
            </div>
            <SubmitButton pendingText="A guardar…">Guardar palavra-passe</SubmitButton>
          </ActionForm>
        </div>
      )}

      {forced ? (
        <a href="/sair" className="btn btn-text">
          Terminar sessão
        </a>
      ) : null}
    </main>
  );
}
