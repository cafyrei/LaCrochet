import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { AlertIcon, CheckIcon, CloseIcon } from "../components/Icons";

// Small messages that slide in at the bottom-left ("Added to your cart", "You're logged out").
// One shared corner for every message, so screen reader users always find them
// in the same place. Each message closes by itself after a few seconds, except
// while the mouse is over it or keyboard focus is inside it.

const ToastContext = createContext(null);
const LEAVE_MS = 200; // matches the exit animation in index.css
let nextId = 1;

// Read the message out loud for screen reader users.
function announce(text, liveRegion) {
  if (typeof document.ariaNotify === "function") {
    document.ariaNotify(text);
  } else if (liveRegion) {
    liveRegion.textContent = "";
    // A tiny pause makes screen readers notice the same message twice in a row.
    setTimeout(() => {
      liveRegion.textContent = text;
    }, 50);
  }
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const regionRef = useRef(null);
  const liveRef = useRef(null);

  const dismiss = useCallback((id) => {
    // Play the exit animation first, then remove it.
    setToasts((list) => list.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), LEAVE_MS);
  }, []);

  // toast("Saved") or toast({ message, tone: "success" | "info" | "error", action: { label, to | onClick } })
  const toast = useCallback((input) => {
    const options = typeof input === "string" ? { message: input } : input;
    const item = { id: nextId++, tone: "success", duration: 5000, ...options };
    // The same message again (e.g. adding 3 things in a row) replaces the old one
    // instead of stacking up copies. At most 3 different messages at once.
    setToasts((list) => [...list.filter((t) => t.message !== item.message).slice(-2), item]);
    announce(item.action ? `${item.message} Actions available.` : item.message, liveRef.current);
    return item.id;
  }, []);

  // The corner sits in the browser's "top layer" (above everything) while it has messages.
  useEffect(() => {
    const region = regionRef.current;
    if (!region?.showPopover) return; // older browser: it's a normal fixed box instead
    const open = region.matches(":popover-open");
    if (toasts.length > 0 && !open) region.showPopover();
    if (toasts.length === 0 && open) region.hidePopover();
  }, [toasts.length]);

  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      {children}
      <div ref={regionRef} popover="manual" role="region" aria-label="Notifications" className="toast-region">
        {toasts.map((item) => (
          <Toast key={item.id} item={item} dismiss={dismiss} />
        ))}
      </div>
      <p className="sr-only">Notifications</p>
      <div ref={liveRef} aria-live="polite" className="sr-only" />
    </ToastContext.Provider>
  );
}

function Toast({ item, dismiss }) {
  const boxRef = useRef(null);
  const [paused, setPaused] = useState(false);
  const { id } = item;
  const onDismiss = useCallback(() => dismiss(id), [dismiss, id]);

  // Close by itself, unless the person is hovering or focused inside it.
  useEffect(() => {
    if (paused || item.leaving || !item.duration) return;
    const timer = setTimeout(onDismiss, item.duration);
    return () => clearTimeout(timer);
  }, [paused, item.leaving, item.duration, onDismiss]);

  function closeByHand() {
    // If focus was in this message, move it to the next one (or let it fall back to the page).
    const next = boxRef.current?.nextElementSibling ?? boxRef.current?.previousElementSibling;
    if (boxRef.current?.contains(document.activeElement)) next?.querySelector("button, a")?.focus();
    onDismiss();
  }

  const Icon = item.tone === "error" ? AlertIcon : CheckIcon;

  return (
    <div
      ref={boxRef}
      className="toast night"
      data-tone={item.tone}
      data-leaving={item.leaving || undefined}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(event) => !event.currentTarget.contains(event.relatedTarget) && setPaused(false)}
    >
      <span className="toast-icon" aria-hidden="true">
        <Icon className="h-4 w-4" />
      </span>
      <p className="min-w-0 flex-1 text-sm font-semibold">{item.message}</p>
      {item.action &&
        (item.action.to ? (
          <Link to={item.action.to} onClick={onDismiss} className="toast-action">
            {item.action.label}
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => {
              item.action.onClick();
              onDismiss();
            }}
            className="toast-action"
          >
            {item.action.label}
          </button>
        ))}
      <button type="button" onClick={closeByHand} aria-label="Close" className="toast-close">
        <CloseIcon className="h-4 w-4" />
      </button>
    </div>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside a ToastProvider");
  return context;
}
