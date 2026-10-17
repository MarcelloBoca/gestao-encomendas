"use client";

import { useState } from "react";
import { signOut } from "firebase/auth";
import { clientAuth, firebaseConfigured } from "@/lib/firebase-client";

export default function LogoutButton() {
  const [busy, setBusy] = useState(false);
  async function logout() {
    setBusy(true);
    try {
      await fetch("/api/session", { method: "DELETE" });
      if (firebaseConfigured) await signOut(clientAuth()).catch(() => undefined);
    } finally {
      window.location.replace("/login");
    }
  }
  return (
    <button type="button" className="btn" onClick={logout} disabled={busy}>
      {busy ? "A sair…" : "Terminar sessão"}
    </button>
  );
}
