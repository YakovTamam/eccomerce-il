export const ORDER_STATUSES = [
  "pending_payment",
  "paid",
  "preparing",
  "ready",
  "shipped",
  "completed",
  "cancelled",
  "refunded",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const STATUS_LABELS: Record<OrderStatus, string> = {
  pending_payment: "ממתינה לתשלום",
  paid: "שולמה",
  preparing: "בהכנה",
  ready: "מוכנה",
  shipped: "נשלחה",
  completed: "הושלמה",
  cancelled: "בוטלה",
  refunded: "הוחזרה",
};

const NEXT: Record<OrderStatus, OrderStatus[]> = {
  pending_payment: ["paid", "cancelled"],
  paid: ["preparing", "ready", "shipped", "completed", "refunded"],
  preparing: ["ready", "shipped", "completed", "refunded"],
  ready: ["shipped", "completed", "refunded"],
  shipped: ["completed", "refunded"],
  completed: ["refunded"],
  cancelled: [],
  refunded: [],
};

export const canTransition = (from: OrderStatus, to: OrderStatus) =>
  NEXT[from].includes(to);

/** What the dashboard may set directly: `paid` only comes from a verified payment, `refunded` only from a real refund. */
export const manualTargets = (from: OrderStatus): OrderStatus[] =>
  NEXT[from].filter((s) => s !== "paid" && s !== "refunded");
