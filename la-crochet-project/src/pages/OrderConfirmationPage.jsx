import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { getOrder, PENDING_ORDER_KEY } from "../api/orders";
import { CheckIcon, CloseIcon } from "../components/Icons";
import PageLayout from "../components/PageLayout";
import CheckoutSteps from "../components/checkout/CheckoutSteps";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { formatDate, formatPrice } from "../utils/format";
import { orderStatus, paymentText } from "../utils/orderStatus";
import { riderActive, riderStatusText } from "../utils/riderStatus";

export default function OrderConfirmationPage() {
  const [searchParams] = useSearchParams();
  const orderNumber = searchParams.get("order");
  const token = searchParams.get("token");

  const { refreshCart } = useCart();
  const { user } = useAuth();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState("");
  const [justPlaced, setJustPlaced] = useState(false);

  useEffect(() => {
    if (!orderNumber || !token) {
      setError("This order link is incomplete.");
      return;
    }

    let ignore = false;
    getOrder(orderNumber, token)
      .then((data) => {
        if (ignore) return;
        setOrder(data);

        // The server empties the cart once the order is placed or paid,
        // so just reload it to update the cart badge.
        if (sessionStorage.getItem(PENDING_ORDER_KEY) === data.order_number) {
          setJustPlaced(true);
          refreshCart();
          sessionStorage.removeItem(PENDING_ORDER_KEY);
        }
      })
      .catch((err) => {
        if (!ignore) setError(err.message);
      });

    return () => {
      ignore = true;
    };
    // refreshCart is left out on purpose: we only want this to run once per order.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderNumber, token]);

  if (error) {
    return (
      <PageLayout>
        <div className="card px-6 py-14 text-center">
          <h1 className="text-2xl font-semibold">{error}</h1>
          <p className="mt-2 text-muted">Check the link, or find the order in My orders.</p>
          <Link to={user ? "/orders" : "/"} className="btn-primary mt-6">
            {user ? "Go to My orders" : "Back to home"}
          </Link>
        </div>
      </PageLayout>
    );
  }

  if (!order) {
    return (
      <PageLayout>
        <p className="py-20 text-center text-muted">Loading your order…</p>
      </PageLayout>
    );
  }

  const cancelled = order.order_status === "cancelled";
  const status = orderStatus(order.order_status);

  return (
    <PageLayout>
      {justPlaced && !cancelled && (
        <div className="mb-8 flex justify-center">
          <CheckoutSteps current="done" />
        </div>
      )}

      {/* ---- What happened ---- */}
      <section className="text-center">
        <span
          aria-hidden="true"
          className={`${justPlaced && !cancelled ? "success-pop " : ""}mx-auto flex h-14 w-14 items-center justify-center rounded-full ${
            cancelled ? "bg-sand text-muted" : "bg-berry text-on-berry"
          }`}
        >
          {cancelled ? <CloseIcon /> : <CheckIcon className="h-7 w-7" />}
        </span>

        <h1 className="mt-5 font-serif text-3xl font-semibold sm:text-4xl">
          {cancelled
            ? "This order was cancelled"
            : justPlaced
              ? `Thank you, ${order.customer_name.split(" ")[0]}!`
              : `Order ${order.order_number}`}
        </h1>
        <p className="mx-auto mt-3 max-w-md text-muted">
          {cancelled
            ? "The payment wasn't completed, so nothing was charged."
            : justPlaced
              ? `Your order is in. We'll send updates to ${order.email}.`
              : `Placed ${formatDate(order.created_at)}`}
        </p>
      </section>

      {/* ---- The order ---- */}
      <section className="card mt-10 p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">{order.order_number}</h2>
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${status.className}`}>
            {status.label}
          </span>
        </div>

        <ul className="mt-5 divide-y divide-line">
          {order.items.map((item, index) => (
            <li key={index} className="flex justify-between gap-4 py-3">
              <span>
                {item.product_name} <span className="text-muted">× {item.quantity}</span>
              </span>
              <span className="font-semibold">{formatPrice(item.line_total)}</span>
            </li>
          ))}
        </ul>

        <dl className="mt-2 space-y-2 border-t border-line pt-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">Subtotal</dt>
            <dd>{formatPrice(order.subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Shipping</dt>
            <dd>{order.shipping_fee > 0 ? formatPrice(order.shipping_fee) : "Free"}</dd>
          </div>
          <div className="flex justify-between border-t border-line pt-3 text-base font-bold">
            <dt>Total</dt>
            <dd>{formatPrice(order.total)}</dd>
          </div>
        </dl>

        <dl className="mt-6 grid gap-4 rounded-xl bg-cream p-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="font-bold">
              {order.shipping_method === "delivery" ? "Delivering to" : "Store pickup"}
            </dt>
            <dd className="mt-0.5 text-muted">
              {order.shipping_method === "delivery"
                ? [order.ship_street, order.ship_barangay, order.ship_city, order.ship_province, order.ship_postal_code]
                    .filter(Boolean)
                    .join(", ")
                : "We'll text you when it's ready to collect."}
            </dd>
          </div>
          <div>
            <dt className="font-bold">Payment</dt>
            <dd className="mt-0.5 text-muted">{paymentText(order)}</dd>
          </div>
        </dl>

        {riderActive(order.lalamove_status) && order.lalamove_share_link && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-4 text-sm">
            <div>
              <p className="font-bold">Lalamove delivery</p>
              <p className="text-muted">{riderStatusText(order.lalamove_status)}</p>
            </div>
            <a href={order.lalamove_share_link} target="_blank" rel="noreferrer" className="btn-secondary btn-small">
              Track your rider
            </a>
          </div>
        )}
      </section>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link to={cancelled ? "/cart" : "/catalog"} className="btn-primary">
          {cancelled ? "Back to cart" : "Keep shopping"}
        </Link>
        {user && (
          <Link to="/orders" className="btn-secondary">
            My orders
          </Link>
        )}
      </div>
    </PageLayout>
  );
}
