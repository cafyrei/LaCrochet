import { useCallback, useEffect, useMemo, useState } from "react";
import { getSubscribers, unsubscribe } from "../../api/admin";
import AdminPageHeader, { LoadError } from "../../components/admin/AdminPageHeader";
import { CopyIcon, DownloadIcon, SearchIcon } from "../../components/Icons";
import { useAuth } from "../../context/AuthContext";

const VIEWS = [
  { id: "subscribed", label: "Subscribed", test: (s) => !s.unsubscribed_at },
  { id: "unsubscribed", label: "Unsubscribed", test: (s) => Boolean(s.unsubscribed_at) },
  { id: "all", label: "Everyone", test: () => true },
];

const shortDate = (value) =>
  new Intl.DateTimeFormat("en-PH", { dateStyle: "medium" }).format(new Date(value));

export default function AdminNewsletterPage() {
  const { token } = useAuth();
  const [subscribers, setSubscribers] = useState(null); // null = loading
  const [error, setError] = useState("");
  const [viewId, setViewId] = useState("subscribed");
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => {
    setError("");
    getSubscribers(token)
      .then(setSubscribers)
      .catch((err) => setError(err.message));
  }, [token]);

  useEffect(load, [load]);

  const view = VIEWS.find((item) => item.id === viewId);
  const active = useMemo(() => (subscribers ?? []).filter((s) => !s.unsubscribed_at), [subscribers]);

  const visible = useMemo(() => {
    const words = search.trim().toLowerCase();
    return (subscribers ?? []).filter(view.test).filter((s) => !words || s.email.includes(words));
  }, [subscribers, view, search]);

  // Every subscribed email, ready to paste into Gmail's "Bcc" box.
  async function copyEmails() {
    try {
      await navigator.clipboard.writeText(active.map((s) => s.email).join(", "));
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError("Your browser blocked copying. Use Download list instead.");
    }
  }

  // A spreadsheet file (CSV) that opens in Excel or Google Sheets.
  function downloadList() {
    const rows = [["Email", "Joined", "Status"]].concat(
      (subscribers ?? []).map((s) => [
        s.email,
        new Date(s.subscribed_at).toISOString().slice(0, 10),
        s.unsubscribed_at ? "Unsubscribed" : "Subscribed",
      ])
    );
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\r\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    link.download = `la-crochet-newsletter-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function replace(updated) {
    setSubscribers((current) => current.map((s) => (s.subscriber_id === updated.subscriber_id ? updated : s)));
  }

  return (
    <>
      <AdminPageHeader
        title="Newsletter"
        description={
          subscribers
            ? `${active.length} ${active.length === 1 ? "person wants" : "people want"} to hear about new yarn and pieces.`
            : "People who joined from the shop's footer."
        }
      >
        {subscribers?.length > 0 && (
          <>
            <button type="button" onClick={copyEmails} disabled={active.length === 0} className="btn-secondary">
              <CopyIcon className="h-4 w-4" />
              {copied ? "Copied" : "Copy emails"}
            </button>
            <button type="button" onClick={downloadList} className="btn-primary">
              <DownloadIcon className="h-4 w-4" />
              Download list
            </button>
          </>
        )}
      </AdminPageHeader>

      <p aria-live="polite" className="sr-only">
        {copied ? `${active.length} emails copied` : ""}
      </p>

      {error && subscribers === null ? (
        <LoadError message={error} onRetry={load} />
      ) : subscribers === null ? (
        <p className="py-16 text-center text-muted">Loading subscribers…</p>
      ) : subscribers.length === 0 ? (
        <p className="card px-6 py-12 text-center text-muted">
          No one has joined yet. The sign-up box is in the footer of every shop page.
        </p>
      ) : (
        <>
          {error && <p className="alert-error mb-4">{error}</p>}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div role="tablist" aria-label="Show subscribers" className="flex gap-2">
              {VIEWS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={item.id === viewId}
                  onClick={() => setViewId(item.id)}
                  className="chip"
                >
                  {item.label}
                  <span className="opacity-60 tabular-nums">{subscribers.filter(item.test).length}</span>
                </button>
              ))}
            </div>
            <div className="relative w-full sm:w-64">
              <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search emails"
                aria-label="Search emails"
                className="input rounded-full py-2 pl-10"
              />
            </div>
          </div>

          <ul className="card mt-5 divide-y divide-line">
            {visible.map((subscriber) => (
              <SubscriberRow key={subscriber.subscriber_id} subscriber={subscriber} onUpdated={replace} />
            ))}
            {visible.length === 0 && <li className="px-6 py-10 text-center text-muted">No one here.</li>}
          </ul>
        </>
      )}
    </>
  );
}

function SubscriberRow({ subscriber, onUpdated }) {
  const { token } = useAuth();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    setBusy(true);
    setError("");
    try {
      onUpdated(await unsubscribe(token, subscriber.subscriber_id));
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
      <div className="min-w-0 flex-1">
        <p className={`truncate font-semibold ${subscriber.unsubscribed_at ? "text-muted line-through" : ""}`}>
          {subscriber.email}
        </p>
        <p className="text-xs text-muted">
          Joined {shortDate(subscriber.subscribed_at)}
          {subscriber.unsubscribed_at && `, unsubscribed ${shortDate(subscriber.unsubscribed_at)}`}
        </p>
      </div>
      {!subscriber.unsubscribed_at &&
        (confirming ? (
          <div className="flex items-center gap-2 text-sm">
            <span>Stop emailing them?</span>
            <button
              type="button"
              disabled={busy}
              onClick={remove}
              className="cursor-pointer rounded-full bg-berry px-3 py-1.5 text-xs font-bold text-on-berry hover:bg-berry-dark"
            >
              Unsubscribe
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="cursor-pointer rounded-full px-3 py-1.5 text-xs font-bold hover:bg-sand"
            >
              Keep
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirming(true)} className="btn-quiet text-muted hover:text-berry">
            Unsubscribe
          </button>
        ))}
      {error && <p className="w-full text-sm text-berry">{error}</p>}
    </li>
  );
}
