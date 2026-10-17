"use client";

import type { ActionState } from "@/lib/types";
import { PendingProvider, SubmitButton, useSubmitAction } from "./forms";

/** Um botão que chama uma ação do servidor, com o erro (se houver) logo abaixo. */
export default function InlineAction({
  action,
  fields,
  label,
  pendingText = "A gravar…",
  className = "btn btn-primary",
  confirmText,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  fields: Record<string, string>;
  label: React.ReactNode;
  pendingText?: string;
  className?: string;
  confirmText?: string;
}) {
  const { state, pending, onSubmit } = useSubmitAction(action, () => !confirmText || window.confirm(confirmText));
  return (
    <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <PendingProvider pending={pending}>
        <SubmitButton className={className} pendingText={pendingText}>
          {label}
        </SubmitButton>
      </PendingProvider>
      {state.error ? (
        <span role="alert" className="tiny strong due-text">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
