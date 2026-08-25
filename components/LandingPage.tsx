import Link from "next/link";
import BrandMark from "@/components/BrandMark";
import {
  LandingCtaSignIn,
  LandingHeroSignIn,
  LandingSignedInRedirect,
} from "@/components/LandingAuth";
import LandingHeader from "@/components/LandingHeader";
import SupportForm from "@/components/SupportForm";
import { HOME_FAQ } from "@/lib/seo";
import {
  formatZar,
  SUBSCRIPTION_PLAN_ZAR,
} from "@/lib/pricing";

const INCLUDED_IN_PRICE = [
  {
    title: "Website design",
    body: "Free to start — copy, layout, and images from one chat.",
  },
  {
    title: ".co.za domain",
    body: "A South African name bound at checkout.",
  },
  {
    title: "Hosting",
    body: "Website hosting included. Your site stays live on Lulaweb.",
  },
] as const;

function IncludedCheckIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="h-4 w-4 shrink-0 text-teal-800"
      fill="none"
    >
      <path
        d="M4.5 10.5 8 14l7.5-8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ProductPreview() {
  return (
    <div className="overflow-hidden rounded-[1.6rem] border border-stone-200/80 bg-white shadow-[0_24px_80px_rgba(28,25,23,0.12)]">
      <div className="flex items-center gap-2 border-b border-stone-200 bg-stone-50 px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-stone-300" />
        <span className="h-2.5 w-2.5 rounded-full bg-stone-300" />
        <span className="h-2.5 w-2.5 rounded-full bg-stone-300" />
        <div className="ml-3 flex-1 rounded-full bg-white px-3 py-1 text-center text-[11px] text-stone-400 ring-1 ring-stone-200">
          Preview · Thando Plumbing
        </div>
      </div>
      <div className="grid min-h-[22rem] lg:grid-cols-[18rem_1fr]">
        <div className="flex flex-col gap-3 border-b border-stone-100 bg-stone-50/80 p-4 lg:border-b-0 lg:border-r">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-teal-800">
            Chat
          </p>
          <div className="max-w-[92%] rounded-2xl rounded-tl-md bg-white px-3 py-2.5 text-xs leading-relaxed text-stone-700 shadow-sm ring-1 ring-stone-200/80">
            Tell me about your business — name, services, and phone number.
          </div>
          <div className="ml-auto max-w-[88%] rounded-2xl rounded-tr-md bg-teal-800 px-3 py-2.5 text-xs leading-relaxed text-white">
            Thando Plumbing in Durban. Geyser repairs, blocked drains, 082 123
            4567.
          </div>
          <div className="max-w-[92%] rounded-2xl rounded-tl-md bg-white px-3 py-2.5 text-xs leading-relaxed text-stone-700 shadow-sm ring-1 ring-stone-200/80">
            Got it. Building your website and images...
          </div>
          <div className="max-w-[92%] rounded-2xl rounded-tl-md bg-white px-3 py-2.5 text-xs leading-relaxed text-stone-700 shadow-sm ring-1 ring-stone-200/80">
            Your preview is ready.
          </div>
        </div>
        <div className="relative overflow-hidden bg-[#f7f3ea] p-5">
          <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-teal-700/10" />
          <div className="relative overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-stone-200/70">
            <div className="relative h-28 overflow-hidden bg-teal-900">
              <svg
                aria-hidden="true"
                viewBox="0 0 640 180"
                className="h-full w-full"
                preserveAspectRatio="xMidYMid slice"
              >
                <rect width="640" height="180" fill="#134e4a" />
                <path d="M0 120h640v60H0z" fill="#0f766e" />
                <rect x="70" y="48" width="150" height="92" rx="4" fill="#f7f3ea" />
                <rect x="88" y="64" width="36" height="28" fill="#99f6e4" />
                <rect x="136" y="64" width="36" height="28" fill="#99f6e4" />
                <rect x="122" y="108" width="28" height="32" fill="#115e59" />
                <circle cx="430" cy="92" r="46" fill="#f59e0b" opacity="0.35" />
                <rect x="320" y="70" width="18" height="70" rx="3" fill="#ccfbf1" />
                <rect x="348" y="86" width="90" height="14" rx="7" fill="#99f6e4" />
                <rect x="348" y="108" width="64" height="14" rx="7" fill="#5eead4" />
              </svg>
              <p className="absolute bottom-2 left-3 text-[10px] font-medium text-white/90">
                Geyser repair, Durban
              </p>
            </div>
            <div className="p-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-teal-800">
                Durban
              </p>
              <h3 className="mt-2 text-2xl font-semibold tracking-tight text-stone-900">
                Thando Plumbing
              </h3>
              <p className="mt-2 max-w-sm text-sm leading-relaxed text-stone-600">
                Fast geyser repairs, blocked drains, and leak detection. Call or
                WhatsApp today.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="rounded-full bg-teal-800 px-3 py-1.5 text-[11px] font-semibold text-white">
                  Call now
                </span>
                <span className="rounded-full border border-stone-300 px-3 py-1.5 text-[11px] font-semibold text-stone-700">
                  WhatsApp
                </span>
              </div>
            </div>
          </div>
          <div className="relative mt-3 grid grid-cols-3 gap-2">
            {["Geyser repairs", "Blocked drains", "Leak detection"].map(
              (item) => (
                <div
                  key={item}
                  className="rounded-xl bg-white px-3 py-3 text-[11px] font-medium text-stone-700 shadow-sm ring-1 ring-stone-200/70"
                >
                  {item}
                </div>
              ),
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LandingPage() {
  return (
    <>
      <LandingSignedInRedirect />
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-teal-800"
      >
        Skip to content
      </a>
      <LandingHeader />

      <main id="main" className="relative isolate min-h-full overflow-x-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-[-8rem] h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-teal-700/15 blur-3xl" />
          <div className="absolute right-[-6rem] top-40 h-72 w-72 rounded-full bg-amber-300/30 blur-3xl" />
          <div className="absolute bottom-[-4rem] left-[-5rem] h-80 w-80 rounded-full bg-teal-900/10 blur-3xl" />
        </div>

        <div className="mx-auto flex w-full max-w-6xl flex-col px-4 pb-16 pt-6 sm:px-6 lg:px-8">
          <section className="mx-auto max-w-3xl text-center">
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.14em] text-teal-800">
              Small business website South Africa
            </p>
            <h1 className="text-4xl font-semibold tracking-tight text-stone-900 sm:text-6xl sm:leading-[1.05]">
              Describe your small business.
              <span className="mt-1 block text-teal-800">Get a website.</span>
            </h1>
            <p className="mt-8">
              <span className="inline-flex items-baseline gap-2 rounded-[1.75rem] bg-teal-800 px-8 py-5 shadow-[0_20px_60px_rgba(19,78,74,0.28)] ring-2 ring-white/15">
                <span className="text-6xl font-bold tracking-tight text-white sm:text-8xl">
                  R{SUBSCRIPTION_PLAN_ZAR}
                </span>
                <span className="text-lg font-semibold text-teal-100 sm:text-2xl">
                  /month
                </span>
              </span>
            </p>
            <ul
              className="mx-auto mt-6 grid max-w-2xl gap-2 sm:grid-cols-3"
              aria-label="Included in the monthly price"
            >
              {INCLUDED_IN_PRICE.map((item) => (
                <li
                  key={item.title}
                  className="flex items-center justify-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-stone-900 shadow-sm ring-1 ring-teal-800/20"
                >
                  <IncludedCheckIcon />
                  {item.title}
                </li>
              ))}
            </ul>
            <p className="mx-auto mt-5 max-w-xl text-sm leading-relaxed text-stone-600 sm:text-base">
              Free website design to start. Website hosting and a .co.za domain
              included when you publish.
            </p>
            <p className="mx-auto mt-3 max-w-xl text-xl font-bold leading-snug text-stone-900">
              A Social Project for small businesses.
            </p>
            <LandingHeroSignIn />
          </section>

          <section className="mx-auto mt-14 w-full max-w-5xl" aria-label="Product preview">
            <ProductPreview />
          </section>

          <section
            id="how-it-works"
            className="mx-auto mt-16 w-full max-w-5xl scroll-mt-24"
          >
            <h2 className="text-center text-2xl font-semibold tracking-tight text-stone-900">
              How to create a small business website
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-center text-sm leading-relaxed text-stone-600">
              No templates, agencies, or long forms. Tell us what your small
              business does in plain language, get free website design, and
              publish a mobile-friendly South African site from{" "}
              {formatZar(SUBSCRIPTION_PLAN_ZAR)} a month.
            </p>
            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              {[
                {
                  step: "01",
                  title: "Chat to build",
                  body: "Tell us what you do in plain language. No templates or long forms.",
                },
                {
                  step: "02",
                  title: "Preview instantly",
                  body: "Preview is free. Use Edits to tweak the site, then subscribe to publish.",
                },
                {
                  step: "03",
                  title: "Publish on a .co.za",
                  body: `Design, domain, and hosting are included — ${formatZar(SUBSCRIPTION_PLAN_ZAR)} a month when the site looks right.`,
                  featured: true,
                },
              ].map((item) => (
                <article
                  key={item.step}
                  className={
                    item.featured
                      ? "rounded-2xl border border-teal-800/25 bg-teal-50/70 p-5 shadow-sm"
                      : "rounded-2xl border border-stone-200/80 bg-white/80 p-5 shadow-sm backdrop-blur-sm"
                  }
                >
                  <p className="text-xs font-semibold tracking-[0.18em] text-teal-800">
                    {item.step}
                  </p>
                  <h3 className="mt-3 text-base font-semibold text-stone-900">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-stone-600">
                    {item.body}
                  </p>
                </article>
              ))}
            </div>
          </section>

          <section
            id="who-its-for"
            className="mx-auto mt-16 w-full max-w-5xl scroll-mt-24"
          >
            <h2 className="text-center text-2xl font-semibold tracking-tight text-stone-900">
              The cheapest small business website in South Africa
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-center text-sm leading-relaxed text-stone-600">
              A {SUBSCRIPTION_PLAN_ZAR} rand website for SMMEs and local services that need to be
              found on Google, called from a phone, or messaged on WhatsApp —
              not for giant ecommerce catalogues.
            </p>
            <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[
                "Plumbers, electricians, and handymen",
                "Hair salons, barbers, and beauty studios",
                "Clinics, dentists, and therapists",
                "Restaurants, bakeries, and caterers",
                "Consultants, coaches, and accountants",
                "Spaza shops, home businesses, and NPOs",
              ].map((item) => (
                <li
                  key={item}
                  className="rounded-2xl border border-stone-200/80 bg-white/80 px-4 py-4 text-sm font-medium text-stone-800 shadow-sm"
                >
                  {item}
                </li>
              ))}
            </ul>
          </section>

          <section
            id="features"
            className="mx-auto mt-16 w-full max-w-5xl scroll-mt-24"
          >
            <h2 className="text-center text-2xl font-semibold tracking-tight text-stone-900">
              Free website design and hosting from {formatZar(SUBSCRIPTION_PLAN_ZAR)} a month
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-center text-sm leading-relaxed text-stone-600">
              Website design is free to start. Hosting and a .co.za domain are
              in the subscription — no separate designer, registrar, or hosting
              bill.
            </p>
            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              {INCLUDED_IN_PRICE.map((item) => (
                <article
                  key={item.title}
                  className="rounded-2xl border border-teal-800/25 bg-teal-50/70 p-5 shadow-sm"
                >
                  <p className="flex items-center gap-2 text-base font-semibold text-stone-900">
                    <IncludedCheckIcon />
                    {item.title}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-stone-600">
                    {item.body}
                  </p>
                </article>
              ))}
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {[
                {
                  title: "Click-to-call and WhatsApp",
                  body: "Customers can phone or WhatsApp you from their phone. Contact details stay visible on every page.",
                },
                {
                  title: "South Africa first",
                  body: "Address lookup, PayFast billing, and .co.za domains are built for local businesses — not a generic overseas website builder.",
                },
              ].map((item) => (
                <article
                  key={item.title}
                  className="rounded-2xl border border-stone-200/80 bg-white/80 p-5 shadow-sm"
                >
                  <h3 className="text-base font-semibold text-stone-900">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-stone-600">
                    {item.body}
                  </p>
                </article>
              ))}
            </div>
          </section>

          <section
            id="pricing"
            className="mx-auto mt-16 w-full max-w-5xl scroll-mt-24 text-center"
          >
            <h2 className="text-2xl font-semibold tracking-tight text-stone-900">
              Small business website pricing — {formatZar(SUBSCRIPTION_PLAN_ZAR)} a month
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-stone-600">
              Built for SMMEs. Free website design and preview to start.
              Website hosting and a .co.za domain are included when you go live.
            </p>
            <article className="mx-auto mt-8 max-w-lg rounded-[1.6rem] border border-teal-800/30 bg-teal-50/60 p-8 text-left shadow-[0_24px_80px_rgba(28,25,23,0.08)]">
              <div className="text-center">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-800">
                  Everything included
                </p>
                <p className="mt-3 text-5xl font-bold tracking-tight text-stone-900">
                  {formatZar(SUBSCRIPTION_PLAN_ZAR)}
                  <span className="ml-2 text-lg font-medium text-stone-500">/ month</span>
                </p>
                <p className="mt-1 text-sm text-stone-600">Billed monthly through PayFast</p>
              </div>
              <ul className="mt-5 space-y-2 text-sm leading-relaxed text-stone-600">
                {INCLUDED_IN_PRICE.map((item) => (
                  <li key={item.title} className="flex items-start gap-2">
                    <IncludedCheckIcon />
                    <span>
                      <span className="font-semibold text-stone-800">{item.title}</span>
                      {" — "}
                      {item.body}
                    </span>
                  </li>
                ))}
                <li>Chat-based edits while you have Edits remaining</li>
                <li>Free preview before you pay</li>
              </ul>
              <div className="mt-6 flex justify-center">
                <LandingCtaSignIn />
              </div>
            </article>
          </section>

          <section id="faq" className="mx-auto mt-16 w-full max-w-3xl scroll-mt-24">
            <h2 className="text-center text-2xl font-semibold tracking-tight text-stone-900">
              Frequently asked questions
            </h2>
            <div className="mt-8 space-y-3">
              {HOME_FAQ.map((item) => (
                <details
                  key={item.question}
                  className="group rounded-2xl border border-stone-200/80 bg-white/80 px-5 py-4 shadow-sm open:bg-white"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-semibold text-stone-900 [&::-webkit-details-marker]:hidden">
                    {item.question}
                    <span aria-hidden="true" className="text-lg leading-none text-teal-800">
                      <span className="group-open:hidden">+</span>
                      <span className="hidden group-open:inline">−</span>
                    </span>
                  </summary>
                  <p className="mt-3 text-sm leading-relaxed text-stone-600">
                    {item.answer}
                  </p>
                </details>
              ))}
            </div>
          </section>

          <div className="mx-auto mt-16 w-full max-w-5xl">
            <SupportForm description="Questions about pricing, domains, or getting a site live — send a message and we will reply to your email." />
          </div>
        </div>
      </main>

      <footer className="border-t border-stone-200/80 bg-white/60">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6 lg:flex-row lg:items-start lg:justify-between lg:px-8">
          <div>
            <Link href="/" aria-label="Lulaweb home">
              <BrandMark />
            </Link>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-stone-600">
              The cheapest small business website in South Africa. Free website
              design to start, with hosting and a .co.za domain from{" "}
              {formatZar(SUBSCRIPTION_PLAN_ZAR)} a month.
            </p>
          </div>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-stone-600">
            <a href="#how-it-works" className="hover:text-stone-900">
              How it works
            </a>
            <a href="#pricing" className="hover:text-stone-900">
              Pricing
            </a>
            <a href="#faq" className="hover:text-stone-900">
              FAQ
            </a>
            <a href="#support" className="hover:text-stone-900">
              Support
            </a>
            <Link href="/privacy" className="hover:text-stone-900">
              Privacy
            </Link>
          </nav>
        </div>
        <p className="border-t border-stone-200/70 px-4 py-4 text-center text-xs text-stone-500">
          © 2026 Lulaweb. The cheapest small business website in South Africa —
          website design, .co.za domains, and hosting for SMMEs.
        </p>
      </footer>
    </>
  );
}
