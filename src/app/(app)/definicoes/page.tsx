import type { Metadata } from "next";
import Link from "next/link";
import { getContext } from "@/lib/session";
import { listMembers } from "@/lib/server/data";
import {
  createAccount,
  removeUser,
  renameBusiness,
  resetPassword,
  saveStore,
  setStoreArchived,
  transferOwnership,
} from "@/app/actions/settings";
import Icon from "@/components/Icon";
import LogoutButton from "@/components/LogoutButton";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Avatar, BackLink } from "@/components/ui";

export const metadata: Metadata = { title: "Definições" };

export default async function SettingsPage() {
  const ctx = await getContext();
  const members = await listMembers(ctx.businessId);

  return (
    <main className="screen">
      <BackLink href="/" label="Início" />
      <div className="stack" style={{ marginTop: -8 }}>
        <h1 className="h1">Definições</h1>
        <p className="p muted">
          {ctx.name}, utilizador {ctx.email}
          {ctx.isOwner ? ", administradora" : ""}
        </p>
      </div>

      <section className="section" aria-labelledby="conta">
        <h2 id="conta" className="h2">
          A minha conta
        </h2>
        <div className="sheet">
          <Link href="/palavra-passe" className="row">
            <span className="badge-icon tone-rose" aria-hidden="true">
              <Icon name="lock" size={20} />
            </span>
            <span className="row-main">
              <span className="row-title">Mudar palavra-passe</span>
              <span className="row-sub">As sessões abertas noutros aparelhos terminam</span>
            </span>
            <span className="chev">
              <Icon name="chevron" size={18} stroke={2} />
            </span>
          </Link>
        </div>
      </section>

      <section className="section" aria-labelledby="utilizadores">
        <h2 id="utilizadores" className="h2">
          Contas
        </h2>
        <p className="p small muted" style={{ marginTop: -4 }}>
          {ctx.isOwner
            ? "Só a administradora cria contas, repõe palavras-passe e remove contas. Todas as contas veem todas as lojas."
            : "Só a administradora cria contas e repõe palavras-passe. Se se esquecer da sua, peça-lhe."}
        </p>
        <div className="sheet">
          {members.map((m) => {
            const isAdmin = m.uid === ctx.ownerUid;
            const label = m.name || m.username || "Sem nome";
            return (
              <div key={m.uid} className="line-card">
                <div className="inline" style={{ flexWrap: "nowrap" }}>
                  <Avatar name={label} solid={isAdmin} />
                  <span className="row-main">
                    <span className="row-title">
                      {label}
                      {m.uid === ctx.uid ? " (você)" : ""}
                    </span>
                    <span className="row-sub">
                      {m.username ? `Utilizador ${m.username}` : "Conta antiga do Google, já não consegue entrar"}
                      {isAdmin ? ", administradora" : ""}
                      {m.mustChangePassword ? ", ainda não escolheu a palavra-passe" : ""}
                    </span>
                  </span>
                </div>
                {ctx.isOwner && !isAdmin ? (
                  <details className="history" style={{ marginLeft: 54 }}>
                    <summary className="small" style={{ minHeight: 40, color: "var(--rosa-texto)" }}>
                      Gerir conta
                    </summary>
                    <div className="stack-md" style={{ gap: 12 }}>
                      {m.username ? (
                        <ActionForm action={resetPassword} resetOnSuccess>
                          <input type="hidden" name="uid" value={m.uid} />
                          <div className="field">
                            <label className="label" htmlFor={`reset-${m.uid}`}>
                              Nova palavra-passe temporária
                            </label>
                            <input
                              id={`reset-${m.uid}`}
                              name="password"
                              type="text"
                              className="input on-card"
                              autoComplete="off"
                              required
                              minLength={8}
                              maxLength={128}
                            />
                            <p className="hint">A pessoa entra com esta palavra-passe e escolhe logo uma nova.</p>
                          </div>
                          <SubmitButton className="btn btn-sm" pendingText="A guardar…">
                            Repor palavra-passe
                          </SubmitButton>
                        </ActionForm>
                      ) : null}
                      <div className="inline">
                        <ActionForm action={removeUser} className="inline" confirmText={`Remover a conta de ${label}? Deixa de conseguir entrar.`}>
                          <input type="hidden" name="uid" value={m.uid} />
                          <SubmitButton className="link-btn due-text" pendingText="A remover…">
                            Remover conta
                          </SubmitButton>
                        </ActionForm>
                        {m.username ? (
                          <ActionForm
                            action={transferOwnership}
                            className="inline"
                            confirmText={`Passar a administração para ${label}? Deixará de poder criar e remover contas.`}
                          >
                            <input type="hidden" name="uid" value={m.uid} />
                            <SubmitButton className="link-btn" pendingText="A transferir…">
                              Tornar administradora
                            </SubmitButton>
                          </ActionForm>
                        ) : null}
                      </div>
                    </div>
                  </details>
                ) : null}
              </div>
            );
          })}
        </div>

        {ctx.isOwner ? (
          <div className="sheet pad">
            <h3 className="h2" style={{ fontSize: 15 }}>
              Criar conta
            </h3>
            <ActionForm action={createAccount} resetOnSuccess>
              <div className="field">
                <label className="label" htmlFor="newName">
                  Nome
                </label>
                <input id="newName" name="name" className="input" required maxLength={80} autoComplete="off" placeholder="Ex.: Abel Mondlane" />
              </div>
              <div className="field">
                <label className="label" htmlFor="newUsername">
                  Utilizador
                </label>
                <input
                  id="newUsername"
                  name="username"
                  className="input"
                  required
                  maxLength={32}
                  autoComplete="off"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="Ex.: abel"
                />
                <p className="hint">3 a 32 caracteres: letras sem acentos, números, ponto, hífen ou sublinhado.</p>
              </div>
              <div className="field">
                <label className="label" htmlFor="newPassword">
                  Palavra-passe temporária
                </label>
                <input id="newPassword" name="password" type="text" className="input" required minLength={8} maxLength={128} autoComplete="off" />
                <p className="hint">Pelo menos 8 caracteres. Na primeira entrada, a pessoa tem de escolher uma palavra-passe só sua.</p>
              </div>
              <SubmitButton className="btn btn-primary" pendingText="A criar…">
                Criar conta
              </SubmitButton>
            </ActionForm>
          </div>
        ) : null}
      </section>

      <section className="section" aria-labelledby="negocio">
        <h2 id="negocio" className="h2">
          Negócio
        </h2>
        <div className="sheet pad">
          <ActionForm action={renameBusiness}>
            <div className="field">
              <label className="label" htmlFor="businessName">
                Nome
              </label>
              <input id="businessName" name="name" className="input" defaultValue={ctx.businessName} required maxLength={120} />
            </div>
            <p className="hint">Moeda: Meticais (MT). Fuso horário: {ctx.tz}.</p>
            <SubmitButton className="btn">Guardar nome</SubmitButton>
          </ActionForm>
        </div>
      </section>

      <section className="section" aria-labelledby="lojas">
        <h2 id="lojas" className="h2">
          Lojas
        </h2>
        <div className="sheet">
          {ctx.stores.map((store) => (
            <div key={store.id} className="line-card">
              <ActionForm action={saveStore} className="inline">
                <input type="hidden" name="storeId" value={store.id} />
                <label className="visually-hidden" htmlFor={`store-${store.id}`}>
                  Nome da loja {store.prefix}
                </label>
                <input
                  id={`store-${store.id}`}
                  name="name"
                  className="input"
                  defaultValue={store.name}
                  required
                  maxLength={80}
                  style={{ flex: 1, minWidth: 0 }}
                />
                <SubmitButton className="btn btn-sm">Guardar</SubmitButton>
              </ActionForm>
              <div className="between center">
                <span className="small muted">
                  Prefixo {store.prefix}
                  {store.archived ? ", arquivada" : ""}
                </span>
                <ActionForm
                  action={setStoreArchived}
                  className="inline"
                  confirmText={store.archived ? undefined : `Arquivar a ${store.name}? Deixa de aparecer na escolha de loja.`}
                >
                  <input type="hidden" name="storeId" value={store.id} />
                  <input type="hidden" name="archived" value={store.archived ? "0" : "1"} />
                  <SubmitButton className="link-btn" pendingText="A guardar…">
                    {store.archived ? "Reativar" : "Arquivar"}
                  </SubmitButton>
                </ActionForm>
              </div>
            </div>
          ))}
        </div>
        <div className="sheet pad">
          <h3 className="h2" style={{ fontSize: 15 }}>
            Nova loja
          </h3>
          <ActionForm action={saveStore}>
            <div className="field">
              <label className="label" htmlFor="newStoreName">
                Nome
              </label>
              <input id="newStoreName" name="name" className="input" required maxLength={80} placeholder="Ex.: Loja Matola" />
            </div>
            <div className="field">
              <label className="label" htmlFor="newStorePrefix">
                Prefixo
              </label>
              <input
                id="newStorePrefix"
                name="prefix"
                className="input"
                required
                minLength={2}
                maxLength={5}
                placeholder="Ex.: MAT"
                style={{ textTransform: "uppercase" }}
              />
            </div>
            <SubmitButton className="btn">Criar loja</SubmitButton>
          </ActionForm>
        </div>
      </section>

      <LogoutButton />
    </main>
  );
}
