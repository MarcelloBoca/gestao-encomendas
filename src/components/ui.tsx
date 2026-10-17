// Componentes de apresentação sem estado (podem ser usados no servidor e no cliente).

import Link from "next/link";
import Icon from "./Icon";
import { financialStatus } from "@/lib/domain";
import { formatCents, formatMT } from "@/lib/money";
import type { FinancialStatus, Fulfillment, Order } from "@/lib/types";

const FIN_LABEL: Record<FinancialStatus, { short: string; long: string }> = {
  unpaid: { short: "Por pagar", long: "Por pagar" },
  partial: { short: "Parcial", long: "Parcialmente paga" },
  paid: { short: "Paga", long: "Paga" },
};

const FUL_LABEL: Record<Fulfillment, { short: string; long: string }> = {
  awaiting: { short: "A aguardar", long: "A aguardar mercadoria" },
  ready: { short: "Pronta", long: "Pronta para levantar" },
  collected: { short: "Levantada", long: "Levantada" },
  cancelled: { short: "Cancelada", long: "Cancelada" },
};

export function FinPill({ order, long = false }: { order: Pick<Order, "totalCents" | "paidCents">; long?: boolean }) {
  const status = financialStatus(order.totalCents, order.paidCents);
  return <span className={`pill pill-${status}${long ? " lg" : ""}`}>{long ? FIN_LABEL[status].long : FIN_LABEL[status].short}</span>;
}

export function FulPill({ fulfillment, long = false }: { fulfillment: Fulfillment; long?: boolean }) {
  return (
    <span className={`pill pill-${fulfillment}${long ? " lg" : ""}`}>
      {long ? FUL_LABEL[fulfillment].long : FUL_LABEL[fulfillment].short}
    </span>
  );
}

export function fulfillmentLabel(fulfillment: Fulfillment): string {
  return FUL_LABEL[fulfillment].long;
}

export function Money({ cents, unit = true }: { cents: number; unit?: boolean }) {
  return <span className="tnum nowrap">{unit ? formatMT(cents) : formatCents(cents)}</span>;
}

export function BigMoney({ cents, tone, size }: { cents: number; tone?: "owed"; size?: "md" }) {
  return (
    <p className={`money-big${tone ? ` ${tone}` : ""}${size ? ` ${size}` : ""}`}>
      {formatCents(cents)} <span className="unit">MT</span>
    </p>
  );
}

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="back">
      <Icon name="back" size={22} stroke={2} />
      {label}
    </Link>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="empty">{children}</p>;
}

export function Notice({ tone, children }: { tone: "ok" | "warn" | "info" | "error"; children: React.ReactNode }) {
  return (
    <p className={`alert alert-${tone}`} role={tone === "error" ? "alert" : "status"}>
      {children}
    </p>
  );
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return ((parts[0][0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "")).toUpperCase();
}
