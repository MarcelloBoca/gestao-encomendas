import { formatMT } from "./money";

/** Só dígitos. */
export function normalizePhone(input: string | null | undefined): string {
  return String(input ?? "").replace(/\D/g, "");
}

/** "84 123 4567" para números moçambicanos de 9 dígitos; caso contrário devolve como está. */
export function formatPhone(phone: string): string {
  const digits = normalizePhone(phone);
  if (digits.length === 9) return `${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5)}`;
  if (digits.length === 12 && digits.startsWith("258")) {
    return `+258 ${digits.slice(3, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`;
  }
  return phone;
}

/** Número internacional para o WhatsApp (258 + 9 dígitos), ou null se não for possível. */
export function whatsappNumber(phone: string): string | null {
  const digits = normalizePhone(phone);
  if (digits.length === 9 && digits.startsWith("8")) return `258${digits}`;
  if (digits.length === 12 && digits.startsWith("258")) return digits;
  if (digits.length >= 10) return digits;
  return null;
}

export function whatsappLink(phone: string, text: string): string {
  const number = whatsappNumber(phone);
  const encoded = encodeURIComponent(text);
  return number ? `https://wa.me/${number}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
}

interface MessageOrder {
  number: string;
  customerName: string;
  totalCents: number;
  paidCents: number;
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

export function readyMessage(order: MessageOrder, storeName: string): string {
  const balance = Math.max(0, order.totalCents - order.paidCents);
  const payment =
    balance > 0 ? `Falta pagar ${formatMT(balance)} antes do levantamento.` : "Já está paga, pode vir levantar.";
  return `Olá ${firstName(order.customerName)}, a sua encomenda ${order.number} na ${storeName} está pronta. ${payment}`;
}

export function receiptMessage(
  order: MessageOrder,
  storeName: string,
  payment: { amountCents: number; methodLabel: string; dateLabel: string },
): string {
  const balance = Math.max(0, order.totalCents - order.paidCents);
  const tail = balance > 0 ? `Falta pagar: ${formatMT(balance)}.` : "A encomenda está paga.";
  return (
    `Olá ${firstName(order.customerName)}, confirmamos o pagamento de ${formatMT(payment.amountCents)} ` +
    `(${payment.methodLabel}, ${payment.dateLabel}) da encomenda ${order.number}. ` +
    `Total pago: ${formatMT(order.paidCents)} de ${formatMT(order.totalCents)}. ${tail} ${storeName}`
  );
}

export function reminderMessage(order: MessageOrder, storeName: string): string {
  const balance = Math.max(0, order.totalCents - order.paidCents);
  return `Olá ${firstName(order.customerName)}, a encomenda ${order.number} tem ${formatMT(balance)} por pagar. Pode pagar na ${storeName} ou por M-Pesa/e-Mola. Obrigado.`;
}
