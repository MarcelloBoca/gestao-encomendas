"use client";

import { useEffect, useState } from "react";
import { GoogleAuthProvider, getRedirectResult, signInWithPopup, signInWithRedirect, type User } from "firebase/auth";
import { clientAuth, firebaseConfigured } from "@/lib/firebase-client";

async function startSession(user: User): Promise<string | null> {
  const idToken = await user.getIdToken(true);
  const response = await fetch("/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  if (response.ok) return null;
  const text = await response.text().catch(() => "");
  let body: { error?: string } | null = null;
  try {
    body = JSON.parse(text) as { error?: string };
  } catch {
    body = null;
  }
  if (body?.error) return body.error;
  const snippet = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
  return `Não foi possível iniciar sessão (erro ${response.status}${snippet ? `: ${snippet}` : ""}).`;
}

function friendlyError(error: unknown): string {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code: unknown }).code) : "";
  if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") return "";
  if (code === "auth/network-request-failed") return "Sem ligação à internet. Verifique a rede e tente de novo.";
  if (code === "auth/unauthorized-domain") return "Este endereço ainda não está autorizado no Firebase (Authentication › Settings › Authorized domains).";
  if (code === "auth/operation-not-allowed" || code === "auth/configuration-not-found") {
    return "O início de sessão com Google não está ativo no Firebase (Authentication › Sign-in method › Google).";
  }
  if (code === "auth/popup-blocked") return "O navegador bloqueou a janela do Google. Permita janelas para este site e tente de novo.";
  return "Não foi possível entrar com o Google. Tente de novo.";
}

export default function LoginClient({ next }: { next: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!firebaseConfigured) return;
    getRedirectResult(clientAuth())
      .then(async (result) => {
        if (!result) return;
        setBusy(true);
        const problem = await startSession(result.user);
        if (problem) {
          setError(problem);
          setBusy(false);
        } else {
          window.location.replace(next);
        }
      })
      .catch((e) => setError(friendlyError(e)));
  }, [next]);

  async function signIn() {
    setError("");
    setBusy(true);
    const auth = clientAuth();
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    try {
      const result = await signInWithPopup(auth, provider);
      const problem = await startSession(result.user);
      if (problem) {
        setError(problem);
        setBusy(false);
        return;
      }
      window.location.replace(next);
    } catch (e) {
      const code = typeof e === "object" && e && "code" in e ? String((e as { code: unknown }).code) : "";
      if (code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment") {
        await signInWithRedirect(auth, provider);
        return;
      }
      setError(friendlyError(e));
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <div className="stack">
        <span className="badge-icon big tone-ok" aria-hidden="true">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7l9-4 9 4v10l-9 4-9-4z" />
            <path d="M3 7l9 4 9-4M12 11v10" />
          </svg>
        </span>
        <h1 className="h1" style={{ marginTop: 12 }}>
          Encomendas
        </h1>
        <p className="p muted">Encomendas, pagamentos em parcelas e levantamentos da sua loja.</p>
      </div>

      {!firebaseConfigured ? (
        <p className="alert alert-warn" role="alert">
          A app ainda não está configurada: faltam as variáveis NEXT_PUBLIC_FIREBASE_* no Vercel.
        </p>
      ) : (
        <div className="stack-md">
          {error ? (
            <p className="alert alert-error" role="alert">
              {error}
            </p>
          ) : null}
          <button type="button" className="google-btn" onClick={signIn} disabled={busy}>
            <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.8 6C12.4 13.6 17.7 9.5 24 9.5z" />
              <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z" />
              <path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.2.8-4.7l-7.8-6C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.8-6z" />
              <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.8-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.8 6C6.6 42.6 14.6 48 24 48z" />
            </svg>
            {busy ? "A entrar…" : "Entrar com Google"}
          </button>
          <p className="hint">Use a conta Google com que foi convidado para o negócio.</p>
        </div>
      )}
    </main>
  );
}
