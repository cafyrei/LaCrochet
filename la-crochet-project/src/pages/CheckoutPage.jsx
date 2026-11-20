import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { getDeliveryInfo, getDeliveryQuote } from "../api/delivery";
import { cancelOrder, createOrder, PENDING_ORDER_KEY } from "../api/orders";
import LoginRequired from "../components/auth/LoginRequired";
import LocationPicker from "../components/checkout/LocationPicker";
import { ChevronLeftIcon } from "../components/Icons";
import PageLayout from "../components/PageLayout";
import ProductImage from "../components/ProductImage";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { canOrder } from "../utils/cart";
import CheckoutSteps from "../components/checkout/CheckoutSteps";
import { formatPrice } from "../utils/format";

// Used only if the server can't be asked (it normally tells us the fee).
const FALLBACK_DELIVERY_FEE = 90;
const QUOTE_DELAY_MS = 700; // wait until they stop moving the pin before asking Lalamove

const emptyForm = {
  fullName: "",
  email: "",
  phone: "",
  street: "",
  barangay: "",
  city: "",
  province: "",
  postalCode: "",
};

export default function CheckoutPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState(emptyForm);
  const [shippingMethod, setShippingMethod] = useState("delivery");
  const [paymentMethod, setPaymentMethod] = useState("cod");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  // Lalamove: is it set up, the customer's map pin, and the live delivery price.
  const [delivery, setDelivery] = useState({ lalamove: false, flat_fee: FALLBACK_DELIVERY_FEE, shop: null });
  const [pin, setPin] = useState(null);
  const [quote, setQuote] = useState({ status: "idle" }); // idle | loading | ok | error

  const { cartItems: allCartItems, selectedItems, isLoading: cartLoading } = useCart();
  const [searchParams] = useSearchParams();
  // "Buy now" on a product page sends ?item=<id>: check out just that one.
  // Otherwise: the items ticked in the cart (unticked ones stay for later).
  const buyNowId = Number(searchParams.get("item")) || null;
  const cartItems = buyNowId
    ? allCartItems.filter((item) => item.id === buyNowId && canOrder(item))
    : selectedItems;
  const subtotal = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const { user, token, isChecking } = useAuth();

  // Logged in? Fill in their details (only boxes that are still empty).
  useEffect(() => {
    if (!user) return;
    const address = user.default_address;
    setForm((current) => {
      const fill = (field, value) => current[field] || value || "";
      return {
        fullName: fill("fullName", `${user.first_name} ${user.last_name}`),
        email: fill("email", user.email),
        phone: fill("phone", user.phone),
        street: fill("street", address?.street),
        barangay: fill("barangay", address?.barangay),
        city: fill("city", address?.city),
        province: fill("province", address?.province),
        postalCode: fill("postalCode", address?.postal_code),
      };
    });
    // Their saved map pin, from last time.
    if (address?.lat != null && address?.lng != null) {
      setPin((current) => current ?? { lat: address.lat, lng: address.lng });
    }
  }, [user]);

  useEffect(() => {
    getDeliveryInfo()
      .then(setDelivery)
      .catch(() => {}); // keep the flat fee
  }, []);

  const addressComplete =
    form.street.trim() && form.barangay.trim() && form.city.trim() && form.province.trim() && /^\d{4}$/.test(form.postalCode);
  const needsQuote = delivery.lalamove && shippingMethod === "delivery";

  // Ask Lalamove for the price once the pin and address are in (and again when they change).
  useEffect(() => {
    if (!needsQuote || !pin || !addressComplete || !token) {
      setQuote({ status: "idle" });
      return;
    }
    let stale = false;
    setQuote({ status: "loading" });
    const timer = setTimeout(() => {
      getDeliveryQuote(token, pin, {
        street: form.street,
        barangay: form.barangay,
        city: form.city,
        province: form.province,
        postal_code: form.postalCode,
      })
        .then((result) => !stale && setQuote({ status: "ok", fee: result.fee, distanceKm: result.distance_km }))
        .catch((error) => !stale && setQuote({ status: "error", message: error.message }));
    }, QUOTE_DELAY_MS);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [needsQuote, pin, addressComplete, token, form.street, form.barangay, form.city, form.province, form.postalCode]);

  // PayRex sends people back to /checkout?payment=cancelled&order=...&token=...
  const paymentCancelled = searchParams.get("payment") === "cancelled";
  const cancelledOrder = searchParams.get("order");
  const cancelledToken = searchParams.get("token");
  const cancelSent = useRef(false);

  // Cancel the unpaid order so its items go back in stock.
  useEffect(() => {
    if (!paymentCancelled || !cancelledOrder || !cancelledToken || cancelSent.current) {
      return;
    }
    cancelSent.current = true;
    sessionStorage.removeItem(PENDING_ORDER_KEY);
    cancelOrder(cancelledOrder, cancelledToken).catch(() => {
      // Not critical: the order expires on PayRex's side anyway.
    });
  }, [paymentCancelled, cancelledOrder, cancelledToken]);

  // null = not known yet (no pin, or Lalamove is still answering)
  const shippingFee =
    shippingMethod === "pickup"
      ? 0
      : delivery.lalamove
        ? quote.status === "ok"
          ? quote.fee
          : null
        : (delivery.flat_fee ?? FALLBACK_DELIVERY_FEE);
  const grandTotal = subtotal + (shippingFee ?? 0);
  const waitingForFee = shippingMethod === "delivery" && shippingFee === null;
  const addressForMap = [form.street, form.barangay, form.city, form.province].filter((part) => part.trim()).join(", ");

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitError("");

    if (cartItems.length === 0) {
      setSubmitError("Choose at least one item in your cart before checking out.");
      return;
    }
    if (needsQuote && !pin) {
      setSubmitError("Please drop a pin on the map so the rider can find you.");
      return;
    }
    if (waitingForFee) {
      setSubmitError(quote.status === "error" ? quote.message : "Please wait for the delivery fee.");
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await createOrder(
        {
          // Only IDs and quantities: the server looks up the real prices.
          items: cartItems.map(({ id, quantity }) => ({ id, quantity })),
          customer_name: form.fullName,
          email: form.email,
          phone: form.phone,
          shipping_method: shippingMethod,
          payment_method: paymentMethod,
          shipping_address:
            shippingMethod === "delivery"
              ? {
                  street: form.street,
                  barangay: form.barangay,
                  city: form.city,
                  province: form.province,
                  postal_code: form.postalCode,
                }
              : null,
          delivery_location: shippingMethod === "delivery" && pin ? pin : null,
        },
        token
      );

      sessionStorage.setItem(PENDING_ORDER_KEY, result.order_number);

      if (result.checkout_url) {
        // Online payment: go to PayRex. They send the customer back afterwards.
        window.location.assign(result.checkout_url);
        return;
      }

      // Cash on delivery / pay at pickup: the order is placed.
      const query = new URLSearchParams({
        order: result.order_number,
        token: result.access_token,
      });
      navigate(`/order-confirmation?${query}`);
    } catch (error) {
      setSubmitError(error.message);
      setIsSubmitting(false);
    }
  }

  return (
    <PageLayout width="wide">
      <CheckoutSteps current="details" />
      <Link to="/cart" className="mt-6 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ChevronLeftIcon className="h-4 w-4" />
        Back to cart
      </Link>
      <h1 className="page-title mt-2">Checkout</h1>

      {paymentCancelled && (
        <p role="status" className="alert-error mt-6">
          Your payment was cancelled and no money was taken. Your cart is still here, so you can
          try again.
        </p>
      )}

      <div className="mt-8">
        {!user ? (
          <LoginRequired title="Log in to check out" message="You need an account to place an order." />
        ) : cartItems.length === 0 && (cartLoading || isChecking) ? (
          <p className="py-16 text-center text-muted">Loading your items…</p>
        ) : cartItems.length === 0 ? (
          <div className="card px-6 py-14 text-center">
            {allCartItems.length === 0 ? (
              <>
                <h2 className="text-2xl font-semibold">Your cart is empty</h2>
                <p className="mt-2 text-muted">Add something you love, then come back here.</p>
                <Link to="/catalog" className="btn-primary mt-6">
                  Start shopping
                </Link>
              </>
            ) : (
              <>
                <h2 className="text-2xl font-semibold">No items chosen</h2>
                <p className="mt-2 text-muted">Tick the items you want to buy in your cart first.</p>
                <Link to="/cart" className="btn-primary mt-6">
                  Choose items
                </Link>
              </>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="grid gap-8 lg:grid-cols-[1fr_380px] lg:items-start">
            <div className="space-y-6">
              <Section title="Contact details">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Full name" name="fullName" autoComplete="name" value={form.fullName} onChange={updateField} />
                  <Field label="Email" name="email" type="email" autoComplete="email" value={form.email} onChange={updateField} />
                  <Field
                    label="Mobile number"
                    name="phone"
                    type="tel"
                    autoComplete="tel"
                    placeholder="09XX XXX XXXX"
                    value={form.phone}
                    onChange={updateField}
                    className="sm:col-span-2"
                    hint="We'll text you about your order."
                  />
                </div>
              </Section>

              <Section title="How do you want to get it?">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Choice
                    name="shipping"
                    checked={shippingMethod === "delivery"}
                    onChange={() => setShippingMethod("delivery")}
                    title="Home delivery"
                    detail={
                      delivery.lalamove
                        ? "Lalamove rider. Fee depends on distance."
                        : formatPrice(delivery.flat_fee ?? FALLBACK_DELIVERY_FEE)
                    }
                  />
                  <Choice
                    name="shipping"
                    checked={shippingMethod === "pickup"}
                    onChange={() => setShippingMethod("pickup")}
                    title="Store pickup"
                    detail="Free"
                  />
                </div>

                {shippingMethod === "delivery" && (
                  <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    <Field
                      label="Street address"
                      name="street"
                      autoComplete="street-address"
                      placeholder="House no., street, building"
                      value={form.street}
                      onChange={updateField}
                      className="sm:col-span-2"
                    />
                    <Field label="Barangay" name="barangay" value={form.barangay} onChange={updateField} />
                    <Field
                      label="City / municipality"
                      name="city"
                      autoComplete="address-level2"
                      value={form.city}
                      onChange={updateField}
                    />
                    <Field
                      label="Province"
                      name="province"
                      autoComplete="address-level1"
                      value={form.province}
                      onChange={updateField}
                    />
                    <Field
                      label="Postal code"
                      name="postalCode"
                      autoComplete="postal-code"
                      inputMode="numeric"
                      pattern="\d{4}"
                      title="4-digit postal code"
                      maxLength={4}
                      value={form.postalCode}
                      onChange={updateField}
                    />
                    {delivery.lalamove && (
                      <div className="sm:col-span-2">
                        <p className="label">Pin your exact location</p>
                        <p className="-mt-1 mb-3 text-xs text-muted">
                          The Lalamove rider follows this pin, and the delivery fee is based on it.
                        </p>
                        <LocationPicker
                          value={pin}
                          onChange={setPin}
                          start={delivery.shop}
                          addressText={addressForMap}
                        />
                      </div>
                    )}
                  </div>
                )}
              </Section>

              <Section title="How do you want to pay?">
                <div className="grid gap-3">
                  <Choice
                    name="payment"
                    checked={paymentMethod === "cod"}
                    onChange={() => setPaymentMethod("cod")}
                    title={shippingMethod === "pickup" ? "Pay at pickup" : "Cash on delivery"}
                    detail="Pay in cash when you get your order."
                  />
                  <Choice
                    name="payment"
                    checked={paymentMethod === "online"}
                    onChange={() => setPaymentMethod("online")}
                    title="Pay online"
                    detail="GCash, Maya, card, or QR Ph through PayRex."
                  />
                </div>
              </Section>
            </div>

            <aside className="card p-6 lg:sticky lg:top-28">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-xl font-semibold">Your order</h2>
                {!buyNowId && (
                  <Link to="/cart" className="link text-sm">
                    Change items
                  </Link>
                )}
              </div>

              <ul className="mt-4 space-y-4">
                {cartItems.map((item) => (
                  <li key={item.id} className="flex items-center gap-3">
                    <ProductImage
                      src={item.image}
                      alt=""
                      iconClassName="h-6 w-6"
                      className="h-14 w-14 shrink-0 rounded-xl"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{item.name}</p>
                      <p className="text-sm text-muted">Qty {item.quantity}</p>
                    </div>
                    <p className="text-sm font-semibold">{formatPrice(item.price * item.quantity)}</p>
                  </li>
                ))}
              </ul>

              <dl className="mt-6 space-y-2 border-t border-line pt-4 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted">Subtotal</dt>
                  <dd>{formatPrice(subtotal)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">
                    Shipping
                    {shippingMethod === "delivery" && quote.status === "ok" && quote.distanceKm && (
                      <span className="block text-xs">Lalamove, {quote.distanceKm} km</span>
                    )}
                  </dt>
                  <dd className="text-right">
                    {shippingMethod === "pickup"
                      ? "Free"
                      : shippingFee !== null
                        ? formatPrice(shippingFee)
                        : quote.status === "loading"
                          ? "Checking…"
                          : quote.status === "error"
                            ? "Unavailable"
                            : "Drop your pin"}
                  </dd>
                </div>
                {shippingMethod === "delivery" && quote.status === "error" && (
                  <p className="text-xs text-berry">{quote.message}</p>
                )}
                <div className="flex justify-between border-t border-line pt-3 text-base font-bold">
                  <dt>Total</dt>
                  <dd>{formatPrice(grandTotal)}</dd>
                </div>
              </dl>

              {submitError && (
                <p role="alert" className="alert-error mt-4">
                  {submitError}
                </p>
              )}

              <button type="submit" disabled={isSubmitting || waitingForFee} className="btn-primary mt-6 w-full">
                {waitingForFee && !isSubmitting
                  ? quote.status === "loading"
                    ? "Checking the delivery fee…"
                    : "Pin your location to continue"
                  : isSubmitting
                  ? paymentMethod === "online"
                    ? "Opening PayRex…"
                    : "Placing your order…"
                  : paymentMethod === "online"
                    ? `Pay ${formatPrice(grandTotal)} now`
                    : `Place order for ${formatPrice(grandTotal)}`}
              </button>
              {paymentMethod === "online" && (
                <p className="mt-3 text-center text-xs text-muted">
                  You'll finish paying on PayRex's secure page.
                </p>
              )}
            </aside>
          </form>
        )}
      </div>
    </PageLayout>
  );
}

function Section({ title, children }) {
  return (
    <section className="card p-6">
      <h2 className="mb-5 text-xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, name, className = "", hint, type = "text", ...props }) {
  const id = `checkout-${name}`;
  return (
    <div className={className}>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <input id={id} name={name} type={type} required className="input" {...props} />
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

// A big, easy-to-tap radio option.
function Choice({ name, checked, onChange, title, detail }) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${
        checked ? "border-berry bg-blush/40" : "border-line bg-card hover:border-terracotta"
      }`}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
        className="mt-1 h-4 w-4 cursor-pointer accent-berry"
      />
      <span>
        <span className="block font-semibold">{title}</span>
        <span className="block text-sm text-muted">{detail}</span>
      </span>
    </label>
  );
}
