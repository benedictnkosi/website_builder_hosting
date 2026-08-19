import type { Metadata } from "next";
import Link from "next/link";
import BrandMark from "@/components/BrandMark";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "How Lulaweb collects and uses account, website, and payment data for South African businesses.",
  alternates: {
    canonical: "/privacy",
  },
};

const SECTIONS = [
  {
    title: "Account",
    body: "You sign in with Google. We store your Google user id, name, and email so we can keep your sites tied to your account and restore a session.",
  },
  {
    title: "Websites you generate",
    body: "Business details you type in chat, generated copy, images, and site files are stored so you can preview, edit, and publish. Preview links use a site id. Do not share a preview URL if the content should stay private.",
  },
  {
    title: "Payments",
    body: "Subscriptions and token top-ups are billed through PayFast. We store the domain you choose, subscription status, and PayFast payment references. Card details are handled by PayFast, not Lulaweb.",
  },
  {
    title: "Analytics",
    body: "Firebase Analytics records page views and product events such as sign-in, checkout, and generate. This helps us see what breaks and what people use.",
  },
  {
    title: "Live contact forms",
    body: "If your published site includes a contact form, submissions are emailed to the address stored on that site. Do not put a form live unless that inbox should receive customer messages.",
  },
  {
    title: "Customer support",
    body: "Messages you send through the Lulaweb support form are emailed to our support inbox so we can reply. We keep the name, email, and message you submit for that purpose.",
  },
  {
    title: "What we do not do",
    body: "We do not sell your data. We use it to run Lulaweb: sign-in, generation, hosting, billing, and support.",
  },
] as const;

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
      <Link href="/" aria-label="Lulaweb home">
        <BrandMark />
      </Link>
      <h1 className="mt-10 text-3xl font-semibold tracking-tight text-stone-900">
        Privacy
      </h1>
      <p className="mt-4 text-base leading-relaxed text-stone-600">
        Lulaweb is an AI website builder for South African businesses. This page
        describes the data the product actually uses today.
      </p>
      <div className="mt-10 space-y-8">
        {SECTIONS.map((section) => (
          <section key={section.title}>
            <h2 className="text-lg font-semibold text-stone-900">
              {section.title}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-stone-600">
              {section.body}
            </p>
          </section>
        ))}
      </div>
      <p className="mt-12 text-sm text-stone-500">
        <Link href="/" className="font-medium text-teal-800 hover:text-teal-700">
          Back to Lulaweb
        </Link>
      </p>
    </main>
  );
}
