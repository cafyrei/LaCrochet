import { Link } from "react-router";
import { GiftIcon, HandIcon, HeartIcon } from "../components/Icons";
import PageLayout from "../components/PageLayout";
import yarnPhoto from "../assets/landing-page-carousel/yarn.jpg";
import teamPhoto from "../assets/team/developers.jpg";

// ------------------------------------------------------------------
// DRAFT TEXT: written as a starting point. Before launch, swap in the
// shop's real story (look for the TODO notes): who makes the pieces,
// when it started, and where you're based.
// ------------------------------------------------------------------

// How a piece goes from yarn to someone's hands (a real order of steps).
const STEPS = [
  {
    title: "Choose the yarn",
    text: "Yarn in colours and textures we'd happily wear and gift ourselves.",
  },
  {
    title: "Crochet by hand",
    text: "Stitch by stitch, with a hook and a lot of patience. No machines.",
  },
  {
    title: "Check and wrap",
    text: "Every piece is looked over for loose ends, then packed with care.",
  },
  {
    title: "On its way to you",
    text: "A Lalamove rider brings it to your door, or you pick it up for free.",
  },
];

const VALUES = [
  {
    icon: HandIcon,
    title: "Made by hand",
    text: "Each finished piece is crocheted by a person, so no two are exactly alike.",
  },
  {
    icon: GiftIcon,
    title: "Ready to give",
    text: "Bags, flowers and keychains made to be gifts, for others or for yourself.",
  },
  {
    icon: HeartIcon,
    title: "For makers too",
    text: "We sell the yarn and tools we use, so you can start a project of your own.",
  },
];

export default function AboutPage() {
  return (
    <PageLayout width="wide">
      {/* ---- Opening ---- */}
      <section className="grid items-center gap-10 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <p className="font-semibold text-berry">About La Crochet</p>
          <h1 className="mt-3 font-serif text-4xl leading-tight font-semibold text-balance sm:text-5xl">
            Every piece starts as a ball of yarn and an unhurried afternoon.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-ink/80">
            La Crochet is a small Philippine shop for handmade crochet: tote bags, flowers, keychains
            and gifts, plus the yarn and hooks to make your own.
          </p>
        </div>
        <div className="relative mx-auto w-full max-w-md lg:max-w-none">
          <img
            src={yarnPhoto}
            alt="Balls of yarn in soft colours"
            width="1200"
            height="900"
            className="aspect-[4/3] w-full rounded-[2rem] object-cover"
          />
          <p className="absolute -bottom-5 left-6 rounded-2xl bg-card px-5 py-3 text-sm font-semibold shadow-lg shadow-shade/10">
            Crocheted by hand, one stitch at a time
          </p>
        </div>
      </section>

      {/* ---- Story ---- */}
      <section className="mx-auto mt-24 max-w-2xl">
        <h2 className="font-serif text-3xl font-semibold">Our story</h2>
        {/* TODO: replace these two paragraphs with the real story (names, the year it started, the town). */}
        <div className="mt-5 space-y-5 text-lg leading-8 text-ink/85">
          <p>
            La Crochet began the way a lot of crochet does: with one project made as a gift, then
            another, until the yarn basket needed a room of its own. Friends started asking for
            pieces, and the shop grew from there.
          </p>
          <p>
            We still make every finished piece by hand, in small batches. If it's in the shop, it's
            something we'd be happy to give to someone we love.
          </p>
        </div>
      </section>

      {/* ---- How a piece is made ---- */}
      <section className="mt-24" aria-labelledby="how-made">
        <h2 id="how-made" className="font-serif text-3xl font-semibold">
          From yarn to your hands
        </h2>
        <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, index) => (
            <li key={step.title} className="card relative p-6">
              <span className="font-serif text-4xl font-semibold text-terracotta" aria-hidden="true">
                {index + 1}
              </span>
              <h3 className="mt-3 font-sans text-lg font-bold">{step.title}</h3>
              <p className="mt-1 text-muted">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ---- What we care about ---- */}
      <section className="mt-24 grid gap-8 md:grid-cols-3" aria-label="What we care about">
        {VALUES.map(({ icon: Icon, title, text }) => (
          <div key={title}>
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-blush text-berry">
              <Icon className="h-5 w-5" />
            </span>
            <h3 className="mt-4 font-sans text-lg font-bold">{title}</h3>
            <p className="mt-1 leading-7 text-muted">{text}</p>
          </div>
        ))}
      </section>

      {/* ---- The people who built the website ---- */}
      <section className="mt-24 grid items-center gap-10 lg:grid-cols-[1.2fr_1fr]" aria-labelledby="team">
        <figure>
          <img
            src={teamPhoto}
            alt="The three developers of the La Crochet website, smiling together"
            width="1003"
            height="691"
            loading="lazy"
            decoding="async"
            className="aspect-[1003/691] w-full rounded-[2rem] object-cover"
          />
          {/* TODO: put the developers' names here, from left to right. */}
          <figcaption className="mt-3 text-sm text-muted">The La Crochet website team.</figcaption>
        </figure>
        <div>
          <h2 id="team" className="font-serif text-3xl font-semibold">
            The SolarBoys
          </h2>
          <p className="mt-4 text-lg leading-8 text-ink/85">
            The shop you're browsing was designed and built by our team of student developers, from
            the product pages and cart to checkout, delivery tracking and the back office.
          </p>
          <p className="mt-4 leading-7 text-muted">
            Found something that doesn't work right? Tell us through the{" "}
            <Link to="/contact?topic=other" className="link">
              Contact page
            </Link>
            .
          </p>
        </div>
      </section>

      {/* ---- Next step ---- */}
      <section className="night mt-24 mb-4 rounded-[2rem] bg-ink px-6 py-12 text-center text-cream sm:px-12">
        <h2 className="font-serif text-3xl font-semibold text-cream">Want something made just for you?</h2>
        <p className="mx-auto mt-3 max-w-lg text-cream/80">
          Tell us the colour, size or occasion, and we'll let you know what we can make.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link to="/contact?topic=custom" className="btn-primary">
            Ask about a custom piece
          </Link>
          <Link
            to="/catalog"
            className="btn-quiet border border-cream/30 text-cream hover:bg-cream/10 hover:text-cream"
          >
            Browse the shop
          </Link>
        </div>
      </section>
    </PageLayout>
  );
}
