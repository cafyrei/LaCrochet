import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router";
import { getMessages, setMessageStatus } from "../../api/admin";
import AdminPageHeader, { LoadError } from "../../components/admin/AdminPageHeader";
import { MailIcon, PhoneIcon } from "../../components/Icons";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { formatDate } from "../../utils/format";

// Messages sent from the shop's Contact page.

const TOPIC_LABEL = {
  order: "Order question",
  custom: "Custom piece",
  product: "Product question",
  other: "Other",
};

const VIEWS = [
  { id: "new", label: "New", test: (m) => m.status === "new" },
  { id: "open", label: "Not replied yet", test: (m) => m.status !== "replied" },
  { id: "replied", label: "Replied", test: (m) => m.status === "replied" },
  { id: "all", label: "All", test: () => true },
];

export default function AdminMessagesPage() {
  const { token } = useAuth();
  const { toast } = useToast();
  const { refreshCounts } = useOutletContext();
  const [messages, setMessages] = useState(null); // null = loading
  const [error, setError] = useState("");
  const [viewId, setViewId] = useState("open");

  const load = useCallback(() => {
    setError("");
    getMessages(token)
      .then(setMessages)
      .catch((err) => setError(err.message));
  }, [token]);

  useEffect(load, [load]);

  const view = VIEWS.find((item) => item.id === viewId);
  const visible = useMemo(() => (messages ?? []).filter(view.test), [messages, view]);
  const count = (id) => (messages ?? []).filter(VIEWS.find((item) => item.id === id).test).length;

  async function changeStatus(message, status) {
    try {
      const updated = await setMessageStatus(token, message.message_id, status);
      setMessages((current) => current.map((m) => (m.message_id === updated.message_id ? updated : m)));
      refreshCounts();
      if (status === "replied") toast(`Marked ${message.name}'s message as replied`);
    } catch (err) {
      toast({ message: err.message, tone: "error" });
    }
  }

  return (
    <>
      <AdminPageHeader
        title="Messages"
        description="What customers sent from the Contact page. Reply by email, then mark it as replied."
      />

      {error && messages === null ? (
        <LoadError message={error} onRetry={load} />
      ) : messages === null ? (
        <p className="py-16 text-center text-muted">Loading messages…</p>
      ) : messages.length === 0 ? (
        <p className="card px-6 py-12 text-center text-muted">
          No messages yet. They'll appear here when someone uses the{" "}
          <Link to="/contact" className="link">
            Contact page
          </Link>
          .
        </p>
      ) : (
        <>
          <div role="tablist" aria-label="Show messages" className="scroll-row flex gap-2">
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
                <span className="text-xs opacity-70 tabular-nums">{count(item.id)}</span>
              </button>
            ))}
          </div>

          {visible.length === 0 ? (
            <p className="card mt-5 px-6 py-12 text-center text-muted">
              {viewId === "new" || viewId === "open" ? "All caught up. Nice!" : "Nothing here."}
            </p>
          ) : (
            <ul className="mt-5 space-y-4">
              {visible.map((message) => (
                <MessageCard key={message.message_id} message={message} onStatus={changeStatus} />
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}

function MessageCard({ message, onStatus }) {
  const isNew = message.status === "new";
  const replySubject = `Re: your message to La Crochet${message.order_number ? ` (${message.order_number})` : ""}`;
  const replyLink = `mailto:${message.email}?subject=${encodeURIComponent(replySubject)}`;

  return (
    <li className={`card message-card p-5 sm:p-6 ${isNew ? "border-l-4 border-l-berry" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            <span className="font-bold">{message.name}</span>
            {isNew && <span className="rounded-full bg-berry px-2 py-0.5 text-xs font-bold text-on-berry">New</span>}
            {message.status === "replied" && (
              <span className="rounded-full bg-sand px-2 py-0.5 text-xs font-bold text-muted">Replied</span>
            )}
            {message.has_account && <span className="text-xs text-muted">has an account</span>}
          </p>
          <p className="mt-0.5 text-sm text-muted">
            {TOPIC_LABEL[message.topic] ?? message.topic}, {formatDate(message.created_at)}
          </p>
        </div>
        {message.order_number && (
          <Link
            to={`/admin/orders?order=${encodeURIComponent(message.order_number)}`}
            className="chip"
          >
            Open {message.order_number}
          </Link>
        )}
      </div>

      <p className="mt-4 whitespace-pre-wrap break-words leading-7">{message.message}</p>

      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <a
          href={replyLink}
          onClick={() => isNew && onStatus(message, "read")}
          className="btn-primary btn-small"
        >
          <MailIcon className="h-4 w-4" />
          Reply by email
        </a>
        {message.phone && (
          <a href={`tel:${message.phone.replace(/[^\d+]/g, "")}`} className="btn-secondary btn-small">
            <PhoneIcon className="h-4 w-4" />
            {message.phone}
          </a>
        )}
        <span className="text-sm text-muted break-all">{message.email}</span>
        <div className="ml-auto flex gap-2">
          {message.status !== "replied" ? (
            <button type="button" onClick={() => onStatus(message, "replied")} className="btn-quiet btn-small">
              Mark as replied
            </button>
          ) : (
            <button type="button" onClick={() => onStatus(message, "new")} className="btn-quiet btn-small">
              Move back to new
            </button>
          )}
          {isNew && (
            <button type="button" onClick={() => onStatus(message, "read")} className="btn-quiet btn-small">
              Mark as read
            </button>
          )}
        </div>
      </div>
    </li>
  );
}
