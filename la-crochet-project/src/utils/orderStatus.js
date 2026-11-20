// Friendly words and colours for order and payment statuses.

export const ORDER_STATUS = {
  pending: { label: "Order placed", className: "bg-blush text-berry-dark" },
  processing: { label: "Preparing", className: "status-amber" },
  ready_for_pickup: { label: "Ready for pickup", className: "status-blue" },
  shipped: { label: "On the way", className: "status-blue" },
  completed: { label: "Completed", className: "status-green" },
  cancelled: { label: "Cancelled", className: "bg-sand text-muted" },
};

export function orderStatus(status) {
  return ORDER_STATUS[status] ?? { label: status, className: "bg-sand text-ink" };
}

export function paymentText(order) {
  if (order.payment_method === "online") {
    if (order.payment_status === "paid") return "Paid online";
    if (order.payment_status === "refunded") return "Refunded";
    if (order.order_status === "cancelled") return "Payment not completed";
    return "Online payment not confirmed yet";
  }
  if (order.payment_status === "paid") return "Paid";
  return order.shipping_method === "pickup" ? "Pay at pickup" : "Cash on delivery";
}

// "My Orders" tabs. Each order belongs to exactly one tab (plus "All").
export function orderTab(order) {
  if (order.order_status === "cancelled") return "cancelled";
  if (order.order_status === "completed") return "completed";
  if (order.order_status === "shipped" || order.order_status === "ready_for_pickup") {
    return "to-receive";
  }
  if (order.payment_method === "online" && order.payment_status !== "paid") return "to-pay";
  return "to-ship"; // cash on delivery waiting to be sent, or paid online
}

export const ORDER_TABS = [
  { id: "all", label: "All" },
  { id: "to-pay", label: "To pay" },
  { id: "to-ship", label: "To ship" },
  { id: "to-receive", label: "To receive" },
  { id: "completed", label: "Completed" },
  { id: "cancelled", label: "Cancelled" },
];
