export const DEFAULT_TZ = "Africa/Maputo";

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MONTHS_LONG = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];
const WEEKDAYS = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];

/** Dia no formato AAAA-MM-DD no fuso indicado. */
export function isoDay(date: Date, tz: string = DEFAULT_TZ): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function todayIso(tz: string = DEFAULT_TZ): string {
  return isoDay(new Date(), tz);
}

export function isValidIsoDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

function parts(iso: string): [number, number, number] {
  const [y, m, d] = iso.split("-").map(Number);
  return [y, m, d];
}

/** "16 out" */
export function shortDay(iso: string): string {
  const [, m, d] = parts(iso);
  return `${d} ${MONTHS[m - 1]}`;
}

/** "16 out 2026" */
export function shortDayYear(iso: string): string {
  const [y, m, d] = parts(iso);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** "Sexta-feira, 16 de outubro" */
export function longDay(iso: string): string {
  const [y, m, d] = parts(iso);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${WEEKDAYS[weekday]}, ${d} de ${MONTHS_LONG[m - 1]}`;
}

/** "16 de outubro" */
export function dayMonth(iso: string): string {
  const [, m, d] = parts(iso);
  return `${d} de ${MONTHS_LONG[m - 1]}`;
}

export function shortDayFromMs(ms: number, tz: string = DEFAULT_TZ): string {
  return shortDay(isoDay(new Date(ms), tz));
}

export function timeFromMs(ms: number, tz: string = DEFAULT_TZ): string {
  return new Intl.DateTimeFormat("pt-PT", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(
    new Date(ms),
  );
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = parts(iso);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

/** Dias inteiros de `from` até `to` (ambos AAAA-MM-DD). */
export function daysBetween(from: string, to: string): number {
  const [y1, m1, d1] = parts(from);
  const [y2, m2, d2] = parts(to);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

function offsetMs(tz: string, atMs: number): number {
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(atMs));
  const get = (type: string) => Number(formatted.find((p) => p.type === type)?.value ?? "0");
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return asUtc - atMs;
}

/** Instante (ms) da meia-noite local do dia indicado. */
export function startOfDayMs(iso: string, tz: string = DEFAULT_TZ): number {
  const [y, m, d] = parts(iso);
  const guess = Date.UTC(y, m - 1, d);
  return guess - offsetMs(tz, guess);
}

export function firstOfMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

/** "hoje", "há 1 dia", "há 5 dias" */
export function agoLabel(days: number): string {
  if (days <= 0) return "hoje";
  return days === 1 ? "há 1 dia" : `há ${days} dias`;
}

/** Hora atual (0–23) no fuso indicado. */
export function hourNow(tz: string = DEFAULT_TZ): number {
  const hour = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(new Date());
  return Number(hour) % 24;
}
