import { useEffect, useRef } from "react";
import AuthModal from "../AuthModal";
import { CheckIcon, CloseIcon, YarnIcon } from "../Icons";

const PERKS = ["Your cart is saved on every device", "Check out in a few taps", "See where each order is"];

// The log in / create account popup.
// It's a real <dialog>, so the browser keeps keyboard focus inside it, closes it
// with Esc (or the phone's back gesture) and makes the page behind it unclickable.
export default function CheckLogin({ showLogin, setShowLogin, reason }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (showLogin && !dialog.open) {
      dialog.showModal();
      dialog.querySelector("[data-autofocus]")?.focus();
    } else if (!showLogin && dialog.open) {
      dialog.close();
    }
  }, [showLogin]);

  // closedby="any" lets a click outside the box close it. Safari doesn't know
  // that yet, so do the same thing by hand there.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || "closedBy" in HTMLDialogElement.prototype) return;

    // Check where the pointer is, not what was clicked: the <dialog> itself is
    // also the target for clicks on its own padding.
    const isOutside = (event) => {
      const box = dialog.getBoundingClientRect();
      return (
        event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom
      );
    };
    let pressedOutside = false;
    const onDown = (event) => {
      pressedOutside = isOutside(event);
    };
    // Press AND release outside, so selecting text and letting go outside doesn't close it.
    const onUp = (event) => {
      if (pressedOutside && isOutside(event)) dialog.close();
    };
    dialog.addEventListener("pointerdown", onDown);
    dialog.addEventListener("pointerup", onUp);
    return () => {
      dialog.removeEventListener("pointerdown", onDown);
      dialog.removeEventListener("pointerup", onUp);
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      closedby="any"
      aria-label="Log in or create an account"
      onClose={() => setShowLogin(false)}
      className="auth-dialog"
    >
      {showLogin && (
        <div className="relative flex w-full flex-col md:flex-row">
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            aria-label="Close"
            className="absolute right-3 top-3 z-10 cursor-pointer rounded-full p-1.5 text-cream/80 hover:bg-white/10 hover:text-cream md:right-4 md:top-4 md:text-muted md:hover:bg-sand md:hover:text-ink"
          >
            <CloseIcon />
          </button>

          {/* Left: who we are and why an account helps */}
          <aside className="night relative flex shrink-0 items-center gap-3 bg-ink px-6 py-4 text-cream md:w-72 md:flex-col md:items-start md:justify-between md:px-8 md:py-10">
            <div className="scallop-right absolute inset-y-0 -right-2.5 hidden md:block" aria-hidden="true" />
            <div className="flex items-center gap-3 md:block">
              <YarnIcon className="h-8 w-8 text-terracotta md:h-12 md:w-12" />
              <p className="font-serif text-xl font-semibold md:mt-6 md:text-3xl">La Crochet</p>
            </div>
            <div className="hidden md:block">
              <p className="font-serif text-lg leading-snug">One account for your cart, checkout and orders.</p>
              <ul className="mt-5 space-y-3 text-sm text-cream/80">
                {PERKS.map((perk) => (
                  <li key={perk} className="flex gap-2.5">
                    <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-terracotta" />
                    {perk}
                  </li>
                ))}
              </ul>
            </div>
          </aside>

          {/* Right: the forms */}
          <div className="auth-scroll max-h-[calc(100dvh-1.5rem-4rem)] flex-1 overflow-y-auto px-6 py-8 sm:px-10 md:max-h-[calc(100dvh-1.5rem)] md:py-10">
            <AuthModal reason={reason} onClose={() => dialogRef.current?.close()} />
          </div>
        </div>
      )}
    </dialog>
  );
}
