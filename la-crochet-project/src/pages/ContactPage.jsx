import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { getShopInfo, sendContactMessage } from "../api/contact";
import { AlertIcon, CheckIcon, ClockIcon, MailIcon, PhoneIcon, PinIcon } from "../components/Icons";
import PageLayout from "../components/PageLayout";
import { useAuth } from "../context/AuthContext";
import { useFieldErrors } from "../utils/fieldErrors";

const TOPICS = [
  { value: "order", label: "A question about my order" },
  { value: "custom", label: "A custom or made-to-order piece" },
  { value: "product", label: "A question about a product" },
  { value: "other", label: "Something else" },
];

const MAX_LENGTH = 2000;

export default function ContactPage() {
  const [shop, setShop] = useState(null);

  useEffect(() => {
    getShopInfo()
      .then(setShop)
      .catch(() => setShop({})); // details are a bonus; the form still works
  }, []);

  return (
    <PageLayout width="wide">
      <div className="max-w-2xl">
        <h1 className="page-title">Contact us</h1>
        <p className="mt-4 text-lg leading-8 text-ink/85">
          Questions about an order, a custom piece, or which yarn to pick? Send us a message and
          we'll reply by email.
        </p>
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_360px] lg:items-start">
        <ContactForm />
        <aside className="space-y-4 lg:sticky lg:top-28">
          <ShopDetails shop={shop} />
          <div className="card p-6">
            <h2 className="text-lg font-semibold">Quick answers</h2>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <Link to="/orders" className="link">
                  Where's my order?
                </Link>{" "}
                <span className="text-muted">See it in My orders.</span>
              </li>
              <li>
                <Link to="/help#shipping" className="link">
                  Delivery and pickup
                </Link>{" "}
                <span className="text-muted">Fees and how it works.</span>
              </li>
              <li className="text-muted">
                Or tap <strong className="text-ink">Ask Yarnie</strong> in the corner for a quick answer.
              </li>
            </ul>
          </div>
        </aside>
      </div>
    </PageLayout>
  );
}

// ------------------------------------------------------------------
// The shop's details: only the ones set in backend/.env are shown.
// ------------------------------------------------------------------
function ShopDetails({ shop }) {
  if (shop === null) {
    return (
      <div className="card space-y-3 p-6" aria-busy="true" aria-label="Loading the shop's details">
        <div className="skeleton h-4 w-2/3 rounded-full" />
        <div className="skeleton h-4 w-1/2 rounded-full" />
        <div className="skeleton h-4 w-3/4 rounded-full" />
      </div>
    );
  }

  const rows = [
    shop.phone && {
      icon: PhoneIcon,
      label: "Call or text",
      value: shop.phone,
      href: `tel:${shop.phone.replace(/[^\d+]/g, "")}`,
    },
    shop.email && { icon: MailIcon, label: "Email", value: shop.email, href: `mailto:${shop.email}` },
    shop.address && { icon: PinIcon, label: "Pickup address", value: shop.address },
    shop.hours && { icon: ClockIcon, label: "Hours", value: shop.hours },
  ].filter(Boolean);
  const socials = [
    shop.facebook && { label: "Facebook", href: shop.facebook },
    shop.instagram && { label: "Instagram", href: shop.instagram },
  ].filter(Boolean);

  if (rows.length === 0 && socials.length === 0) return null;

  return (
    <div className="card p-6">
      <h2 className="text-lg font-semibold">{shop.name ?? "La Crochet"}</h2>
      <dl className="mt-4 space-y-4">
        {rows.map(({ icon: Icon, label, value, href }) => (
          <div key={label} className="flex gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blush text-berry">
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <dt className="text-xs font-semibold text-muted">{label}</dt>
              <dd className="break-words font-semibold">
                {href ? (
                  <a href={href} className="hover:text-berry">
                    {value}
                  </a>
                ) : (
                  value
                )}
              </dd>
            </div>
          </div>
        ))}
      </dl>
      {socials.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
          {socials.map((social) => (
            <a
              key={social.label}
              href={social.href}
              target="_blank"
              rel="noopener noreferrer"
              className="chip"
            >
              {social.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------
// The message form
// ------------------------------------------------------------------
function ContactForm() {
  const { user, token } = useAuth();
  const [params] = useSearchParams();
  const formRef = useRef(null);
  useFieldErrors(formRef);

  // Links like /contact?topic=custom or /contact?topic=order&order=LC-2026-0012 pre-fill the form.
  const startTopic = TOPICS.some((t) => t.value === params.get("topic")) ? params.get("topic") : "";
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    topic: startTopic,
    orderNumber: params.get("order") ?? "",
    message: "",
  });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sentTo, setSentTo] = useState(null);

  // Logged in? Fill in who they are (only boxes that are still empty), once per account.
  const [filledFor, setFilledFor] = useState(null);
  if (user && filledFor !== user.user_id) {
    setFilledFor(user.user_id);
    setForm((current) => ({
      ...current,
      name: current.name || `${user.first_name} ${user.last_name}`.trim(),
      email: current.email || user.email,
      phone: current.phone || user.phone || "",
    }));
  }

  function update(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSending(true);
    const trap = new FormData(event.currentTarget).get("website");
    try {
      await sendContactMessage(
        {
          name: form.name,
          email: form.email,
          phone: form.phone || null,
          topic: form.topic,
          order_number: form.topic === "order" ? form.orderNumber || null : null,
          message: form.message,
          website: trap || null,
        },
        token
      );
      setSentTo(form.email);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  // A box is wrong when they press Send: our own red message under the box is
  // clearer, so hide the browser's grey bubble and just move to the first problem.
  function handleInvalid(event) {
    event.preventDefault();
    const first = formRef.current?.querySelector(":invalid");
    if (first && document.activeElement !== first) first.focus();
  }

  function startAgain() {
    setForm((current) => ({ ...current, topic: "", orderNumber: "", message: "" }));
    setSentTo(null);
  }

  if (sentTo) {
    return (
      <section className="card px-6 py-14 text-center" role="status">
        <span className="success-pop mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-berry text-on-berry">
          <CheckIcon className="h-7 w-7" />
        </span>
        <h2 className="mt-5 font-serif text-3xl font-semibold">Message sent. Thank you!</h2>
        <p className="mx-auto mt-2 max-w-md text-muted">
          We'll reply to <strong className="text-ink">{sentTo}</strong> as soon as we can.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link to="/catalog" className="btn-primary">
            Keep shopping
          </Link>
          <button type="button" onClick={startAgain} className="btn-secondary">
            Send another message
          </button>
        </div>
      </section>
    );
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      onInvalidCapture={handleInvalid}
      className="checked-form card space-y-5 p-6 sm:p-8"
    >
      <h2 className="text-xl font-semibold">Send us a message</h2>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="contact-name" label="Your name" error="Please tell us your name.">
          <input
            id="contact-name"
            name="name"
            autoComplete="name"
            enterKeyHint="next"
            required
            maxLength={200}
            value={form.name}
            onChange={update}
            data-error="contact-name-error"
            className="input"
          />
        </Field>
        <Field id="contact-email" label="Email" error="Please enter your email like this: you@example.com">
          <input
            id="contact-email"
            name="email"
            type="email"
            autoComplete="email"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            enterKeyHint="next"
            required
            maxLength={255}
            value={form.email}
            onChange={update}
            data-error="contact-email-error"
            className="input"
          />
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          id="contact-phone"
          label="Mobile number"
          optional
          error="Please enter a mobile number, like 0917 123 4567."
        >
          <input
            id="contact-phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            enterKeyHint="next"
            pattern="[0-9+\-\(\)\s]{7,20}"
            placeholder="09XX XXX XXXX"
            value={form.phone}
            onChange={update}
            data-error="contact-phone-error"
            className="input"
          />
        </Field>
        <Field id="contact-topic" label="What's it about?" error="Please choose what your message is about.">
          <select
            id="contact-topic"
            name="topic"
            required
            value={form.topic}
            onChange={update}
            data-error="contact-topic-error"
            className="input cursor-pointer"
          >
            <option value="" disabled>
              Choose one…
            </option>
            {TOPICS.map((topic) => (
              <option key={topic.value} value={topic.value}>
                {topic.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {form.topic === "order" && (
        <Field
          id="contact-order"
          label="Order number"
          optional
          hint="It's in your confirmation email and in My orders."
          error="Order numbers look like LC-2026-0012."
        >
          <input
            id="contact-order"
            name="orderNumber"
            autoCorrect="off"
            autoCapitalize="characters"
            spellCheck={false}
            pattern="[Ll][Cc]-\d{4}-\d+"
            placeholder="LC-2026-0012"
            value={form.orderNumber}
            onChange={update}
            data-error="contact-order-error"
            className="input slide-down"
          />
        </Field>
      )}

      <Field id="contact-message" label="Message" error="Please write your message.">
        <textarea
          id="contact-message"
          name="message"
          required
          rows={6}
          maxLength={MAX_LENGTH}
          value={form.message}
          onChange={update}
          placeholder={
            form.topic === "custom"
              ? "What would you like made? Colours, size, and when you need it."
              : "How can we help?"
          }
          data-error="contact-message-error"
          aria-describedby="contact-message-count"
          className="input resize-y leading-6"
        />
        <p id="contact-message-count" className="mt-1 text-right text-xs text-muted tabular-nums">
          {form.message.length} / {MAX_LENGTH}
        </p>
      </Field>

      {/* Spam trap: hidden from people and screen readers; robots fill it in. */}
      <div className="trap-field" aria-hidden="true">
        <label htmlFor="contact-website">Website</label>
        <input id="contact-website" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      {error && (
        <p role="alert" className="alert-error flex gap-2">
          <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
        <p className="text-sm text-muted">We only use your details to reply to you.</p>
        <button type="submit" disabled={sending} className="btn-primary px-8">
          {sending && (
            <span
              className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
              aria-hidden="true"
            />
          )}
          {sending ? "Sending…" : "Send message"}
        </button>
      </div>

      <p data-announcer aria-live="polite" className="sr-only" />
    </form>
  );
}

// Label + box + the error that shows once someone has finished with the box.
function Field({ id, label, optional, hint, error, children }) {
  return (
    <div className="field">
      <label htmlFor={id} className="label">
        {label} {optional && <span className="font-normal text-muted">(optional)</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
      <p id={`${id}-error`} className="field-error">
        <AlertIcon className="h-4 w-4 shrink-0" />
        {error}
      </p>
    </div>
  );
}
