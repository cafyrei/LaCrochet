import { Link } from "react-router";
import { CheckIcon } from "../Icons";

const STEPS = [
  { id: "cart", label: "Cart", to: "/cart" },
  { id: "details", label: "Details & payment" },
  { id: "done", label: "Done" },
];

// "Cart → Details & payment → Done", so customers see where they are in buying.
// current: "cart" | "details" | "done"
export default function CheckoutSteps({ current }) {
  const currentIndex = STEPS.findIndex((step) => step.id === current);

  return (
    <nav aria-label="Checkout progress">
      <ol className="flex items-center gap-2 text-sm">
        {STEPS.map((step, index) => {
          const done = index < currentIndex;
          const isCurrent = index === currentIndex;
          const circle = (
            <span
              className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold transition-colors ${
                done ? "bg-berry text-on-berry" : isCurrent ? "bg-ink text-cream" : "bg-sand text-muted"
              }`}
            >
              {done ? <CheckIcon className="h-4 w-4" /> : index + 1}
            </span>
          );
          return (
            <li key={step.id} className="flex items-center gap-2" aria-current={isCurrent ? "step" : undefined}>
              {index > 0 && (
                <span
                  className={`h-px w-6 sm:w-12 ${index <= currentIndex ? "bg-berry" : "bg-line"}`}
                  aria-hidden="true"
                />
              )}
              {done && step.to && current !== "done" ? (
                <Link to={step.to} className="flex items-center gap-2 font-semibold text-ink hover:text-berry">
                  {circle}
                  <span className="hidden sm:inline">{step.label}</span>
                </Link>
              ) : (
                <span className={`flex items-center gap-2 ${isCurrent ? "font-semibold text-ink" : "text-muted"}`}>
                  {circle}
                  <span className={isCurrent ? "" : "hidden sm:inline"}>{step.label}</span>
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
