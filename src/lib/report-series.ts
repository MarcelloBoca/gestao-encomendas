// Séries para os gráficos de relatórios (puras, testadas).

import { addDays, daysBetween } from "./dates";

export type PeriodId = "semana" | "mes" | "trimestre";

export const PERIODS: { id: PeriodId; label: string; days: number }[] = [
  { id: "semana", label: "Semana", days: 7 },
  { id: "mes", label: "Mês", days: 30 },
  { id: "trimestre", label: "3 meses", days: 91 },
];

const WEEKDAY_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const WEEKDAY_LONG = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function weekday(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function dayLabel(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

export function periodById(id: string | undefined): (typeof PERIODS)[number] {
  return PERIODS.find((p) => p.id === id) ?? PERIODS[0];
}

/** Primeiro e último dia do período, a terminar hoje. */
export function periodRange(period: PeriodId, today: string): { from: string; to: string } {
  const days = periodById(period).days;
  return { from: addDays(today, -(days - 1)), to: today };
}

export interface Bucket {
  from: string;
  to: string;
  /** Rótulo curto para o eixo ("Seg", "17", "6 out"). */
  label: string;
  /** Rótulo para texto corrido ("Sábado", "17 out", "semana de 6 out"). */
  longLabel: string;
  cents: number;
}

/**
 * Soma valores por dia (semana e mês) ou por semana (3 meses).
 * `entries` com valor negativo (reembolsos) descontam no respetivo dia.
 */
export function receivedBuckets(period: PeriodId, today: string, entries: { date: string; cents: number }[]): Bucket[] {
  const { from } = periodRange(period, today);
  const buckets: Bucket[] = [];
  if (period === "trimestre") {
    for (let start = from; start <= today; start = addDays(start, 7)) {
      const end = addDays(start, 6) > today ? today : addDays(start, 6);
      buckets.push({ from: start, to: end, label: dayLabel(start), longLabel: `semana de ${dayLabel(start)}`, cents: 0 });
    }
  } else {
    for (let day = from; day <= today; day = addDays(day, 1)) {
      const w = weekday(day);
      buckets.push({
        from: day,
        to: day,
        label: period === "semana" ? WEEKDAY_SHORT[w] : String(Number(day.slice(8))),
        longLabel: period === "semana" ? WEEKDAY_LONG[w] : dayLabel(day),
        cents: 0,
      });
    }
  }
  for (const entry of entries) {
    if (entry.date < from || entry.date > today) continue;
    const index = period === "trimestre" ? Math.floor(daysBetween(from, entry.date) / 7) : daysBetween(from, entry.date);
    const bucket = buckets[index];
    if (bucket) bucket.cents += entry.cents;
  }
  return buckets;
}

/** Valor "redondo" para o topo do eixo (1, 2, 3, 4, 5, 6 ou 8 × 10^n), sempre ≥ max. */
export function niceMax(maxCents: number): number {
  if (maxCents <= 0) return 100_000;
  const exponent = Math.pow(10, Math.floor(Math.log10(maxCents)));
  for (const step of [1, 2, 3, 4, 5, 6, 8, 10]) {
    if (step * exponent >= maxCents) return step * exponent;
  }
  return 10 * exponent;
}

/** Rótulo curto de eixo: "30 mil", "1,5 mil", "800". */
export function axisLabel(cents: number): string {
  const mt = cents / 100;
  if (mt >= 1000) {
    const thousands = Math.round((mt / 1000) * 10) / 10;
    return `${String(thousands).replace(".", ",")} mil`;
  }
  return String(Math.round(mt));
}

/** Partes inteiras que somam 100, pelo método do maior resto. */
export function percentages(values: number[]): number[] {
  const total = values.reduce((s, v) => s + Math.max(0, v), 0);
  if (total <= 0) return values.map(() => 0);
  const raw = values.map((v) => (Math.max(0, v) / total) * 100);
  const floors = raw.map(Math.floor);
  let rest = 100 - floors.reduce((s, v) => s + v, 0);
  const order = raw.map((v, i) => ({ i, frac: v - Math.floor(v) })).sort((a, b) => b.frac - a.frac);
  for (const { i } of order) {
    if (rest <= 0) break;
    floors[i] += 1;
    rest -= 1;
  }
  return floors;
}
