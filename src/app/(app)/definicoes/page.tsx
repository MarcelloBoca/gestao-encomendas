import type { Metadata } from "next";
import { getContext } from "@/lib/session";
import { listInvites, listMembers } from "@/lib/server/data";
import {
  cancelInvite,
  inviteUser,
  removeUser,
  renameBusiness,
  saveStore,
  setStoreArchived,
  transferOwnership,
} from "@/app/actions/settings";
import LogoutButton from "@/components/LogoutButton";
import { ActionForm, SubmitButton } from "@/components/forms";
import { BackLink, initials } from "@/components/ui";

export const metadata: Metadata = { title: "Definições" };

export default async function SettingsPage() {
  const ctx = await getContext();
  const [members, invites] = await Promise.all([listMembers(ctx.businessId), listInvites(ctx.businessId)]);

  return (
    <main className="screen">
      <BackLink href="/" label="Início" />
      <div className="stack" style={{ marginTop: -8 }}>
        <h1 className="h1">Definições</h1>
        <p className="p muted">
          {ctx.name} ({ctx.email}){ctx.isOwner ? ", proprietário" : ""}
        </p>
      </div>

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

      <section className="section" aria-labelledby="utilizadores">
        <h2 id="utilizadores" className="h2">
          Utilizadores
        </h2>
        <p className="p small muted" style={{ marginTop: -4 }}>
          Todos têm as mesmas permissões e acesso a todas as lojas. Só o proprietário remove utilizadores.
        </p>
        <div className="sheet">
          {members.map((m) => {
            const isOwner = m.uid === ctx.ownerUid;
            return (
              <div key={m.uid} className="line-card">
                <div className="inline" style={{ flexWrap: "nowrap" }}>
                  <span className="avatar" aria-hidden="true">
                    {initials(m.name || m.email)}
                  </span>
                  <span className="row-main">
                    <span className="row-title" style={{ fontSize: 15 }}>
                      {m.name || m.email}
                      {m.uid === ctx.uid ? " (você)" : ""}
                    </span>
                    <span className="row-sub">
                      {m.email}
                      {isOwner ? ", proprietário" : ""}
                    </span>
                  </span>
                </div>
                {ctx.isOwner && !isOwner ? (
                  <div className="inline">
                    <ActionForm action={removeUser} className="inline" confirmText={`Remover ${m.name || m.email} do negócio?`}>
                      <input type="hidden" name="uid" value={m.uid} />
                      <SubmitButton className="link-btn" pendingText="A remover…">
                        Remover
                      </SubmitButton>
                    </ActionForm>
                    <ActionForm
                      action={transferOwnership}
                      className="inline"
                      confirmText={`Passar a propriedade do negócio para ${m.name || m.email}? Deixará de poder remover utilizadores.`}
                    >
                      <input type="hidden" name="uid" value={m.uid} />
                      <SubmitButton className="link-btn" pendingText="A transferir…">
                        Tornar proprietário
                      </SubmitButton>
                    </ActionForm>
                  </div>
                ) : null}
              </div>
            );
          })}
          {invites.map((invite) => (
            <div key={invite.email} className="row">
              <span className="row-main">
                <span className="row-title" style={{ fontSize: 15 }}>
                  {invite.email}
                </span>
                <span className="row-sub">Convite pendente{invite.invitedByName ? `, enviado por ${invite.invitedByName}` : ""}</span>
              </span>
              <ActionForm action={cancelInvite} className="inline">
                <input type="hidden" name="email" value={invite.email} />
                <SubmitButton className="link-btn" pendingText="A cancelar…">
                  Cancelar
                </SubmitButton>
              </ActionForm>
            </div>
          ))}
        </div>
        <div className="sheet pad">
          <h3 className="h2" style={{ fontSize: 15 }}>
            Convidar
          </h3>
          <ActionForm action={inviteUser}>
            <div className="field">
              <label className="label" htmlFor="inviteEmail">
                Email da conta Google
              </label>
              <input id="inviteEmail" name="email" type="email" className="input" required autoComplete="off" placeholder="nome@gmail.com" />
              <p className="hint">A pessoa entra no negócio quando iniciar sessão na app com esta conta Google.</p>
            </div>
            <SubmitButton className="btn">Criar convite</SubmitButton>
          </ActionForm>
        </div>
      </section>

      <LogoutButton />
    </main>
  );
}
