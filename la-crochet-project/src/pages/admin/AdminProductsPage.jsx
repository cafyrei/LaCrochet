import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useOutletContext, useSearchParams } from "react-router";
import { createProduct, getAllProducts, updateProduct, uploadProductPhoto } from "../../api/admin";
import { getCategories } from "../../api/products";
import AdminPageHeader, { LoadError } from "../../components/admin/AdminPageHeader";
import Toggle from "../../components/admin/Toggle";
import { CloseIcon, PlusIcon, SearchIcon } from "../../components/Icons";
import ProductImage from "../../components/ProductImage";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { formatPrice } from "../../utils/format";

const LOW_STOCK = 5;

const isLow = (product) => product.is_active && product.stock_qty <= LOW_STOCK;

const VIEWS = [
  { id: "all", label: "All", test: () => true },
  { id: "on-sale", label: "On sale", test: (product) => product.is_active },
  { id: "hidden", label: "Hidden", test: (product) => !product.is_active },
  { id: "low", label: "Running low", test: isLow },
  { id: "featured", label: "Featured", test: (product) => product.is_featured },
];

export default function AdminProductsPage() {
  const { token } = useAuth();
  const { toast } = useToast();
  const { refreshCounts } = useOutletContext();
  const [params, setParams] = useSearchParams();
  const view = VIEWS.find((item) => item.id === params.get("show")) ?? VIEWS[0];
  const [products, setProducts] = useState(null); // null = loading
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null); // a product, "new", or null

  const load = useCallback(() => {
    setError("");
    Promise.all([getAllProducts(token), getCategories()])
      .then(([productData, categoryData]) => {
        setProducts(productData);
        setCategories(categoryData);
      })
      .catch((err) => setError(err.message));
  }, [token]);

  useEffect(load, [load]);

  const categoryName = (id) => categories.find((category) => category.category_id === id)?.name ?? "No category";

  const visible = useMemo(() => {
    const words = search.trim().toLowerCase();
    return (products ?? [])
      .filter(view.test)
      .filter((product) => !words || product.name.toLowerCase().includes(words));
  }, [products, search, view]);

  function showView(id) {
    setParams(id === "all" ? {} : { show: id }, { replace: true });
  }

  function saved(product) {
    const isNew = !products?.some((item) => item.product_id === product.product_id);
    toast(isNew ? `Added ${product.name} to the shop` : `Saved ${product.name}`);
    setProducts((current) => {
      const exists = current.some((item) => item.product_id === product.product_id);
      return exists
        ? current.map((item) => (item.product_id === product.product_id ? product : item))
        : [...current, product];
    });
    refreshCounts();
  }

  return (
    <>
      <AdminPageHeader title="Products" description="Prices, stock, and what shows in the shop.">
        <button type="button" onClick={() => setEditing("new")} className="btn-primary">
          <PlusIcon className="h-4 w-4" />
          Add product
        </button>
      </AdminPageHeader>

      {error ? (
        <LoadError message={error} onRetry={load} />
      ) : products === null ? (
        <p className="py-16 text-center text-muted">Loading products…</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div role="tablist" aria-label="Show products" className="scroll-row -mx-4 gap-2 px-4 pb-1 sm:mx-0 sm:px-0">
              {VIEWS.map((item) => {
                const count = products.filter(item.test).length;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={item.id === view.id}
                    onClick={() => showView(item.id)}
                    className="chip"
                  >
                    {item.label}
                    {count > 0 && (
                      <span className={`tabular-nums ${item.id === "low" ? "" : "opacity-60"}`}>{count}</span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="relative w-full sm:w-64">
              <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search products"
                aria-label="Search products"
                className="input rounded-full py-2 pl-10"
              />
            </div>
          </div>

          <div className="card mt-5 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-line text-muted">
                <tr>
                  <th className="px-4 py-3 font-semibold">Product</th>
                  <th className="px-4 py-3 font-semibold">Price</th>
                  <th className="px-4 py-3 font-semibold">Stock</th>
                  <th className="px-4 py-3 font-semibold">On sale</th>
                  <th className="px-4 py-3 font-semibold">Featured</th>
                  <th className="px-4 py-3">
                    <span className="sr-only">Edit</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {visible.map((product) => (
                  <ProductRow
                    key={product.product_id}
                    product={product}
                    category={categoryName(product.category_id)}
                    token={token}
                    onSaved={saved}
                    onEdit={() => setEditing(product)}
                  />
                ))}
              </tbody>
            </table>
            {visible.length === 0 && (
              <p className="px-6 py-10 text-center text-muted">
                {view.id === "low" ? "Nothing is running low. Everything on sale has more than 5 left." : "No products match."}
              </p>
            )}
          </div>
        </>
      )}

      {editing && (
        <ProductForm
          product={editing === "new" ? null : editing}
          categories={categories}
          token={token}
          onClose={() => setEditing(null)}
          onSaved={(product) => {
            saved(product);
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

function ProductRow({ product, category, token, onSaved, onEdit }) {
  const [stock, setStock] = useState(String(product.stock_qty));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => setStock(String(product.stock_qty)), [product.stock_qty]);

  async function save(changes) {
    setBusy(true);
    setError("");
    try {
      onSaved(await updateProduct(token, product.product_id, changes));
    } catch (err) {
      setError(err.message);
      setStock(String(product.stock_qty));
    } finally {
      setBusy(false);
    }
  }

  function saveStock() {
    const value = Number(stock);
    if (stock === "" || !Number.isInteger(value) || value < 0) {
      setStock(String(product.stock_qty));
      return;
    }
    if (value !== product.stock_qty) save({ stock_qty: value });
  }

  const low = product.stock_qty <= LOW_STOCK;

  return (
    <tr className={product.is_active ? "" : "bg-cream/70"}>
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <ProductImage
            src={product.image_url}
            alt=""
            iconClassName="h-5 w-5"
            dimmed={!product.is_active}
            className="h-12 w-12 shrink-0 rounded-lg"
          />
          <div className="min-w-0">
            <Link to={`/products/${product.product_id}`} className="font-semibold hover:text-berry">
              {product.name}
            </Link>
            <p className="text-xs text-muted">
              {category}
              {!product.is_active && " (hidden from the shop)"}
            </p>
            {error && <p className="text-xs text-berry">{error}</p>}
          </div>
        </div>
      </td>
      <td className="px-4 py-3">{formatPrice(product.price)}</td>
      <td className="px-4 py-3">
        <input
          type="number"
          min="0"
          value={stock}
          disabled={busy}
          onChange={(event) => setStock(event.target.value)}
          onBlur={saveStock}
          onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
          aria-label={`Stock for ${product.name}`}
          className={`input w-20 px-2 py-1.5 ${low ? "border-berry/50 text-berry" : ""}`}
        />
      </td>
      <td className="px-4 py-3">
        <Toggle
          checked={product.is_active}
          disabled={busy}
          label={`${product.name} on sale`}
          onChange={(value) => save({ is_active: value })}
        />
      </td>
      <td className="px-4 py-3">
        <Toggle
          checked={product.is_featured}
          disabled={busy}
          label={`${product.name} featured on the home page`}
          onChange={(value) => save({ is_featured: value })}
        />
      </td>
      <td className="px-4 py-3 text-right">
        <button type="button" onClick={onEdit} className="btn-quiet">
          Edit
        </button>
      </td>
    </tr>
  );
}

function ProductForm({ product, categories, token, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: product?.name ?? "",
    description: product?.description ?? "",
    price: product ? String(product.price) : "",
    stock_qty: product ? String(product.stock_qty) : "0",
    category_id: product?.category_id != null ? String(product.category_id) : "",
    image_url: product?.image_url ?? "",
    is_active: product?.is_active ?? true,
    is_featured: product?.is_featured ?? false,
  });
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const close = (event) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [onClose]);

  const update = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }));

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const payload = {
      name: form.name,
      description: form.description,
      price: Number(form.price),
      stock_qty: Number(form.stock_qty),
      category_id: form.category_id ? Number(form.category_id) : null,
      image_url: form.image_url,
      is_active: form.is_active,
      is_featured: form.is_featured,
    };
    try {
      onSaved(
        product
          ? await updateProduct(token, product.product_id, payload)
          : await createProduct(token, payload)
      );
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="product-form-title"
      className="fixed inset-0 z-[100] flex justify-center overflow-y-auto bg-shade/40 p-4 sm:p-8"
      onClick={(event) => event.target === event.currentTarget && onClose()}
      // A photo dropped next to the box shouldn't open in the tab and lose the form.
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => event.preventDefault()}
    >
      <form onSubmit={handleSubmit} className="card relative my-auto w-full max-w-xl space-y-5 p-6 shadow-xl sm:p-8">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 cursor-pointer rounded-full p-1.5 text-muted hover:bg-sand hover:text-ink"
        >
          <CloseIcon />
        </button>
        <h2 id="product-form-title" className="text-2xl font-semibold">
          {product ? "Edit product" : "Add a product"}
        </h2>

        <div>
          <label htmlFor="pf-name" className="label">Name</label>
          <input id="pf-name" name="name" required maxLength={150} value={form.name} onChange={update} className="input" />
        </div>

        <div>
          <label htmlFor="pf-description" className="label">Description</label>
          <textarea
            id="pf-description"
            name="description"
            rows={3}
            maxLength={2000}
            value={form.description}
            onChange={update}
            className="input"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="pf-price" className="label">Price (₱)</label>
            <input id="pf-price" name="price" type="number" required min="0.01" step="0.01" value={form.price} onChange={update} className="input" />
          </div>
          <div>
            <label htmlFor="pf-stock" className="label">Stock</label>
            <input id="pf-stock" name="stock_qty" type="number" required min="0" step="1" value={form.stock_qty} onChange={update} className="input" />
          </div>
          <div>
            <label htmlFor="pf-category" className="label">Category</label>
            <select id="pf-category" name="category_id" value={form.category_id} onChange={update} className="input">
              <option value="">No category</option>
              {categories.map((category) => (
                <option key={category.category_id} value={category.category_id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <PhotoField
          token={token}
          value={form.image_url}
          name={form.name}
          onChange={(image_url) => setForm((current) => ({ ...current, image_url }))}
          onBusyChange={setUploading}
        />

        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-3 text-sm font-semibold">
            <Toggle
              checked={form.is_active}
              label="On sale"
              onChange={(value) => setForm((current) => ({ ...current, is_active: value }))}
            />
            On sale
          </label>
          <label className="flex items-center gap-3 text-sm font-semibold">
            <Toggle
              checked={form.is_featured}
              label="Featured on the home page"
              onChange={(value) => setForm((current) => ({ ...current, is_featured: value }))}
            />
            Featured on the home page
          </label>
        </div>

        {error && (
          <p role="alert" className="alert-error">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-quiet">
            Cancel
          </button>
          <button type="submit" disabled={busy || uploading} className="btn-primary">
            {busy ? "Saving…" : uploading ? "Uploading photo…" : product ? "Save changes" : "Add product"}
          </button>
        </div>
      </form>
    </div>
  );
}

const MAX_PHOTO_MB = 5;

// The product photo: drag a photo onto the box, click "Choose a photo", or paste one.
// The photo uploads straight away and the product keeps its new address.
function PhotoField({ token, value, name, onChange, onBusyChange }) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const inputRef = useRef(null);

  async function upload(file) {
    setError("");
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("That file isn't a photo. Please use a JPG, PNG, WebP or GIF.");
      return;
    }
    if (file.size > MAX_PHOTO_MB * 1024 * 1024) {
      setError(`That photo is over ${MAX_PHOTO_MB} MB. Please use a smaller one.`);
      return;
    }
    setUploading(true);
    onBusyChange(true);
    setStatus("Uploading photo…");
    try {
      const { image_url } = await uploadProductPhoto(token, file);
      onChange(image_url);
      setStatus("Photo uploaded.");
    } catch (err) {
      setError(err.message);
      setStatus("");
    } finally {
      setUploading(false);
      onBusyChange(false);
      if (inputRef.current) inputRef.current.value = ""; // lets the same file be picked again
    }
  }

  function handleDrop(event) {
    event.preventDefault();
    setDragging(false);
    upload(event.dataTransfer.files?.[0]);
  }

  function handlePaste(event) {
    const file = [...(event.clipboardData?.files ?? [])].find((item) => item.type.startsWith("image/"));
    if (file) {
      event.preventDefault();
      upload(file);
    }
  }

  return (
    <div>
      <span className="label" id="pf-photo-label">Photo</span>
      <div
        role="group"
        aria-labelledby="pf-photo-label"
        onDragEnter={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragOver={(event) => {
          event.preventDefault(); // needed, or the browser opens the photo instead of dropping it here
          event.dataTransfer.dropEffect = "copy";
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false);
        }}
        onDrop={handleDrop}
        onPaste={handlePaste}
        className={`flex items-center gap-4 rounded-2xl border-2 border-dashed p-4 transition-colors ${
          dragging ? "border-berry bg-blush/60" : "border-line bg-sand/40"
        }`}
      >
        <ProductImage
          key={value}
          src={value}
          alt={value ? `Photo of ${name || "this product"}` : "No photo yet"}
          className="h-24 w-24 shrink-0 rounded-xl"
        />
        <div className="min-w-0 space-y-2 text-sm">
          <p className="text-ink">
            {dragging ? "Drop the photo here" : "Drag a photo here, paste one, or"}
          </p>
          <div className="flex flex-wrap gap-2">
            <label htmlFor="pf-photo-file" className={`btn-secondary btn-small cursor-pointer ${uploading ? "pointer-events-none opacity-60" : ""}`}>
              {value ? "Change photo" : "Choose a photo"}
            </label>
            <input
              ref={inputRef}
              id="pf-photo-file"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              disabled={uploading}
              onChange={(event) => upload(event.target.files?.[0])}
              className="sr-only"
            />
            {value && !uploading && (
              <button type="button" onClick={() => onChange("")} className="btn-quiet btn-small">
                Remove photo
              </button>
            )}
          </div>
          <p className="text-xs text-muted">JPG, PNG, WebP or GIF, up to {MAX_PHOTO_MB} MB.</p>
        </div>
      </div>

      <p aria-live="polite" className={status && !error ? "mt-1 text-xs text-muted" : "sr-only"}>
        {status}
      </p>
      {error && (
        <p role="alert" className="mt-1 text-xs font-semibold text-berry">
          {error}
        </p>
      )}

      <details className="mt-2 text-xs text-muted">
        <summary className="cursor-pointer">Or type a photo address</summary>
        <input
          id="pf-image"
          name="image_url"
          aria-label="Photo address"
          maxLength={500}
          placeholder="/images/products/daisy-tote.jpg"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="input mt-2"
        />
      </details>
    </div>
  );
}
