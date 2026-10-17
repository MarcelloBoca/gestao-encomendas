// Componentes de apresentação sem estado (podem ser usados no servidor e no cliente).

import Link from "next/link";
import Icon from "./Icon";
import { balanceOf, financialStatus, paidPercent } from "@/lib/domain";
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

const FUL_TAG: Record<Fulfillment, { className: string; icon: "clock" | "bag" | "check" | "close" }> = {
  awaiting: { className: "wait-text", icon: "clock" },
  ready: { className: "ready-text", icon: "bag" },
  collected: { className: "muted", icon: "check" },
  cancelled: { className: "muted", icon: "close" },
};

/** Estado da mercadoria com ícone, para cartões de encomenda. */
export function FulTag({ fulfillment }: { fulfillment: Fulfillment }) {
  const tag = FUL_TAG[fulfillment];
  return (
    <span className={`tag ${tag.className}`}>
      <Icon name={tag.icon} size={14} stroke={2.2} />
      {FUL_LABEL[fulfillment].short}
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

/** Barra de progresso do pagamento: verde quando paga, âmbar quando parcial. */
export function PayProgress({ totalCents, paidCents }: { totalCents: number; paidCents: number }) {
  const percent = paidPercent(totalCents, paidCents);
  const paid = balanceOf(totalCents, paidCents) === 0;
  return (
    <span className="progress" aria-hidden="true">
      {percent > 0 ? <span className={paid ? "fill-paid" : "fill-partial"} style={{ width: `${Math.max(percent, 3)}%` }} /> : null}
    </span>
  );
}

/** Anel de progresso em SVG. */
export function Ring({
  size,
  stroke,
  percent,
  color,
  label,
  children,
}: {
  size: number;
  stroke: number;
  percent: number;
  color: string;
  label: string;
  children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const filled = Math.max(0, Math.min(1, percent / 100)) * c;
  const mid = size / 2;
  return (
    <svg className="ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} style={{ flex: "none" }}>
      <circle cx={mid} cy={mid} r={r} fill="none" stroke="#F0E7EC" strokeWidth={stroke} />
      {filled > 0 ? (
        <circle
          cx={mid}
          cy={mid}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${filled.toFixed(1)} ${c.toFixed(1)}`}
          transform={`rotate(-90 ${mid} ${mid})`}
        />
      ) : null}
      {children}
    </svg>
  );
}

const AVATAR_TONES = ["tone-rose", "tone-ready", "tone-owed", "tone-wait", "tone-due", "tone-ok"];

export function Avatar({ name, solid = false }: { name: string; solid?: boolean }) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span className={`avatar ${solid ? "solid" : AVATAR_TONES[hash % AVATAR_TONES.length]}`} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="back">
      <Icon name="back" size={22} stroke={2.2} />
      {label}
    </Link>
  );
}

/** Cabeçalho com "Cancelar" à esquerda e título ao centro. */
export function TitleBar({ cancelHref, title }: { cancelHref: string; title: string }) {
  return (
    <div className="top-title">
      <Link href={cancelHref} className="back plain">
        Cancelar
      </Link>
      <h1 className="h1 title">{title}</h1>
      <span />
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="empty">{children}</p>;
}

export function Notice({ tone, children }: { tone: "ok" | "warn" | "info" | "error" | "rose"; children: React.ReactNode }) {
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
