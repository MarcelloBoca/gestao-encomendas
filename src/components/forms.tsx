"use client";

import { createContext, startTransition, useActionState, useContext, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/lib/types";

const PendingContext = createContext(false);

export function PendingProvider({ pending, children }: { pending: boolean; children: React.ReactNode }) {
  return <PendingContext.Provider value={pending}>{children}</PendingContext.Provider>;
}

/**
 * Envia o formulário para uma ação do servidor sem o limpar quando a ação devolve um erro
 * (o que o React faz por omissão com `<form action>`). `before` pode cancelar o envio.
 */
export function useSubmitAction(
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>,
  before?: (form: HTMLFormElement) => boolean,
) {
  const [state, dispatch, pending] = useActionState(action, {} as ActionState);
  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    if (before && !before(form)) return;
    const formData = new FormData(form);
    startTransition(() => dispatch(formData));
  };
  return { state, pending, onSubmit };
}

export function SubmitButton({
  children,
  pendingText = "A gravar…",
  className = "btn btn-primary",
  disabled = false,
}: {
  children: React.ReactNode;
  pendingText?: string;
  className?: string;
  disabled?: boolean;
}) {
  const status = useFormStatus();
  const providerPending = useContext(PendingContext);
  const pending = status.pending || providerPending;
  return (
    <button type="submit" className={className} disabled={pending || disabled} aria-disabled={pending || disabled}>
      {pending ? pendingText : children}
    </button>
  );
}

export function FormAlert({ state }: { state: ActionState }) {
  if (state.error) {
    return (
      <p className="alert alert-error" role="alert">
        {state.error}
      </p>
    );
  }
  if (state.message) {
    return (
      <p className="alert alert-ok" role="status">
        {state.message}
      </p>
    );
  }
  return null;
}

/** Formulário ligado a uma ação do servidor, com mensagem de erro ou sucesso no topo. */
export function ActionForm({
  action,
  children,
  className = "stack-md",
  confirmText,
  resetOnSuccess = false,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  children: React.ReactNode;
  className?: string;
  confirmText?: string;
  resetOnSuccess?: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const { state, pending, onSubmit } = useSubmitAction(action, () => !confirmText || window.confirm(confirmText));
  useEffect(() => {
    if (resetOnSuccess && state.ok) formRef.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form ref={formRef} onSubmit={onSubmit} className={className}>
      <PendingProvider pending={pending}>
        <FormAlert state={state} />
        {children}
      </PendingProvider>
    </form>
  );
}
