import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { getCategories, getProduct } from "../api/products";
import { CheckIcon } from "../components/Icons";
import PageLayout from "../components/PageLayout";
import ProductImage from "../components/ProductImage";
import { useCart } from "../context/CartContext";
import { formatPrice } from "../utils/format";

export default function ProductPage() {
  const { productId } = useParams();
  const navigate = useNavigate();
  const { addToCart } = useCart();

  const [quantity, setQuantity] = useState(1);
  const [product, setProduct] = useState(null);
  const [category, setCategory] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | ready | notFound | error
  const [cartMessage, setCartMessage] = useState(null); // { ok, text }
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let ignore = false;
    setStatus("loading");
    setQuantity(1);
    setCartMessage(null);

    Promise.all([getProduct(productId), getCategories().catch(() => [])])
      .then(([productData, categories]) => {
        if (ignore) return;
        setProduct(productData);
        setCategory(categories.find((item) => item.category_id === productData.category_id) ?? null);
        setStatus("ready");
      })
      .catch((error) => {
        if (!ignore) setStatus(error.status === 404 ? "notFound" : "error");
      });

    return () => {
      ignore = true;
    };
  }, [productId]);

  async function handleAddToCart() {
    setCartMessage(null);
    setBusy(true);
    const result = await addToCart(product, quantity);
    setBusy(false);
    if (result.ok) setCartMessage({ ok: true, text: "Added to your cart." });
    else if (result.error) setCartMessage({ ok: false, text: result.error });
    // Guests: the login popup opened; the item is added after they log in.
  }

  async function handleBuyNow() {
    setCartMessage(null);
    setBusy(true);
    const result = await addToCart(product, quantity, { quiet: true });
    setBusy(false);
    // Check out just this product; anything else in the cart stays for later.
    if (result.ok) navigate(`/checkout?item=${productId}`);
    else if (result.error) setCartMessage({ ok: false, text: result.error });
  }

  if (status === "loading") {
    return (
      <PageLayout width="wide">
        <div className="grid animate-pulse gap-10 md:grid-cols-2" aria-hidden="true">
          <div className="aspect-square rounded-3xl bg-sand" />
          <div className="space-y-4">
            <div className="h-10 w-3/4 rounded bg-sand" />
            <div className="h-6 w-1/4 rounded bg-sand" />
            <div className="h-24 rounded bg-sand" />
          </div>
        </div>
        <p className="sr-only">Loading product…</p>
      </PageLayout>
    );
  }

  if (status !== "ready") {
    return (
      <PageLayout>
        <div className="card px-6 py-14 text-center">
          <h1 className="text-2xl font-semibold">
            {status === "notFound" ? "This product isn't available" : "This product didn't load"}
          </h1>
          <p className="mx-auto mt-2 max-w-md text-muted">
            {status === "notFound"
              ? "It may have sold out or been taken down."
              : "Check your connection and try again."}
          </p>
          <Link to="/catalog" className="btn-primary mt-6">
            Back to the shop
          </Link>
        </div>
      </PageLayout>
    );
  }

  const soldOut = product.stock_qty <= 0;
  const maxQuantity = Math.max(1, Math.min(99, product.stock_qty));

  return (
    <PageLayout width="wide">
      <nav aria-label="Breadcrumb" className="text-sm text-muted">
        <Link to="/catalog" className="hover:text-ink">
          Shop
        </Link>
        {category && (
          <>
            <span className="mx-2">/</span>
            <Link to={`/catalog?category=${category.slug}`} className="hover:text-ink">
              {category.name}
            </Link>
          </>
        )}
      </nav>

      <div className="mt-6 grid gap-10 md:grid-cols-2 lg:gap-16">
        <div className="overflow-hidden rounded-3xl bg-sand">
          <ProductImage
            src={product.image_url}
            alt={product.name}
            dimmed={soldOut}
            iconClassName="h-24 w-24"
            className="aspect-square w-full"
          />
        </div>

        <section>
          <h1 className="font-serif text-3xl font-semibold sm:text-4xl">{product.name}</h1>
          <p className="mt-3 text-2xl font-bold text-berry">{formatPrice(product.price)}</p>

          <p className="mt-2 text-sm font-semibold">
            {soldOut ? (
              <span className="text-berry">Sold out</span>
            ) : product.stock_qty <= 5 ? (
              <span className="text-berry">Only {product.stock_qty} left</span>
            ) : (
              <span className="text-muted">In stock</span>
            )}
          </p>

          <p className="mt-6 max-w-prose leading-7 text-ink/85">{product.description}</p>

          {!soldOut && (
            <div className="mt-8">
              <span className="label">Quantity</span>
              <div
                className="inline-flex items-center rounded-full border border-line bg-card"
                role="group"
                aria-label="Quantity"
              >
                <button
                  type="button"
                  aria-label="Decrease quantity"
                  disabled={quantity <= 1}
                  onClick={() => setQuantity((current) => Math.max(1, current - 1))}
                  className="h-11 w-11 cursor-pointer rounded-full text-lg hover:bg-sand disabled:cursor-not-allowed disabled:opacity-40"
                >
                  −
                </button>
                <span className="min-w-10 text-center font-bold" aria-live="polite">
                  {quantity}
                </span>
                <button
                  type="button"
                  aria-label="Increase quantity"
                  disabled={quantity >= maxQuantity}
                  onClick={() => setQuantity((current) => Math.min(maxQuantity, current + 1))}
                  className="h-11 w-11 cursor-pointer rounded-full text-lg hover:bg-sand disabled:cursor-not-allowed disabled:opacity-40"
                >
                  +
                </button>
              </div>
            </div>
          )}

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={handleAddToCart}
              disabled={soldOut || busy}
              className="btn-primary sm:min-w-44"
            >
              {soldOut ? "Sold out" : "Add to cart"}
            </button>
            <button
              type="button"
              onClick={handleBuyNow}
              disabled={soldOut || busy}
              className="btn-secondary sm:min-w-44"
            >
              Buy now
            </button>
          </div>

          {cartMessage && (
            <p
              role="status"
              className={`mt-4 flex items-center gap-2 ${cartMessage.ok ? "alert-success" : "alert-error"}`}
            >
              {cartMessage.ok && <CheckIcon className="h-4 w-4" />}
              <span>
                {cartMessage.text}{" "}
                {cartMessage.ok && (
                  <Link to="/cart" className="font-bold underline">
                    View cart
                  </Link>
                )}
              </span>
            </p>
          )}

          <dl className="mt-10 space-y-4 border-t border-line pt-6 text-sm">
            <div>
              <dt className="font-bold">Delivery</dt>
              <dd className="mt-0.5 text-muted">
                Home delivery for ₱90, or free pickup from the shop.
              </dd>
            </div>
            <div>
              <dt className="font-bold">Payment</dt>
              <dd className="mt-0.5 text-muted">GCash, Maya, card, QR Ph, or cash on delivery.</dd>
            </div>
          </dl>
        </section>
      </div>
    </PageLayout>
  );
}
