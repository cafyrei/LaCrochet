import { useState } from "react";
import { Link } from "react-router";
import { subscribeToNewsletter } from "../api/newsletter";

const footerGroups = [
  {
    title: "Shop",
    links: [
      { label: "All products", to: "/catalog" },
      { label: "Yarn & fibers", to: "/catalog?category=yarn-and-fibers" },
      { label: "Hooks & notions", to: "/catalog?category=hooks-and-notions" },
      { label: "Crochet kits", to: "/catalog?category=crochet-kits" },
      { label: "Finished pieces", to: "/catalog?category=finished-goods" },
    ],
  },
  {
    title: "Help",
    links: [
      { label: "Track an order", to: "/help#track-order" },
      { label: "Shipping & delivery", to: "/help#shipping" },
      { label: "Returns & exchanges", to: "/help#returns" },
      { label: "FAQs", to: "/help#faqs" },
      { label: "Contact us", to: "/contact" },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="night mt-16">
      {/* "night": stays dark brown in both light and dark mode (see index.css) */}
      {/* The crochet trim along the top of the Footer */}
      <div className="scallop-up" aria-hidden="true" />

      <div className="bg-ink text-cream/75">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.6fr] lg:px-8">
          <div className="max-w-xs">
            <Link to="/" className="font-serif text-2xl font-semibold text-cream">
              La Crochet
            </Link>
            <p className="mt-3 text-sm leading-6">
              Crochet supplies and handmade pieces, made slowly in the Philippines.
            </p>
          </div>

          {footerGroups.map((group) => (
            <nav key={group.title} aria-label={group.title}>
              <h2 className="font-sans text-sm font-bold text-cream">{group.title}</h2>
              <ul className="mt-4 space-y-2.5 text-sm">
                {group.links.map((link) => (
                  <li key={link.label}>
                    <Link to={link.to} className="transition-colors hover:text-cream">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}

          <NewsletterForm />
        </div>

        <div className="border-t border-cream/10">
          <div className="mx-auto flex max-w-7xl flex-wrap justify-between gap-3 px-4 py-6 text-xs text-cream/50 sm:px-6 lg:px-8">
            <p>&copy; {new Date().getFullYear()} La Crochet. All rights reserved.</p>
            <p>
              <Link to="/terms" className="hover:text-cream">
                Terms of Service
              </Link>
              <span className="mx-2">/</span>
              <Link to="/privacy" className="hover:text-cream">
                Privacy Policy
              </Link>
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}

function NewsletterForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("idle"); // idle | sending | done | error
  const [message, setMessage] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    setStatus("sending");
    try {
      await subscribeToNewsletter(email);
      setStatus("done");
      setMessage("You're on the list. We'll email you when new pieces arrive.");
      setEmail("");
    } catch (error) {
      setStatus("error");
      setMessage(error.message);
    }
  }

  return (
    <div>
      <h2 className="font-sans text-sm font-bold text-cream">New pieces, first</h2>
      <p className="mt-4 text-sm leading-6">
        Get an email when new yarn and handmade pieces arrive. No spam.
      </p>

      <form onSubmit={handleSubmit} className="mt-4 flex gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-label="Email address"
          placeholder="you@example.com"
          className="min-w-0 flex-1 rounded-full border border-cream/20 bg-cream/5 px-4 py-2.5 text-sm text-cream outline-none placeholder:text-cream/40 focus:border-terracotta"
        />
        <button
          type="submit"
          disabled={status === "sending"}
          className="cursor-pointer rounded-full bg-terracotta px-5 text-sm font-bold text-ink transition-colors hover:bg-cream disabled:opacity-60"
        >
          {status === "sending" ? "Joining…" : "Join"}
        </button>
      </form>

      {message && (
        <p
          role="status"
          className={`mt-3 text-sm ${status === "error" ? "text-terracotta" : "text-cream"}`}
        >
          {message}
        </p>
      )}
    </div>
  );
}
