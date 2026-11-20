import { useEffect, useState } from "react";
import { Link } from "react-router";
import PageLayout from "../components/PageLayout";
import { getDeliveryInfo } from "../api/delivery";

// Help page. Each section has an id so Footer links like /help#shipping jump straight to it.
// NOTE FOR THE OWNER: "Returns & exchanges" is a DRAFT policy. Read it and change the
// number of days or anything else before launch. Yarnie reads this page's rules from
// backend/routes/chatRoutes.py (SHOP FACTS), so update both together.

const peso = (amount) =>
  `₱${Number(amount).toLocaleString("en-PH", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

function Section({ id, title, children }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="card scroll-mt-28 p-6">
      <h2 id={`${id}-title`} className="text-xl font-semibold">
        {title}
      </h2>
      <div className="help-text mt-3 space-y-3 text-ink/85">{children}</div>
    </section>
  );
}

// One question in the FAQ list. <details> keeps answers findable with Ctrl+F.
function Question({ q, children }) {
  return (
    <details className="faq-item">
      <summary>{q}</summary>
      <div className="faq-answer space-y-2">{children}</div>
    </details>
  );
}

export default function HelpPage() {
  // Lalamove on: the fee depends on distance. Off: a flat fee. Ask the backend which.
  const [delivery, setDelivery] = useState(null);
  useEffect(() => {
    getDeliveryInfo().then(setDelivery).catch(() => setDelivery(null));
  }, []);

  const flatFee = delivery && !delivery.lalamove ? delivery.flat_fee : null;

  return (
    <PageLayout>
      <h1 className="page-title">Help</h1>
      <p className="mt-3 text-muted">
        Answers about ordering, delivery, returns and caring for your crochet pieces.
      </p>

      <div className="mt-8 space-y-4">
        <Section id="track-order" title="Track an order">
          <p>
            Log in and open{" "}
            <Link to="/orders" className="link">
              My orders
            </Link>{" "}
            to see where each order is:
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Pending</strong>: we've received your order (online orders wait here until the
              payment goes through).
            </li>
            <li>
              <strong>Preparing</strong>: we're getting your pieces ready.
            </li>
            <li>
              <strong>Ready for pickup</strong>: you can collect it at the shop.
            </li>
            <li>
              <strong>On the way</strong>: a rider has your parcel. Tap <em>Track your rider</em> to
              follow them live.
            </li>
            <li>
              <strong>Completed</strong>: delivered or picked up. Enjoy!
            </li>
          </ul>
          <p>You also get a private order link right after checkout that works without logging in.</p>
        </Section>

        <Section id="shipping" title="Shipping & delivery">
          <p>
            <strong>Store pickup is free.</strong> We'll let you know when your order is ready. The
            pickup address is on the{" "}
            <Link to="/contact" className="link">
              Contact page
            </Link>
            .
          </p>
          {flatFee !== null ? (
            <p>
              <strong>Home delivery costs a flat {peso(flatFee)}.</strong>
            </p>
          ) : (
            <p>
              <strong>Home delivery is by Lalamove motorcycle rider.</strong> The fee depends on the
              distance from our shop to your door. At checkout, drop a pin on the map and you'll see
              the exact fee before you place your order.
            </p>
          )}
          <p>
            We book your rider once your order is ready (and paid, if you paid online). When the rider
            picks it up, your order changes to <em>On the way</em> and a live tracking link appears
            in My orders.
          </p>
          <p>
            If Lalamove doesn't deliver to your pin yet, you'll see a message at checkout. You can
            choose store pickup instead.
          </p>
        </Section>

        <Section id="returns" title="Returns & exchanges">
          <p>
            Every piece is handmade, so we check each one before it leaves us. If something isn't
            right, we'll make it right.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Damaged, defective or wrong item:</strong> tell us within{" "}
              <strong>3 days</strong> of receiving it. Send your order number and a photo through the{" "}
              <Link to="/contact?topic=order" className="link">
                Contact page
              </Link>
              . We'll replace it, exchange it, or refund you.
            </li>
            <li>
              <strong>Change of mind:</strong> because each piece is made by hand in small batches, we
              can't accept returns for a change of mind.
            </li>
            <li>
              <strong>Custom and made-to-order pieces</strong> can't be returned or exchanged unless
              they arrive damaged or different from what we agreed.
            </li>
            <li>
              Items must be unused and unwashed, with any tags still on.
            </li>
          </ul>
          <p>
            <strong>Refunds:</strong> online payments are refunded through PayRex to the same GCash,
            Maya, card or QR Ph account you paid with. For cash on delivery, we'll arrange a transfer
            with you.
          </p>
        </Section>

        <section id="faqs" aria-labelledby="faqs-title" className="card scroll-mt-28 p-6">
          <h2 id="faqs-title" className="text-xl font-semibold">
            FAQs
          </h2>
          <div className="faq mt-3">
            <Question q="Do I need an account to order?">
              <p>
                Yes. You can browse and chat with Yarnie as a guest, but adding to cart and checking
                out need an account. Your cart is saved to your account, so it follows you to any
                device.
              </p>
            </Question>
            <Question q="How can I pay?">
              <p>
                Online through PayRex (GCash, Maya, cards or QR Ph), or cash on delivery. Online
                payments happen on PayRex's own secure page; we never see your card details.
              </p>
            </Question>
            <Question q="I closed the payment page. Did my order go through?">
              <p>
                If you finished paying, your order is marked paid automatically, even if you closed
                the tab. Check My orders. If you went back without paying, that order is cancelled
                and you can simply order again.
              </p>
            </Question>
            <Question q="Can I buy only some of the items in my cart?">
              <p>
                Yes. Tick the items you want in your cart and press Checkout. Unticked items stay in
                your cart for later.
              </p>
            </Question>
            <Question q="How much is delivery?">
              <p>
                See{" "}
                <a href="#shipping" className="link">
                  Shipping & delivery
                </a>{" "}
                above. Pickup at the shop is always free.
              </p>
            </Question>
            <Question q="Can I cancel my order?">
              <p>
                Send us a message through the{" "}
                <Link to="/contact?topic=order" className="link">
                  Contact page
                </Link>{" "}
                with your order number as soon as you can. We can cancel it while it hasn't been
                handed to a rider yet.
              </p>
            </Question>
            <Question q="Do you take custom orders?">
              <p>
                Yes! Tell us what you have in mind (colours, size, who it's for) through the{" "}
                <Link to="/contact?topic=custom" className="link">
                  Contact page
                </Link>
                , and we'll reply with a price and how long it will take.
              </p>
            </Question>
            <Question q="How do I care for my crochet piece?">
              <p>
                Hand wash in cold water with mild soap. Gently squeeze out the water (don't wring or
                twist), then lay it flat on a towel to dry, away from direct sun. No dryer, no bleach.
                Plushies can be spot-cleaned with a damp cloth.
              </p>
            </Question>
            <Question q="Who is Yarnie?">
              <p>
                Yarnie is our chat helper (the button in the corner). It can suggest pieces, answer
                shop questions and, when you're logged in, tell you about your own orders. For
                anything it isn't sure about, it will point you to us.
              </p>
            </Question>
            <Question q="I forgot my password.">
              <p>
                Send us a message through the{" "}
                <Link to="/contact" className="link">
                  Contact page
                </Link>{" "}
                using the email on your account, and we'll help you get back in.
              </p>
            </Question>
          </div>
        </section>
      </div>

      <p className="mt-8 text-sm text-muted">
        Still stuck?{" "}
        <Link to="/contact" className="link">
          Contact us
        </Link>
        .
      </p>
    </PageLayout>
  );
}
