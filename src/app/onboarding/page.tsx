import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireSessionUser } from "@/lib/session";
import { col } from "@/lib/server/repo";
import { ActionForm, SubmitButton } from "@/components/forms";
import { acceptInvite, createBusiness } from "@/app/actions/settings";
import LogoutButton from "@/components/LogoutButton";

export const metadata: Metadata = { title: "Configurar" };

export default async function OnboardingPage() {
  const user = await requireSessionUser();
  const [userSnap, inviteSnap] = await Promise.all([
    col.users().doc(user.uid).get(),
    col.invites().doc(user.email.toLowerCase()).get(),
  ]);
  if (userSnap.exists && userSnap.get("businessId")) redirect("/");

  return (
    <main className="screen narrow">
      <div className="stack">
        <h1 className="h1 sm">Bem-vindo</h1>
        <p className="p muted">Entrou como {user.email}.</p>
      </div>

      {inviteSnap.exists ? (
        <section className="sheet pad" aria-labelledby="convite">
          <h2 id="convite" className="h2">
            Tem um convite
          </h2>
          <p className="p">
            {String(inviteSnap.get("invitedByName") || "Alguém")} convidou-o para{" "}
            <strong>{String(inviteSnap.get("businessName") || "um negócio")}</strong>.
          </p>
          <ActionForm action={acceptInvite}>
            <SubmitButton pendingText="A entrar…">Aceitar convite</SubmitButton>
          </ActionForm>
        </section>
      ) : (
        <section className="sheet pad" aria-labelledby="novo">
          <div className="stack">
            <h2 id="novo" className="h2">
              Criar o seu negócio
            </h2>
            <p className="p small muted">
              Se trabalha numa loja que já usa a app, peça para ser convidado com este email em vez de criar um negócio novo.
            </p>
          </div>
          <ActionForm action={createBusiness}>
            <div className="field">
              <label className="label" htmlFor="businessName">
                Nome do negócio
              </label>
              <input id="businessName" name="businessName" className="input" required maxLength={120} autoComplete="organization" />
            </div>
            <div className="field">
              <label className="label" htmlFor="storeName">
                Primeira loja
              </label>
              <input id="storeName" name="storeName" className="input" required maxLength={80} placeholder="Ex.: Loja Maputo" />
            </div>
            <div className="field">
              <label className="label" htmlFor="prefix">
                Prefixo dos números de encomenda
              </label>
              <input
                id="prefix"
                name="prefix"
                className="input"
                required
                maxLength={5}
                minLength={2}
                placeholder="Ex.: MAP"
                style={{ textTransform: "uppercase" }}
              />
              <p className="hint">As encomendas desta loja ficam numeradas MAP-0001, MAP-0002…</p>
            </div>
            <SubmitButton pendingText="A criar…">Criar negócio</SubmitButton>
          </ActionForm>
        </section>
      )}
      <LogoutButton />
    </main>
  );
}
