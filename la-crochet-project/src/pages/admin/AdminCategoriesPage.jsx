import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import {
  createCategory,
  deleteCategory,
  getAdminCategories,
  reorderCategories,
  updateCategory,
} from "../../api/admin";
import AdminPageHeader, { LoadError } from "../../components/admin/AdminPageHeader";
import { ArrowDownIcon, ArrowUpIcon, PlusIcon } from "../../components/Icons";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";

export default function AdminCategoriesPage() {
  const { token } = useAuth();
  const { toast } = useToast();
  const [categories, setCategories] = useState(null); // null = loading
  const [error, setError] = useState("");
  const [orderError, setOrderError] = useState("");
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => {
    setError("");
    getAdminCategories(token)
      .then(setCategories)
      .catch((err) => setError(err.message));
  }, [token]);

  useEffect(load, [load]);

  // Swap a category with its neighbour, show it right away, then save the new order.
  async function move(index, direction) {
    const previous = categories;
    const next = [...categories];
    [next[index], next[index + direction]] = [next[index + direction], next[index]];
    setCategories(next);
    setOrderError("");
    try {
      setCategories(await reorderCategories(token, next.map((category) => category.category_id)));
    } catch (err) {
      setCategories(previous);
      setOrderError(err.message);
    }
  }

  function replace(updated) {
    toast(`Saved "${updated.name}"`);
    setCategories((current) =>
      current.map((category) => (category.category_id === updated.category_id ? updated : category))
    );
  }

  return (
    <>
      <AdminPageHeader
        title="Categories"
        description="The sections of your shop. Their order here is the order customers see."
      >
        {!adding && (
          <button type="button" onClick={() => setAdding(true)} className="btn-primary">
            <PlusIcon className="h-4 w-4" />
            Add category
          </button>
        )}
      </AdminPageHeader>

      {error ? (
        <LoadError message={error} onRetry={load} />
      ) : categories === null ? (
        <p className="py-16 text-center text-muted">Loading categories…</p>
      ) : (
        <>
          {adding && (
            <CategoryForm
              title="New category"
              submitLabel="Add category"
              onCancel={() => setAdding(false)}
              onSubmit={async (values) => {
                const created = await createCategory(token, values);
                setCategories((current) => [...current, created]);
                toast(`Added the "${created.name}" category`);
                setAdding(false);
              }}
            />
          )}

          {orderError && (
            <p role="alert" className="alert-error mb-4">
              {orderError}
            </p>
          )}

          {categories.length === 0 ? (
            <p className="card px-6 py-12 text-center text-muted">
              No categories yet. Add one so customers can browse by type.
            </p>
          ) : (
            <ul className="card divide-y divide-line">
              {categories.map((category, index) => (
                <CategoryRow
                  key={category.category_id}
                  category={category}
                  isFirst={index === 0}
                  isLast={index === categories.length - 1}
                  onMoveUp={() => move(index, -1)}
                  onMoveDown={() => move(index, 1)}
                  onSaved={replace}
                  onDeleted={() => {
                    setCategories((current) => current.filter((item) => item.category_id !== category.category_id));
                    toast({ message: `Deleted "${category.name}"`, tone: "info" });
                  }}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}

function CategoryRow({ category, isFirst, isLast, onMoveUp, onMoveDown, onSaved, onDeleted }) {
  const { token } = useAuth();
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (editing) {
    return (
      <li className="p-2">
        <CategoryForm
          title={`Edit ${category.name}`}
          submitLabel="Save changes"
          initial={category}
          onCancel={() => setEditing(false)}
          onSubmit={async (values) => {
            onSaved(await updateCategory(token, category.category_id, values));
            setEditing(false);
          }}
          flat
        />
      </li>
    );
  }

  async function remove() {
    setBusy(true);
    setError("");
    try {
      await deleteCategory(token, category.category_id);
      onDeleted();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  const hidden = category.product_count - category.on_sale_count;

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-4 sm:px-5">
      <div className="flex flex-col">
        <button
          type="button"
          onClick={onMoveUp}
          disabled={isFirst}
          aria-label={`Move ${category.name} up`}
          className="cursor-pointer rounded-md p-0.5 text-muted hover:bg-sand hover:text-ink disabled:cursor-default disabled:opacity-25 disabled:hover:bg-transparent"
        >
          <ArrowUpIcon className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={isLast}
          aria-label={`Move ${category.name} down`}
          className="cursor-pointer rounded-md p-0.5 text-muted hover:bg-sand hover:text-ink disabled:cursor-default disabled:opacity-25 disabled:hover:bg-transparent"
        >
          <ArrowDownIcon className="h-4 w-4" />
        </button>
      </div>

      <div className="min-w-0 flex-1">
        <p className="font-bold">{category.name}</p>
        {category.description && <p className="text-sm text-muted">{category.description}</p>}
        <p className="mt-0.5 text-xs text-muted">
          <Link to={`/catalog?category=${category.slug}`} className="hover:text-ink hover:underline">
            /catalog?category={category.slug}
          </Link>
        </p>
      </div>

      <p className="w-36 text-sm tabular-nums">
        {category.on_sale_count} on sale
        {hidden > 0 && <span className="block text-xs text-muted">{hidden} hidden</span>}
      </p>

      {confirmingDelete ? (
        <div className="w-full rounded-xl border border-berry/30 bg-blush/60 p-3 text-sm sm:w-auto">
          <p className="font-semibold">Delete {category.name}?</p>
          <p className="text-muted">
            {category.product_count > 0
              ? `Its ${category.product_count} ${category.product_count === 1 ? "product stays" : "products stay"} in the shop with no category.`
              : "It has no products."}
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={remove}
              className="cursor-pointer rounded-full bg-berry px-3 py-1.5 text-xs font-bold text-on-berry hover:bg-berry-dark"
            >
              Yes, delete it
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              className="cursor-pointer rounded-full px-3 py-1.5 text-xs font-bold hover:bg-sand"
            >
              Keep it
            </button>
          </div>
          {error && <p className="mt-2 text-berry">{error}</p>}
        </div>
      ) : (
        <div className="flex gap-1">
          <button type="button" onClick={() => setEditing(true)} className="btn-quiet">
            Edit
          </button>
          <button type="button" onClick={() => setConfirmingDelete(true)} className="btn-quiet text-berry">
            Delete
          </button>
        </div>
      )}
    </li>
  );
}

function CategoryForm({ title, submitLabel, initial, onSubmit, onCancel, flat = false }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSubmit({ name, description });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      onKeyDown={(event) => event.key === "Escape" && onCancel()}
      className={`${flat ? "rounded-xl bg-sand/60" : "card mb-4"} space-y-4 p-5`}
    >
      <h2 className="font-sans text-base font-bold">{title}</h2>
      <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
        <div>
          <label htmlFor={`cat-name-${initial?.category_id ?? "new"}`} className="label">
            Name
          </label>
          <input
            id={`cat-name-${initial?.category_id ?? "new"}`}
            required
            maxLength={100}
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="input"
          />
        </div>
        <div>
          <label htmlFor={`cat-desc-${initial?.category_id ?? "new"}`} className="label">
            Short description <span className="font-normal text-muted">(optional)</span>
          </label>
          <input
            id={`cat-desc-${initial?.category_id ?? "new"}`}
            maxLength={255}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="input"
          />
        </div>
      </div>
      {error && (
        <p role="alert" className="alert-error">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="btn-quiet">
          Cancel
        </button>
        <button type="submit" disabled={busy} className="btn-primary">
          {busy ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
