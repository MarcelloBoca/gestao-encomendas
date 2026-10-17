// Tipos partilhados entre servidor e cliente. Só dados simples (sem Timestamps do Firestore).

export type Fulfillment = "awaiting" | "ready" | "collected" | "cancelled";
export type FinancialStatus = "unpaid" | "partial" | "paid";

export type PaymentMethod = "numerario" | "mpesa" | "emola" | "mkesh" | "transferencia" | "outro";

export const PAYMENT_METHODS: { id: PaymentMethod; label: string }[] = [
  { id: "numerario", label: "Numerário" },
  { id: "mpesa", label: "M-Pesa" },
  { id: "emola", label: "e-Mola" },
  { id: "mkesh", label: "mKesh" },
  { id: "transferencia", label: "Transferência" },
  { id: "outro", label: "Outro" },
];

export function methodLabel(id: string): string {
  return PAYMENT_METHODS.find((m) => m.id === id)?.label ?? "Outro";
}

export interface Store {
  id: string;
  name: string;
  prefix: string;
  archived: boolean;
}

export interface Category {
  id: string;
  name: string;
  archived: boolean;
}

export interface StockLevel {
  physical: number;
  reserved: number;
}

export interface Item {
  id: string;
  name: string;
  categoryId: string | null;
  priceCents: number;
  archived: boolean;
  stock: Record<string, StockLevel>;
}

export interface OrderLine {
  id: string;
  itemId: string;
  name: string;
  priceCents: number;
  qty: number;
  reserved: number;
}

export interface Order {
  id: string;
  number: string;
  storeId: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  createdAtMs: number;
  createdDate: string;
  expectedDate: string | null;
  discountCents: number;
  subtotalCents: number;
  totalCents: number;
  paymentsCents: number;
  refundsCents: number;
  paidCents: number;
  retainedCents: number;
  fulfillment: Fulfillment;
  lines: OrderLine[];
  readyAtMs: number | null;
  collectedAtMs: number | null;
  collectedDate: string | null;
  collectedByName: string | null;
  collectedNote: string | null;
  cancelledAtMs: number | null;
  cancelReason: string | null;
  notes: string;
}

export interface Payment {
  id: string;
  orderId: string;
  orderNumber: string;
  storeId: string;
  amountCents: number;
  method: PaymentMethod;
  reference: string;
  note: string;
  date: string;
  status: "valid" | "reversed";
  reverseReason: string | null;
  byUid: string;
  byName: string;
  createdAtMs: number;
}

export interface Refund {
  id: string;
  orderId: string;
  orderNumber: string;
  storeId: string;
  amountCents: number;
  method: PaymentMethod;
  date: string;
  reason: string;
  byUid: string;
  byName: string;
  createdAtMs: number;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  notes: string;
}

export interface Member {
  uid: string;
  email: string;
  name: string;
}

export interface Invite {
  email: string;
  invitedByName: string;
  createdAtMs: number;
}

export type MovementType = "rececao" | "transferencia" | "ajuste" | "levantamento" | "anulacao";

export interface Movement {
  id: string;
  itemId: string;
  itemName: string;
  storeId: string;
  qty: number;
  type: MovementType;
  orderId: string | null;
  orderNumber: string | null;
  reason: string | null;
  date: string;
  atMs: number;
  byName: string;
}

export interface AuditEntry {
  id: string;
  kind: "correcao" | "edicao" | "utilizadores";
  action: string;
  label: string;
  orderId: string | null;
  orderNumber: string | null;
  storeId: string | null;
  reason: string | null;
  byName: string;
  atMs: number;
}

export interface ActionState {
  ok?: boolean;
  error?: string;
  message?: string;
}

export interface ReadyOrderInfo {
  id: string;
  number: string;
  customerName: string;
  customerPhone: string;
  totalCents: number;
  paidCents: number;
}

export interface ReceiptState extends ActionState {
  received?: { name: string; qty: number }[];
  ready?: ReadyOrderInfo[];
  storeName?: string;
}
