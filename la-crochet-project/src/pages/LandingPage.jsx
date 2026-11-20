import { useEffect, useState } from "react";
import { Link } from "react-router";
import { getCategories, getProducts } from "../api/products";
import ProductCard, { ProductCardSkeleton } from "../components/catalog/ProductCard";
import PageLayout from "../components/PageLayout";
import { useCart } from "../context/CartContext";
import heroYarn from "../assets/landing-page-carousel/yarn.jpg";

export default function LandingPage() {
  const { addToCart } = useCart();
  const [products, setProducts] = useState(null); // null = loading
  const [categories, setCategories] = useState([]);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    Promise.all([getProducts(), getCategories()])
      .then(([productData, categoryData]) => {
        setProducts(productData);
        setCategories(categoryData.filter((category) => category.product_count > 0));
      })
      .catch(() => setLoadFailed(true));
  }, []);

  const favorites = (products ?? []).filter((product) => product.is_featured).slice(0, 4);
  const justAdded = (products ?? [])
    .filter((product) => !product.is_featured)
    .sort((a, b) => b.product_id - a.product_id)
    .slice(0, 4);

  return (
    <PageLayout width="wide">
      {/* ---- Hero ---- */}
      <section className="grid items-center gap-10 md:grid-cols-[1.1fr_1fr] lg:gap-16">
        <div className="max-w-xl">
          <h1 className="font-serif text-4xl font-semibold leading-[1.1] sm:text-5xl lg:text-6xl">
            Handmade crochet, stitched slowly in the Philippines.
          </h1>
          <p className="mt-5 max-w-md text-lg leading-8 text-ink/80">
            Tote bags, flowers, keychains, and the yarn to make your own. Pay with GCash, Maya, card,
            or cash on delivery.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/catalog" className="btn-primary">
              Shop the collection
            </Link>
            <Link to="/catalog?category=yarn-and-fibers" className="btn-secondary">
              Shop yarn
            </Link>
          </div>
        </div>

        {/* Arched frame, like a window display */}
        <div className="relative mx-auto w-full max-w-md">
          <div className="aspect-[4/5] overflow-hidden rounded-t-full rounded-b-3xl border-8 border-card bg-sand shadow-xl shadow-shade/10">
            <img
              src={heroYarn}
              alt="Skeins of yarn in warm and bright colours"
              className="h-full w-full object-cover"
            />
          </div>
        </div>
      </section>

      {/* ---- What to expect ---- */}
      <section
        aria-label="How shopping works"
        className="mt-16 grid gap-6 border-y border-line py-8 sm:grid-cols-3"
      >
        <Highlight title="Made by hand" text="Every finished piece is crocheted locally, one stitch at a time." />
        <Highlight title="Pay your way" text="GCash, Maya, card, QR Ph, or cash on delivery." />
        <Highlight title="Delivery or pickup" text="Get it delivered, or pick it up from the shop for free." />
      </section>

      {/* ---- Customer favorites ---- */}
      <ProductSection
        title="Customer favorites"
        products={favorites}
        loading={products === null && !loadFailed}
        addToCart={addToCart}
      />

      {/* ---- Categories ---- */}
      {categories.length > 0 && (
        <section className="mt-16">
          <h2 className="text-2xl font-semibold sm:text-3xl">Shop by category</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {categories.map((category) => (
              <Link
                key={category.slug}
                to={`/catalog?category=${category.slug}`}
                className="card group flex items-center justify-between p-5 transition-colors hover:border-berry"
              >
                <span>
                  <span className="block font-serif text-lg font-semibold group-hover:text-berry">
                    {category.name}
                  </span>
                  <span className="text-sm text-muted">
                    {category.product_count} {category.product_count === 1 ? "item" : "items"}
                  </span>
                </span>
                <span aria-hidden="true" className="text-xl text-muted group-hover:text-berry">
                  ›
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ---- Just added ---- */}
      <ProductSection
        title="Just added"
        products={justAdded}
        loading={products === null && !loadFailed}
        addToCart={addToCart}
      />

      {loadFailed && (
        <p className="card mt-16 px-6 py-8 text-center text-muted">
          Products couldn't load right now.{" "}
          <Link to="/catalog" className="link">
            Try the shop page
          </Link>
          .
        </p>
      )}
    </PageLayout>
  );
}

function Highlight({ title, text }) {
  return (
    <div>
      <h2 className="font-serif text-lg font-semibold">{title}</h2>
      <p className="mt-1 text-sm leading-6 text-muted">{text}</p>
    </div>
  );
}

function ProductSection({ title, products, loading, addToCart }) {
  if (!loading && products.length === 0) return null;

  return (
    <section className="mt-16">
      <div className="flex items-end justify-between gap-4">
        <h2 className="text-2xl font-semibold sm:text-3xl">{title}</h2>
        <Link to="/catalog" className="link text-sm">
          See everything
        </Link>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-8 sm:gap-x-6 lg:grid-cols-4">
        {loading
          ? Array.from({ length: 4 }, (_, index) => <ProductCardSkeleton key={index} />)
          : products.map((product) => (
              <ProductCard
                key={product.product_id}
                product={product}
                addToCart={() => addToCart(product)}
              />
            ))}
      </div>
    </section>
  );
}
