import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { getMyOrders } from "../api/orders";
import LoginRequired from "../components/auth/LoginRequired";
import PageLayout from "../components/PageLayout";
import { useAuth } from "../context/AuthContext";
import { formatDate, formatPrice } from "../utils/format";
import { ORDER_TABS, orderStatus, orderTab, paymentText } from "../utils/orderStatus";
import { riderActive, riderStatusText } from "../utils/riderStatus";

// What to say when a tab has no orders.
const EMPTY_TAB_TEXT = {
  "to-pay": "No orders waiting for payment.",
  "to-ship": "No orders waiting to be sent.",
  "to-receive": "No orders on the way.",
  completed: "No completed orders yet.",
  cancelled: "No cancelled orders.",
};

export default function MyOrdersPage() {
  const { user, token } = useAuth();
  const [orders, setOrders] = useState(null); // null = still loading
  const [error, setError] = useState("");

  // The chosen tab is kept in the address (/orders?tab=to-ship), so the
  // back button and refreshing the page keep you on the same tab.
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const activeTab = ORDER_TABS.some((tab) => tab.id === requestedTab) ? requestedTab : "all";

  function chooseTab(tabId) {
    setSearchParams(tabId === "all" ? {} : { tab: tabId }, { replace: true });
  }

  useEffect(() => {
    if (!user || !token) return;

    let ignore = false;
    setError("");
    getMyOrders(token)
      .then((data) => {
        if (!ignore) setOrders(data);
      })
      .catch((err) => {
        if (!ignore) setError(err.message);
      });

    return () => {
      ignore = true;
    };
  }, [user, token]);

  const counts = { all: orders?.length ?? 0 };
  for (const order of orders ?? []) {
    const tab = orderTab(order);
    counts[tab] = (counts[tab] ?? 0) + 1;
  }
  const visibleOrders =
    activeTab === "all" ? orders ?? [] : (orders ?? []).filter((order) => orderTab(order) === activeTab);

  return (
    <PageLayout>
      <h1 className="page-title">My orders</h1>

      <div className="mt-8">
        {!user ? (
          <LoginRequired title="Log in to see your orders" message="Your orders are saved to your account." />
        ) : error ? (
          <p role="alert" className="alert-error">
            {error}
          </p>
        ) : orders === null ? (
          <p className="py-16 text-center text-muted">Loading your orders…</p>
        ) : orders.length === 0 ? (
          <div className="card px-6 py-14 text-center">
            <h2 className="text-2xl font-semibold">No orders yet</h2>
            <p className="mt-2 text-muted">When you place an order, you can follow it here.</p>
            <Link to="/catalog" className="btn-primary mt-6">
              Start shopping
            </Link>
          </div>
        ) : (
          <>
            <div role="tablist" aria-label="Filter orders" className="scroll-row -mx-4 gap-2 px-4 pb-1">
              {ORDER_TABS.map((tab) => {
                const selected = tab.id === activeTab;
                const count = counts[tab.id] ?? 0;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => chooseTab(tab.id)}
                    className={`shrink-0 cursor-pointer whitespace-nowrap rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
                      selected
                        ? "border-berry bg-berry text-on-berry"
                        : "border-line bg-card text-ink hover:border-berry hover:text-berry"
                    }`}
                  >
                    {tab.label}
                    {count > 0 && (
                      <span className={selected ? "ml-1.5 text-on-berry/75" : "ml-1.5 text-muted"}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div role="tabpanel" className="mt-6">
              {visibleOrders.length === 0 ? (
                <p className="card px-6 py-12 text-center text-muted">{EMPTY_TAB_TEXT[activeTab]}</p>
              ) : (
                <ul className="space-y-4">
                  {visibleOrders.map((order) => (
                    <OrderCard key={order.order_number} order={order} />
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </PageLayout>
  );
}

function OrderCard({ order }) {
  const status = orderStatus(order.order_status);
  const detailsLink = `/order-confirmation?${new URLSearchParams({
    order: order.order_number,
    token: order.access_token,
  })}`;

  return (
    <li className="card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-sans text-base font-bold">{order.order_number}</h2>
          <p className="text-sm text-muted">{formatDate(order.created_at)}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${status.className}`}>
          {status.label}
        </span>
      </div>

      <ul className="mt-4 space-y-1.5 text-sm">
        {order.items.map((item, index) => (
          <li key={index} className="flex justify-between gap-4">
            <span>
              {item.product_name} <span className="text-muted">× {item.quantity}</span>
            </span>
            <span>{formatPrice(item.line_total)}</span>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-t border-line pt-4 text-sm">
        <div className="text-muted">
          <p>{order.shipping_method === "delivery" ? "Home delivery" : "Store pickup"}</p>
          <p>{paymentText(order)}</p>
          {riderActive(order.lalamove_status) && order.lalamove_share_link && (
            <p>
              {riderStatusText(order.lalamove_status)}.{" "}
              <a href={order.lalamove_share_link} target="_blank" rel="noreferrer" className="link">
                Track your rider
              </a>
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="text-base font-bold">{formatPrice(order.total)}</p>
          <p className="flex justify-end gap-3">
            <Link
              to={`/contact?${new URLSearchParams({ topic: "order", order: order.order_number })}`}
              className="text-muted hover:text-ink"
            >
              Ask about it
            </Link>
            <Link to={detailsLink} className="link">
              View order
            </Link>
          </p>
        </div>
      </div>
    </li>
  );
}
