import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { getCategories, getProducts } from "../api/products";
import ProductCard, { ProductCardSkeleton } from "../components/catalog/ProductCard";
import { SearchIcon } from "../components/Icons";
import PageLayout from "../components/PageLayout";
import { useCart } from "../context/CartContext";

const SORTS = {
  featured: { label: "Featured", compare: (a, b) => b.is_featured - a.is_featured || a.product_id - b.product_id },
  newest: { label: "Newest", compare: (a, b) => b.product_id - a.product_id },
  "price-low": { label: "Price: low to high", compare: (a, b) => a.price - b.price },
  "price-high": { label: "Price: high to low", compare: (a, b) => b.price - a.price },
  name: { label: "Name: A to Z", compare: (a, b) => a.name.localeCompare(b.name) },
};

const PAGE_SIZE = 12;

export default function CatalogPage() {
  const { addToCart } = useCart();
  const [products, setProducts] = useState(null); // null = loading
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState("");

  // Filters live in the address (/catalog?category=yarn-and-fibers&sort=price-low&q=tote),
  // so links from the Footer and the search box work, and Back keeps your filters.
  const [searchParams, setSearchParams] = useSearchParams();
  const categorySlug = searchParams.get("category") ?? "all";
  const sortKey = SORTS[searchParams.get("sort")] ? searchParams.get("sort") : "featured";
  const query = searchParams.get("q") ?? "";

  const page = Math.max(1, parseInt(searchParams.get("page"), 10) || 1);

  function updateParam(name, value, defaultValue) {
    const next = new URLSearchParams(searchParams);
    if (!value || value === defaultValue) next.delete(name);
    else next.set(name, value);
    if (name !== "page") next.delete("page"); // any filter change goes back to page 1
    setSearchParams(next, { replace: name !== "page" });
    if (name === "page") window.scrollTo({ top: 0 });
  }

  const load = useCallback(() => {
    setError("");
    setProducts(null);
    Promise.all([getProducts(), getCategories()])
      .then(([productData, categoryData]) => {
        setProducts(productData);
        setCategories(categoryData);
      })
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const activeCategory = categories.find((category) => category.slug === categorySlug);

  const visibleProducts = useMemo(() => {
    if (!products) return [];
    const words = query.trim().toLowerCase();
    return products
      .filter((product) => !activeCategory || product.category_id === activeCategory.category_id)
      .filter(
        (product) =>
          !words ||
          product.name.toLowerCase().includes(words) ||
          product.description.toLowerCase().includes(words)
      )
      .sort(SORTS[sortKey].compare);
  }, [products, activeCategory, query, sortKey]);

  const hasFilters = categorySlug !== "all" || query;
  const totalPages = Math.max(1, Math.ceil(visibleProducts.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages); // a stale ?page=99 clamps to the last page
  const pageProducts = visibleProducts.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <PageLayout width="wide">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">{activeCategory ? activeCategory.name : "Shop all"}</h1>
          <p className="mt-1 text-muted">
            {products === null
              ? "Loading products…"
              : `${visibleProducts.length} ${visibleProducts.length === 1 ? "product" : "products"}${
                  query ? ` matching “${query}”` : ""
                }`}
          </p>
        </div>

        <div className="flex w-full flex-wrap gap-3 sm:w-auto">
          <form
            role="search"
            onSubmit={(event) => event.preventDefault()}
            className="relative min-w-0 flex-1 sm:w-64 sm:flex-none"
          >
            <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={query}
              onChange={(event) => updateParam("q", event.target.value, "")}
              placeholder="Search products"
              aria-label="Search products"
              className="input rounded-full pl-10"
            />
          </form>

          <label className="flex items-center gap-2 text-sm text-muted">
            <span className="hidden sm:inline">Sort by</span>
            <select
              value={sortKey}
              onChange={(event) => updateParam("sort", event.target.value, "featured")}
              className="input w-auto cursor-pointer rounded-full pr-8"
            >
              {Object.entries(SORTS).map(([key, sort]) => (
                <option key={key} value={key}>
                  {sort.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {/* Category chips (empty categories are hidden) */}
      <nav aria-label="Categories" className="scroll-row -mx-4 mt-6 gap-2 px-4 pb-1">
        <CategoryChip
          label="All"
          count={products?.length}
          active={categorySlug === "all"}
          onClick={() => updateParam("category", "all", "all")}
        />
        {categories
          .filter((category) => category.product_count > 0 || category.slug === categorySlug)
          .map((category) => (
            <CategoryChip
              key={category.slug}
              label={category.name}
              count={category.product_count}
              active={category.slug === categorySlug}
              onClick={() => updateParam("category", category.slug, "all")}
            />
          ))}
      </nav>

      <div className="mt-8">
        {error ? (
          <div className="card px-6 py-14 text-center">
            <h2 className="text-2xl font-semibold">The shop didn't load</h2>
            <p className="mx-auto mt-2 max-w-md text-muted">{error}</p>
            <button type="button" onClick={load} className="btn-primary mt-6">
              Try again
            </button>
          </div>
        ) : products === null ? (
          <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:gap-x-6 md:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }, (_, index) => (
              <ProductCardSkeleton key={index} />
            ))}
          </div>
        ) : visibleProducts.length === 0 ? (
          <div className="card px-6 py-14 text-center">
            <h2 className="text-2xl font-semibold">No products found</h2>
            <p className="mx-auto mt-2 max-w-md text-muted">
              {query
                ? `Nothing matches “${query}”${activeCategory ? ` in ${activeCategory.name}` : ""}.`
                : "There's nothing in this category yet."}
            </p>
            {hasFilters && (
              <button
                type="button"
                onClick={() => setSearchParams({}, { replace: true })}
                className="btn-secondary mt-6"
              >
                Show all products
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:gap-x-6 md:grid-cols-3 lg:grid-cols-4">
              {pageProducts.map((product) => (
                <ProductCard
                  key={product.product_id}
                  product={product}
                  addToCart={() => addToCart(product)}
                />
              ))}
            </div>
            {totalPages > 1 && (
              <nav aria-label="Pagination" className="mt-10 flex items-center justify-center gap-4">
                <button
                  type="button"
                  disabled={currentPage === 1}
                  onClick={() => updateParam("page", String(currentPage - 1), "1")}
                  className="btn-secondary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="text-sm text-muted">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  type="button"
                  disabled={currentPage === totalPages}
                  onClick={() => updateParam("page", String(currentPage + 1), "1")}
                  className="btn-secondary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </nav>
            )}
          </>
        )}
      </div>
    </PageLayout>
  );
}

function CategoryChip({ label, count, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 cursor-pointer whitespace-nowrap rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
        active
          ? "border-berry bg-berry text-on-berry"
          : "border-line bg-card text-ink hover:border-berry hover:text-berry"
      }`}
    >
      {label}
      {count != null && <span className={active ? "ml-1.5 text-on-berry/75" : "ml-1.5 text-muted"}>{count}</span>}
    </button>
  );
}
