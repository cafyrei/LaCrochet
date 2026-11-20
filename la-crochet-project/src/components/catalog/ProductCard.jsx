import { useState } from "react";
import { Link } from "react-router";
import { formatPrice } from "../../utils/format";
import { BagIcon, CheckIcon } from "../Icons";
import ProductImage from "../ProductImage";

// One product in a grid. addToCart(product) should resolve with
// { ok, error, needsLogin } (see CartContext).
export default function ProductCard({ product, addToCart }) {
  const productId = product.product_id ?? product.id;
  const productUrl = `/products/${productId}`;
  const soldOut = product.stock_qty <= 0;
  const fewLeft = !soldOut && product.stock_qty <= 5;

  const [status, setStatus] = useState({ state: "idle", text: "" }); // idle | adding | added | error

  async function handleAdd() {
    setStatus({ state: "adding", text: "" });
    const result = await addToCart(product);
    if (result?.ok) {
      setStatus({ state: "added", text: "Added to your cart" });
      setTimeout(() => setStatus({ state: "idle", text: "" }), 2500);
    } else if (result?.error) {
      setStatus({ state: "error", text: result.error });
    } else {
      setStatus({ state: "idle", text: "" }); // guest: login popup opened
    }
  }

  return (
    <article className="group flex flex-col">
      <Link
        to={productUrl}
        className="relative block aspect-[4/5] overflow-hidden rounded-2xl bg-sand"
      >
        <ProductImage
          src={product.image_url}
          alt={product.name}
          dimmed={soldOut}
          iconClassName="h-14 w-14"
          className="h-full w-full transition-transform duration-500 group-hover:scale-[1.03]"
        />
        {(soldOut || fewLeft) && (
          <span
            className={`absolute left-3 top-3 rounded-full px-3 py-1 text-xs font-bold ${
              soldOut ? "bg-ink text-cream" : "bg-card text-berry"
            }`}
          >
            {soldOut ? "Sold out" : `Only ${product.stock_qty} left`}
          </span>
        )}
      </Link>

      <div className="mt-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-sans text-[15px] font-semibold leading-snug">
            <Link to={productUrl} className="hover:text-berry">
              {product.name}
            </Link>
          </h3>
          <p className="mt-1 font-bold text-berry">{formatPrice(product.price)}</p>
        </div>

        <button
          type="button"
          onClick={handleAdd}
          disabled={soldOut || status.state === "adding"}
          aria-label={soldOut ? `${product.name} is sold out` : `Add ${product.name} to cart`}
          className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full border border-line bg-card text-ink transition-colors hover:border-berry hover:bg-berry hover:text-on-berry disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-line disabled:hover:bg-card disabled:hover:text-ink"
        >
          {status.state === "added" ? <CheckIcon /> : <BagIcon />}
        </button>
      </div>

      {status.text && (
        <p
          role="status"
          className={`mt-1 text-sm ${status.state === "error" ? "text-berry" : "text-muted"}`}
        >
          {status.text}
        </p>
      )}
    </article>
  );
}

export function ProductCardSkeleton() {
  return (
    <div aria-hidden="true" className="animate-pulse">
      <div className="aspect-[4/5] rounded-2xl bg-sand" />
      <div className="mt-3 h-4 w-3/4 rounded bg-sand" />
      <div className="mt-2 h-4 w-1/3 rounded bg-sand" />
    </div>
  );
}
