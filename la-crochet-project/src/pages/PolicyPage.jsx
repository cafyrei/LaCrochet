import { Link } from "react-router";
import PageLayout from "../components/PageLayout";

// Terms of Service and Privacy Policy.
// NOTE FOR THE OWNER: these are DRAFTS written from how the shop works today.
// Have them checked (ideally by a lawyer) and change LAST_UPDATED whenever you edit them.
const LAST_UPDATED = "November 21, 2026";

function Part({ title, children }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold text-ink">{title}</h2>
      {children}
    </section>
  );
}

const contactLink = (
  <Link to="/contact" className="link">
    Contact page
  </Link>
);

function Terms() {
  return (
    <>
      <p>
        These terms apply when you use the La Crochet website or buy from us. By creating an account
        or placing an order, you agree to them.
      </p>

      <Part title="1. Your account">
        <p>
          You need an account to add items to your cart and check out. Keep your password private;
          you're responsible for orders placed with your account. Give us a correct name, phone
          number and address so we can reach you and deliver your order.
        </p>
      </Part>

      <Part title="2. Our products">
        <p>
          Every piece is handmade, so small differences in size, colour and stitches from the photos
          are normal and part of its charm. Colours can also look slightly different on different
          screens.
        </p>
      </Part>

      <Part title="3. Prices and payment">
        <ul className="list-disc space-y-1 pl-5">
          <li>Prices are in Philippine pesos (₱) and are the ones shown at checkout.</li>
          <li>
            You can pay online through PayRex (GCash, Maya, cards or QR Ph) or with cash on delivery.
            Online payments are handled on PayRex's own secure page.
          </li>
          <li>
            An online order is confirmed only once PayRex tells us the payment went through. If the
            payment page is left unpaid or you go back, the order is cancelled.
          </li>
        </ul>
      </Part>

      <Part title="4. Orders and cancellations">
        <p>
          We set your items aside when you place your order. We may cancel an order if an item turns
          out to be unavailable or a price was shown wrongly; if you already paid, we'll refund you in
          full. To cancel your own order, message us through the {contactLink} before it's handed to
          a rider.
        </p>
      </Part>

      <Part title="5. Delivery and pickup">
        <p>
          Store pickup is free. Home delivery is by Lalamove rider; the fee is shown at checkout
          before you order. Delivery times depend on the rider and traffic. Please make sure someone
          can receive the parcel at the pinned location. See{" "}
          <Link to="/help#shipping" className="link">
            Shipping & delivery
          </Link>
          .
        </p>
      </Part>

      <Part title="6. Returns and refunds">
        <p>
          Our{" "}
          <Link to="/help#returns" className="link">
            Returns & exchanges
          </Link>{" "}
          rules explain what we can replace or refund, and how.
        </p>
      </Part>

      <Part title="7. Yarnie, our chat helper">
        <p>
          Yarnie is an automatic helper powered by Google's Gemini. It tries to be accurate, but it
          can make mistakes. Prices, stock and order details shown on the website itself are the ones
          that count.
        </p>
      </Part>

      <Part title="8. Our content">
        <p>
          The photos, designs and text on this website belong to La Crochet. Please don't copy them
          for commercial use without asking us.
        </p>
      </Part>

      <Part title="9. Changes and governing law">
        <p>
          We may update these terms; the date at the top shows the latest version. These terms follow
          the laws of the Republic of the Philippines. Questions? Reach us through the {contactLink}.
        </p>
      </Part>
    </>
  );
}

function Privacy() {
  return (
    <>
      <p>
        We respect your privacy and handle your personal information under the Philippine{" "}
        <a
          href="https://privacy.gov.ph/data-privacy-act/"
          className="link"
          target="_blank"
          rel="noreferrer"
        >
          Data Privacy Act of 2012
        </a>{" "}
        (Republic Act No. 10173). This page explains what we collect, why, and who sees it.
      </p>

      <Part title="1. What we collect">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Account:</strong> your name, email, mobile number and password. Your password is
            stored scrambled (hashed), so no one, not even us, can read it.
          </li>
          <li>
            <strong>Delivery:</strong> your saved addresses and the map pin you drop at checkout.
          </li>
          <li>
            <strong>Orders:</strong> what you bought, totals, payment method and order status.
          </li>
          <li>
            <strong>Messages:</strong> what you send through the Contact page, and your email if you
            join our newsletter.
          </li>
          <li>
            <strong>On your device:</strong> your login and your light/dark mode choice are kept in
            your browser so you stay logged in and the site looks how you like.
          </li>
        </ul>
        <p>We never see or store your card, GCash or Maya details; you type those on PayRex's page.</p>
      </Part>

      <Part title="2. Why we use it">
        <p>
          To create your account, process and deliver your orders, answer your messages, send the
          newsletter you asked for, and keep the shop safe from misuse. We don't sell your
          information.
        </p>
      </Part>

      <Part title="3. Who we share it with">
        <p>Only what each partner needs to do its job:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>PayRex</strong> (online payments): your order number and amount.
          </li>
          <li>
            <strong>Lalamove</strong> (delivery): your name, mobile number, address and map pin.
          </li>
          <li>
            <strong>Google Gemini</strong> (Yarnie, the chat helper): the messages you type in the
            chat and, if you're logged in, a short summary of your own orders so Yarnie can answer
            about them. We don't save your chat on our side.
          </li>
          <li>
            <strong>Supabase</strong>: the service that stores our database securely.
          </li>
        </ul>
      </Part>

      <Part title="4. How long we keep it">
        <p>
          We keep your account while it's open, and order records for as long as needed for
          deliveries, returns and our business records. Ask us to delete your account anytime.
        </p>
      </Part>

      <Part title="5. Your rights">
        <p>
          Under the Data Privacy Act you can ask to see the information we hold about you, correct
          it, have it deleted or blocked, object to its use, or get a copy of it. Send your request
          through the {contactLink}. If you think we've mishandled your information, you can also
          complain to the{" "}
          <a href="https://privacy.gov.ph/" className="link" target="_blank" rel="noreferrer">
            National Privacy Commission
          </a>
          .
        </p>
      </Part>

      <Part title="6. Changes">
        <p>We'll update this page if anything changes; the date at the top shows the latest version.</p>
      </Part>
    </>
  );
}

const pages = {
  terms: { title: "Terms of Service", Body: Terms },
  privacy: { title: "Privacy Policy", Body: Privacy },
};

export default function PolicyPage({ type }) {
  const { title, Body } = pages[type];
  return (
    <PageLayout>
      <h1 className="page-title">{title}</h1>
      <p className="mt-3 text-sm text-muted">Last updated {LAST_UPDATED}</p>
      <article className="card mt-8 space-y-8 p-6 leading-7 text-ink/85 sm:p-8">
        <Body />
      </article>
    </PageLayout>
  );
}
