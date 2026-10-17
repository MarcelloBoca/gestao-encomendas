"use client";

import Link from "next/link";
import { useState } from "react";
import { login } from "@/app/actions/auth";
import { PendingProvider, SubmitButton, useSubmitAction } from "@/components/forms";

export default function LoginForm({ next, notice, firstAccess }: { next: string; notice?: string; firstAccess: boolean }) {
  const { state, pending, onSubmit } = useSubmitAction(login);
  const [show, setShow] = useState(false);
  const error = state.error;

  return (
    <main className="entry">
      <svg className="entry-deco" width="100%" height="100%" aria-hidden="true">
        <path d="M58 96 L60.5 106 L70 108.5 L60.5 111 L58 121 L55.5 111 L46 108.5 L55.5 106 Z" fill="#ECB0DC" fillOpacity="0.8" />
        <svg x="100%" y="0" overflow="visible">
          <path transform="translate(-54 360)" d="M0 0 L1.6 6.4 L8 8 L1.6 9.6 L0 16 L-1.6 9.6 L-8 8 L-1.6 6.4 Z" fill="#ECB0DC" fillOpacity="0.6" />
        </svg>
      </svg>

      <h1 className="visually-hidden">Sistema de Gestão de Loja</h1>

      <div className="entry-logo">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-solachic.png" alt="Sola.chic, Woman Footwear" width={260} height={260} />
      </div>

      <form onSubmit={onSubmit} className="entry-actions" noValidate>
        <PendingProvider pending={pending}>
          <input type="hidden" name="next" value={next} />
          {notice && !error ? (
            <p className="alert alert-rose" role="status">
              {notice}
            </p>
          ) : null}

          <div className="entry-field">
            <label htmlFor="username">Utilizador</label>
            <div className="entry-input">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 20.5a8 8 0 0 1 16 0" />
              </svg>
              <input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="Ex.: fatima"
                maxLength={64}
                required
              />
            </div>
          </div>

          <div className="entry-field">
            <label htmlFor="password">Palavra-passe</label>
            <div className={`entry-input${error ? " invalid" : ""}`}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="5" y="11" width="14" height="10" rx="2" />
                <path d="M8 11V8a4 4 0 0 1 8 0v3" />
              </svg>
              <input
                id="password"
                name="password"
                type={show ? "text" : "password"}
                autoComplete="current-password"
                placeholder="A sua palavra-passe"
                maxLength={128}
                required
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "login-erro" : undefined}
              />
              <button
                type="button"
                className="entry-eye"
                aria-label={show ? "Esconder palavra-passe" : "Mostrar palavra-passe"}
                aria-pressed={show}
                onClick={() => setShow((v) => !v)}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
                  <circle cx="12" cy="12" r="3" />
                  {show ? <path d="M4 4l16 16" /> : null}
                </svg>
              </button>
            </div>
          </div>

          {error ? (
            <p id="login-erro" className="alert alert-error" role="alert">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true" style={{ flex: "none", marginTop: 1 }}>
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7.5v5.5M12 16.5v.5" />
              </svg>
              {error}
            </p>
          ) : null}

          <SubmitButton className="btn btn-rose" pendingText="A entrar…">
            Entrar
          </SubmitButton>

          <p className="hint">Esqueceu-se da palavra-passe? Peça à administradora da loja para a repor.</p>
          {firstAccess ? (
            <Link href="/primeiro-acesso" className="entry-link">
              Primeiro acesso: criar a conta da administradora
            </Link>
          ) : null}
        </PendingProvider>
      </form>
    </main>
  );
}
