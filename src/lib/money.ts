// Valores em centavos (inteiros). 1 MT = 100 centavos.

const NBSP = " ";

export function formatCents(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const units = Math.floor(abs / 100);
  const decimals = String(abs % 100).padStart(2, "0");
  const grouped = String(units).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  return `${negative ? "−" : ""}${grouped},${decimals}`;
}

export function formatMT(cents: number): string {
  return `${formatCents(cents)}${NBSP}MT`;
}

/**
 * Lê um valor escrito pelo utilizador ("4 500,00", "4500", "4.500,5", "120.50") e devolve centavos.
 * Devolve null quando o texto não é um valor válido.
 */
export function parseMoney(input: string | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  const raw = String(input)
    .replace(/[\s  ]/g, "")
    .replace(/MT$/i, "");
  if (!raw) return null;

  let normalized: string;
  if (raw.includes(",")) {
    normalized = raw.replace(/\./g, "").replace(",", ".");
  } else if (/^\d+\.\d{1,2}$/.test(raw)) {
    normalized = raw;
  } else {
    normalized = raw.replace(/\./g, "");
  }

  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}

/** Formato para preencher um campo de texto (sem espaço inseparável). */
export function centsToInput(cents: number): string {
  return formatCents(cents).replace(/ /g, " ");
}
