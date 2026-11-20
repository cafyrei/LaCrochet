import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext, useSearchParams } from "react-router";
import { bookRider, cancelRider, getAllOrders, refreshRider, updateOrder } from "../../api/admin";
import AdminPageHeader, { LoadError } from "../../components/admin/AdminPageHeader";
import { CloseIcon, SearchIcon } from "../../components/Icons";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { formatDate, formatPrice } from "../../utils/format";
import { orderStatus, paymentText } from "../../utils/orderStatus";
import { riderActive, riderStatusText } from "../../utils/riderStatus";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "pending", label: "Order placed" },
  { id: "processing", label: "Preparing" },
  { id: "ready_for_pickup", label: "Ready for pickup" },
  { id: "shipped", label: "On the way" },
  { id: "completed", label: "Completed" },
  { id: "cancelled", label: "Cancelled" },
];

// The one obvious next step for an order, if there is one.
function nextStep(order) {
  switch (order.order_status) {
    case "pending":
      if (isWaitingForPayment(order)) return null;
      return { status: "processing", label: "Start preparing" };
    case "processing":
      return order.shipping_method === "pickup"
        ? { status: "ready_for_pickup", label: "Ready for pickup" }
        : { status: "shipped", label: "Mark as shipped" };
    case "ready_for_pickup":
      return { status: "completed", label: "Picked up" };
    case "shipped":
      return { status: "completed", label: "Delivered" };
    default:
      return null;
  }
}

const isWaitingForPayment = (order) =>
  order.order_status === "pending" && order.payment_method === "online" && order.payment_status !== "paid";

const canCancel = (order) => ["pending", "processing", "ready_for_pickup"].includes(order.order_status);

const itemSummary = (order) => {
  const count = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const first = order.items[0]?.product_name ?? "";
  return order.items.length > 1 ? `${first} and ${order.items.length - 1} more (${count} items)` : `${first} × ${count}`;
};

// Saving a change to one order (status, payment) with its own busy/error state.
function useOrderChange(order, onUpdated) {
  const { token } = useAuth();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function change(changes) {
    setBusy(true);
    setError("");
    try {
      const updated = await updateOrder(token, order.order_number, changes);
      onUpdated(updated);
      toast(
        changes.order_status
          ? `${order.order_number} is now "${orderStatus(updated.order_status).label}"`
          : `Saved ${order.order_number}`
      );
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  return { busy, error, change };
}

export default function AdminOrdersPage() {
  const { token } = useAuth();
  const { refreshCounts } = useOutletContext();
  const [params, setParams] = useSearchParams();
  const [orders, setOrders] = useState(null); // null = loading
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  // The filter and the open order live in the address, so the dashboard can link
  // straight to them and the back button works.
  const filter = params.get("status") ?? "all";
  const openNumber = params.get("order");

  const setParam = useCallback(
    (key, value) =>
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          if (value) next.set(key, value);
          else next.delete(key);
          return next;
        },
        { replace: key === "status" }
      ),
    [setParams]
  );

  const load = useCallback(() => {
    setError("");
    getAllOrders(token)
      .then(setOrders)
      .catch((err) => setError(err.message));
  }, [token]);

  useEffect(load, [load]);

  const counts = useMemo(() => {
    const result = { all: orders?.length ?? 0 };
    for (const order of orders ?? []) result[order.order_status] = (result[order.order_status] ?? 0) + 1;
    return result;
  }, [orders]);

  const visible = useMemo(() => {
    const words = search.trim().toLowerCase();
    return (orders ?? [])
      .filter((order) => filter === "all" || order.order_status === filter)
      .filter(
        (order) =>
          !words ||
          order.order_number.toLowerCase().includes(words) ||
          order.customer_name.toLowerCase().includes(words) ||
          order.phone.includes(words)
      );
  }, [orders, filter, search]);

  const openOrder = orders?.find((order) => order.order_number === openNumber) ?? null;

  function replaceOrder(updated) {
    setOrders((current) =>
      current.map((order) => (order.order_number === updated.order_number ? updated : order))
    );
    refreshCounts();
  }

  return (
    <>
      <AdminPageHeader title="Orders" description="Move each order along as you prepare, send and finish it." />

      {error ? (
        <LoadError message={error} onRetry={load} />
      ) : orders === null ? (
        <p className="py-16 text-center text-muted">Loading orders…</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div role="tablist" aria-label="Filter orders by status" className="scroll-row -mx-4 gap-2 px-4 pb-1 sm:mx-0 sm:px-0">
              {FILTERS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={item.id === filter}
                  onClick={() => setParam("status", item.id === "all" ? null : item.id)}
                  className="chip"
                >
                  {item.label}
                  {(counts[item.id] ?? 0) > 0 && <span className="opacity-60 tabular-nums">{counts[item.id]}</span>}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-72">
              <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Order number, name or phone"
                aria-label="Search orders"
                className="input rounded-full py-2 pl-10"
              />
            </div>
          </div>

          {visible.length === 0 ? (
            <p className="card mt-5 px-6 py-12 text-center text-muted">
              {orders.length === 0 ? "No orders yet. They'll show up here as customers check out." : "No orders match."}
            </p>
          ) : (
            <div className="card mt-5 overflow-hidden">
              <div className="hidden grid-cols-[9rem_minmax(0,1fr)_7rem_11rem_10rem] gap-4 border-b border-line px-5 py-3 text-sm font-semibold text-muted md:grid">
                <span>Order</span>
                <span>Customer</span>
                <span className="text-right">Total</span>
                <span>Status</span>
                <span className="sr-only">Next step</span>
              </div>
              <ul className="divide-y divide-line">
                {visible.map((order) => (
                  <OrderRow
                    key={order.order_number}
                    order={order}
                    selected={order.order_number === openNumber}
                    onOpen={() => setParam("order", order.order_number)}
                    onUpdated={replaceOrder}
                  />
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {openOrder && (
        <OrderPanel order={openOrder} onClose={() => setParam("order", null)} onUpdated={replaceOrder} />
      )}
    </>
  );
}

function OrderRow({ order, selected, onOpen, onUpdated }) {
  const { busy, error, change } = useOrderChange(order, onUpdated);
  const status = orderStatus(order.order_status);
  const step = nextStep(order);

  return (
    <li
      onClick={(event) => !event.target.closest("button, a") && onOpen()}
      className={`grid cursor-pointer gap-x-4 gap-y-1 px-5 py-4 transition-colors md:grid-cols-[9rem_minmax(0,1fr)_7rem_11rem_10rem] md:items-center ${
        selected ? "bg-blush/50" : "hover:bg-sand/50"
      }`}
    >
      <div className="flex items-baseline justify-between gap-3 md:block">
        <button type="button" onClick={onOpen} className="cursor-pointer font-bold hover:text-berry">
          {order.order_number}
        </button>
        <p className="text-xs text-muted">{formatDate(order.created_at)}</p>
      </div>

      <div className="min-w-0">
        <p className="truncate font-semibold">{order.customer_name}</p>
        <p className="truncate text-sm text-muted">{itemSummary(order)}</p>
      </div>

      <p className="font-bold tabular-nums md:text-right">{formatPrice(order.total)}</p>

      <div>
        <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${status.className}`}>
          {status.label}
        </span>
        <p className={`mt-1 text-xs ${order.payment_status === "paid" ? "text-success" : "text-muted"}`}>
          {order.shipping_method === "pickup" ? "Pickup" : "Delivery"},{" "}
          {order.payment_status === "paid" ? "paid" : paymentText(order).toLowerCase()}
        </p>
        {order.lalamove_status && (
          <p className="text-xs text-muted">Lalamove: {riderStatusText(order.lalamove_status).toLowerCase()}</p>
        )}
      </div>

      <div className="mt-2 md:mt-0 md:text-right">
        {step ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => change({ order_status: step.status })}
            className="btn-primary btn-small w-full md:w-auto"
          >
            {busy ? "Saving…" : step.label}
          </button>
        ) : isWaitingForPayment(order) ? (
          <span className="text-xs text-muted">Waiting for payment</span>
        ) : null}
        {error && (
          <p role="alert" className="mt-1 text-xs text-berry">
            {error}
          </p>
        )}
      </div>
    </li>
  );
}

// Everything about one order, sliding in from the right.
function OrderPanel({ order, onClose, onUpdated }) {
  const { busy, error, change } = useOrderChange(order, onUpdated);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const closeRef = useRef(null);
  const status = orderStatus(order.order_status);
  const step = nextStep(order);

  useEffect(() => {
    closeRef.current?.focus();
    setConfirmingCancel(false);
  }, [order.order_number]);

  useEffect(() => {
    const close = (event) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [onClose]);

  const address = [order.ship_street, order.ship_barangay, order.ship_city, order.ship_province, order.ship_postal_code]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      <div className="absolute inset-0 bg-shade/30" onClick={onClose} aria-hidden="true" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-panel-title"
        className="relative flex h-full w-full max-w-md flex-col bg-card shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-6 py-5">
          <div>
            <h2 id="order-panel-title" className="font-sans text-lg font-bold">
              {order.order_number}
            </h2>
            <p className="text-sm text-muted">{formatDate(order.created_at)}</p>
            <span className={`mt-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${status.className}`}>
              {status.label}
            </span>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="cursor-pointer rounded-full p-1.5 text-muted hover:bg-sand hover:text-ink"
          >
            <CloseIcon />
          </button>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5 text-sm">
          <section>
            <h3 className="font-sans text-xs font-bold text-muted">Items</h3>
            <ul className="mt-2 divide-y divide-line">
              {order.items.map((item, index) => (
                <li key={index} className="flex justify-between gap-4 py-2">
                  <span>
                    {item.product_name}
                    <span className="block text-xs text-muted">
                      {formatPrice(item.unit_price)} × {item.quantity}
                    </span>
                  </span>
                  <span className="font-semibold tabular-nums">{formatPrice(item.line_total)}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-2 space-y-1 border-t border-line pt-3">
              <div className="flex justify-between text-muted">
                <dt>Subtotal</dt>
                <dd className="tabular-nums">{formatPrice(order.subtotal)}</dd>
              </div>
              <div className="flex justify-between text-muted">
                <dt>Shipping</dt>
                <dd className="tabular-nums">{order.shipping_fee > 0 ? formatPrice(order.shipping_fee) : "Free"}</dd>
              </div>
              <div className="flex justify-between text-base font-bold">
                <dt>Total</dt>
                <dd className="tabular-nums">{formatPrice(order.total)}</dd>
              </div>
            </dl>
          </section>

          <section>
            <h3 className="font-sans text-xs font-bold text-muted">Customer</h3>
            <p className="mt-2 font-semibold">{order.customer_name}</p>
            <p>
              <a href={`tel:${order.phone}`} className="link font-normal">
                {order.phone}
              </a>
            </p>
            <p>
              <a href={`mailto:${order.email}`} className="link font-normal">
                {order.email}
              </a>
            </p>
          </section>

          <section>
            <h3 className="font-sans text-xs font-bold text-muted">
              {order.shipping_method === "delivery" ? "Deliver to" : "Pickup"}
            </h3>
            <p className="mt-2">{order.shipping_method === "delivery" ? address : "The customer collects it at the shop."}</p>
            {order.ship_lat != null && order.ship_lng != null && (
              <a
                href={`https://www.google.com/maps?q=${order.ship_lat},${order.ship_lng}`}
                target="_blank"
                rel="noreferrer"
                className="link mt-1 inline-block text-xs"
              >
                See their map pin
              </a>
            )}
          </section>

          {order.shipping_method === "delivery" && <RiderSection order={order} onUpdated={onUpdated} />}

          <section>
            <h3 className="font-sans text-xs font-bold text-muted">Payment</h3>
            <p className={`mt-2 ${order.payment_status === "paid" ? "font-semibold text-success" : ""}`}>
              {order.payment_status === "paid"
                ? order.payment_method === "online"
                  ? "Paid online"
                  : "Paid"
                : paymentText(order)}
            </p>
          </section>

          {order.notes && (
            <section>
              <h3 className="font-sans text-xs font-bold text-muted">Notes</h3>
              <p className="mt-2 whitespace-pre-line">{order.notes}</p>
            </section>
          )}
        </div>

        <footer className="space-y-2 border-t border-line bg-cream/60 px-6 py-4">
          {error && (
            <p role="alert" className="alert-error">
              {error}
            </p>
          )}
          {isWaitingForPayment(order) && (
            <p className="text-sm text-muted">You can start preparing once the online payment goes through.</p>
          )}
          {step && (
            <button
              type="button"
              disabled={busy}
              onClick={() => change({ order_status: step.status })}
              className="btn-primary w-full"
            >
              {step.label}
            </button>
          )}
          {order.payment_status !== "paid" && order.order_status !== "cancelled" && (
            <button
              type="button"
              disabled={busy}
              onClick={() => change({ payment_status: "paid" })}
              className="btn-secondary w-full"
            >
              Mark as paid
            </button>
          )}
          {canCancel(order) &&
            (confirmingCancel ? (
              <div className="rounded-xl border border-berry/30 bg-blush/60 p-3 text-sm">
                <p className="font-semibold">Cancel this order?</p>
                <p className="text-muted">The items go back into stock. This can't be undone.</p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={async () => (await change({ order_status: "cancelled" })) && setConfirmingCancel(false)}
                    className="cursor-pointer rounded-full bg-berry px-3 py-1.5 text-xs font-bold text-on-berry hover:bg-berry-dark"
                  >
                    Yes, cancel it
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingCancel(false)}
                    className="cursor-pointer rounded-full px-3 py-1.5 text-xs font-bold hover:bg-sand"
                  >
                    Keep it
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmingCancel(true)}
                className="btn-quiet w-full text-berry"
              >
                Cancel order
              </button>
            ))}
          {order.order_status === "cancelled" && (
            <p className="text-center text-sm text-muted">This order was cancelled. Its items went back into stock.</p>
          )}
          {order.order_status === "completed" && order.payment_status === "paid" && (
            <p className="text-center text-sm text-muted">This order is finished.</p>
          )}
        </footer>
      </aside>
    </div>
  );
}

// Booking and following the Lalamove rider for one delivery order.
function RiderSection({ order, onUpdated }) {
  const { token } = useAuth();
  const [rider, setRider] = useState(null);
  const [busy, setBusy] = useState(""); // "", "book", "refresh" or "cancel"
  const [error, setError] = useState("");
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const booked = Boolean(order.lalamove_order_id) && riderActive(order.lalamove_status);

  async function run(kind, action) {
    setBusy(kind);
    setError("");
    try {
      const result = await action(token, order.order_number);
      onUpdated(result.order);
      setRider(result.rider);
      setConfirmingCancel(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  // Get fresh news from Lalamove whenever this order is opened.
  useEffect(() => {
    setRider(null);
    setError("");
    if (order.lalamove_order_id && riderActive(order.lalamove_status)) run("refresh", refreshRider);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.order_number]);

  return (
    <section>
      <h3 className="font-sans text-xs font-bold text-muted">Lalamove rider</h3>

      {booked ? (
        <div className="mt-2 space-y-2 rounded-xl border border-line p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="font-semibold">{riderStatusText(order.lalamove_status)}</p>
            <button
              type="button"
              onClick={() => run("refresh", refreshRider)}
              disabled={busy !== ""}
              className="cursor-pointer text-xs font-semibold text-berry hover:underline disabled:opacity-50"
            >
              {busy === "refresh" ? "Checking…" : "Refresh"}
            </button>
          </div>
          {rider?.name && (
            <p className="text-muted">
              {rider.name}
              {rider.plate_number && `, plate ${rider.plate_number}`}
              {rider.phone && (
                <>
                  {", "}
                  <a href={`tel:${rider.phone}`} className="link font-normal">
                    {rider.phone}
                  </a>
                </>
              )}
            </p>
          )}
          {order.lalamove_fee != null && (
            <p className="text-xs text-muted">
              Lalamove charges {formatPrice(order.lalamove_fee)} (customer paid {formatPrice(order.shipping_fee)})
            </p>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            {order.lalamove_share_link && (
              <a href={order.lalamove_share_link} target="_blank" rel="noreferrer" className="btn-secondary btn-small">
                Track
              </a>
            )}
            {!confirmingCancel ? (
              <button type="button" onClick={() => setConfirmingCancel(true)} disabled={busy !== ""} className="btn-quiet btn-small text-berry">
                Cancel rider
              </button>
            ) : (
              <span className="flex items-center gap-2 text-xs">
                Cancel this rider?
                <button
                  type="button"
                  onClick={() => run("cancel", cancelRider)}
                  disabled={busy !== ""}
                  className="cursor-pointer rounded-full bg-berry px-3 py-1.5 font-bold text-on-berry hover:bg-berry-dark"
                >
                  {busy === "cancel" ? "Cancelling…" : "Yes, cancel"}
                </button>
                <button type="button" onClick={() => setConfirmingCancel(false)} className="cursor-pointer rounded-full px-3 py-1.5 font-bold hover:bg-sand">
                  Keep
                </button>
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-2 space-y-2">
          {order.lalamove_status && (
            <p className="text-muted">
              {riderStatusText(order.lalamove_status)}
              {order.lalamove_status === "COMPLETED" && order.lalamove_fee != null && ` (Lalamove charged ${formatPrice(order.lalamove_fee)})`}
            </p>
          )}
          {order.lalamove_status === "COMPLETED" ? null : order.ship_lat == null ? (
            <p className="text-muted">This order has no map pin (it was placed before Lalamove was connected). Book it in the Lalamove app.</p>
          ) : order.order_status === "processing" ? (
            <>
              <button type="button" onClick={() => run("book", bookRider)} disabled={busy !== ""} className="btn-primary btn-small">
                {busy === "book" ? "Booking…" : order.lalamove_status ? "Book another rider" : "Book Lalamove rider"}
              </button>
              <p className="text-xs text-muted">Book when the parcel is packed. The customer paid {formatPrice(order.shipping_fee)} for delivery.</p>
            </>
          ) : order.order_status === "pending" ? (
            <p className="text-muted">You can book a rider once you start preparing this order.</p>
          ) : null}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 text-xs text-berry">
          {error}
        </p>
      )}
    </section>
  );
}
