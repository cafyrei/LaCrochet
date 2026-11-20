import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import LoginRequired from "../components/auth/LoginRequired";
import { BagIcon, CloseIcon } from "../components/Icons";
import PageLayout from "../components/PageLayout";
import CheckoutSteps from "../components/checkout/CheckoutSteps";
import ProductImage from "../components/ProductImage";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { canOrder } from "../utils/cart";
import { formatPrice } from "../utils/format";

const LEAVE_MS = 220; // how long a removed item takes to fold away (see .cart-line in index.css)

export default function Cart() {
  const {
    cartItems,
    isLoading,
    cartError,
    changeQuantity,
    removeFromCart,
    selectedItems,
    selectedCount,
    selectedSubtotal,
    isSelected,
    toggleSelected,
    selectAll,
  } = useCart();
  const { user } = useAuth();
  const [leaving, setLeaving] = useState(() => new Set());

  const orderable = cartItems.filter(canOrder);
  const allSelected = orderable.length > 0 && selectedItems.length === orderable.length;
  const someSelected = selectedItems.length > 0 && !allSelected;

  // Fold the line away first, then remove it (the message that appears has an Undo).
  function handleRemove(id) {
    setLeaving((ids) => new Set(ids).add(id));
    setTimeout(async () => {
      await removeFromCart(id);
      setLeaving((ids) => {
        const next = new Set(ids);
        next.delete(id);
        return next;
      });
    }, LEAVE_MS);
  }

  return (
    <PageLayout width="wide">
      {user && cartItems.length > 0 && (
        <div className="mb-6">
          <CheckoutSteps current="cart" />
        </div>
      )}
      <h1 className="page-title">Your cart</h1>

      {user && cartError && (
        <p role="alert" className="alert-error mt-6">
          {cartError}
        </p>
      )}

      <div className="mt-8">
        {!user ? (
          <LoginRequired
            title="Log in to see your cart"
            message="Your cart is saved to your account, so it's there on any device."
          />
        ) : isLoading && cartItems.length === 0 ? (
          <CartSkeleton />
        ) : cartItems.length === 0 ? (
          <div className="card px-6 py-14 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blush text-berry">
              <BagIcon />
            </span>
            <h2 className="mt-4 text-2xl font-semibold">Your cart is empty</h2>
            <p className="mt-2 text-muted">Find something handmade to fill it.</p>
            <Link to="/catalog" className="btn-primary mt-6">
              Start shopping
            </Link>
          </div>
        ) : (
          <div className="grid gap-8 lg:grid-cols-[1fr_360px] lg:items-start">
            <div className="card">
              {/* Tick the items to buy now; unticked ones stay in the cart for later. */}
              <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
                <label className="flex cursor-pointer items-center gap-3 text-sm font-semibold">
                  <SelectAllBox
                    checked={allSelected}
                    indeterminate={someSelected}
                    disabled={orderable.length === 0}
                    onChange={(event) => selectAll(event.target.checked)}
                  />
                  Select all ({orderable.length})
                </label>
                <span className="text-sm text-muted">
                  {selectedItems.length} of {cartItems.length} chosen
                </span>
              </div>

              <ul className="divide-y divide-line">
                {cartItems.map((item) => {
                  const orderableNow = canOrder(item);
                  return (
                    <li
                      key={item.id}
                      className="cart-line"
                      data-leaving={leaving.has(item.id) || undefined}
                      data-unselected={(orderableNow && !isSelected(item.id)) || undefined}
                    >
                      <div className="flex gap-3 p-4 sm:gap-4 sm:p-5">
                        <input
                          type="checkbox"
                          className="checkbox mt-1 shrink-0 self-start sm:mt-10"
                          checked={orderableNow && isSelected(item.id)}
                          disabled={!orderableNow}
                          onChange={() => toggleSelected(item.id)}
                          aria-label={`Check out ${item.name}`}
                        />

                        <Link
                          to={`/products/${item.id}`}
                          className="h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-sand sm:h-28 sm:w-28"
                        >
                          <ProductImage
                            src={item.image}
                            alt={item.name}
                            dimmed={!item.available}
                            className="h-full w-full"
                          />
                        </Link>

                        <div className="flex min-w-0 flex-1 flex-col">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <h2 className="font-sans font-semibold">
                                <Link to={`/products/${item.id}`} className="hover:text-berry">
                                  {item.name}
                                </Link>
                              </h2>
                              <p className="text-sm text-muted">{formatPrice(item.price)} each</p>
                            </div>
                            <button
                              type="button"
                              aria-label={`Remove ${item.name}`}
                              onClick={() => handleRemove(item.id)}
                              disabled={leaving.has(item.id)}
                              className="cursor-pointer rounded-full p-1.5 text-muted transition-colors hover:bg-sand hover:text-berry"
                            >
                              <CloseIcon className="h-4 w-4" />
                            </button>
                          </div>

                          {!item.available ? (
                            <p className="mt-1 text-sm font-semibold text-berry">
                              No longer available. You can remove it.
                            </p>
                          ) : item.quantity > item.stockQty ? (
                            <p className="mt-1 text-sm font-semibold text-berry">
                              Only {item.stockQty} left. Lower the quantity to check it out.
                            </p>
                          ) : (
                            item.stockQty <= 5 && (
                              <p className="mt-1 text-sm text-muted">Only {item.stockQty} left</p>
                            )
                          )}

                          <div className="mt-auto flex items-end justify-between gap-3 pt-3">
                            <div
                              className="inline-flex items-center rounded-full border border-line"
                              role="group"
                              aria-label={`Quantity of ${item.name}`}
                            >
                              <button
                                type="button"
                                aria-label={`Decrease ${item.name} quantity`}
                                disabled={item.quantity <= 1}
                                onClick={() => changeQuantity(item.id, -1)}
                                className="h-9 w-9 cursor-pointer rounded-full hover:bg-sand disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                −
                              </button>
                              <span className="min-w-8 text-center text-sm font-bold tabular-nums">
                                {item.quantity}
                              </span>
                              <button
                                type="button"
                                aria-label={`Increase ${item.name} quantity`}
                                disabled={!item.available || item.quantity >= item.stockQty}
                                onClick={() => changeQuantity(item.id, 1)}
                                className="h-9 w-9 cursor-pointer rounded-full hover:bg-sand disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                +
                              </button>
                            </div>
                            <p className="font-bold tabular-nums">{formatPrice(item.price * item.quantity)}</p>
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* Shipping is chosen at checkout, so the cart only shows the subtotal. */}
            <aside className="card p-6 lg:sticky lg:top-28">
              <h2 className="text-xl font-semibold">Summary</h2>
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between text-base font-bold">
                  <dt>
                    Subtotal{" "}
                    <span className="font-normal text-muted">
                      ({selectedCount} {selectedCount === 1 ? "item" : "items"})
                    </span>
                  </dt>
                  <dd className="tabular-nums">{formatPrice(selectedSubtotal)}</dd>
                </div>
                <p className="text-muted">Delivery or pickup is chosen at checkout.</p>
              </dl>

              {selectedItems.length > 0 ? (
                <Link to="/checkout" className="btn-primary mt-6 w-full">
                  Check out {selectedCount} {selectedCount === 1 ? "item" : "items"}
                </Link>
              ) : (
                <p className="mt-6 rounded-xl bg-sand px-4 py-3 text-sm text-ink">
                  {orderable.length > 0
                    ? "Tick the items you want to buy now."
                    : "None of these items can be bought right now."}
                </p>
              )}
              {selectedItems.length > 0 && selectedItems.length < cartItems.length && (
                <p className="mt-3 text-center text-xs text-muted">
                  Unticked items stay in your cart for later.
                </p>
              )}
              <Link to="/catalog" className="btn-quiet mt-2 w-full">
                Keep shopping
              </Link>
            </aside>
          </div>
        )}
      </div>
    </PageLayout>
  );
}

// A "select all" box that can also show a dash when only some items are ticked.
function SelectAllBox({ indeterminate, ...props }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return <input ref={ref} type="checkbox" className="checkbox" {...props} />;
}

// Grey placeholder rows while the cart loads, shaped like the real ones.
function CartSkeleton() {
  return (
    <div className="card divide-y divide-line" aria-busy="true" aria-label="Loading your cart">
      {[0, 1].map((row) => (
        <div key={row} className="flex gap-4 p-5">
          <div className="skeleton h-24 w-24 rounded-xl sm:h-28 sm:w-28" />
          <div className="flex-1 space-y-3 pt-1">
            <div className="skeleton h-4 w-1/2 rounded-full" />
            <div className="skeleton h-3 w-1/4 rounded-full" />
            <div className="skeleton mt-6 h-8 w-28 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
