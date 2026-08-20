import {
  ANNUAL_PLAN_MONTHLY_ZAR,
  ANNUAL_PLAN_ZAR,
  EDIT_TOPUP_PACKAGES,
  EDIT_TOPUP_ZAR,
  formatEdits,
  MONTHLY_PLAN_ZAR,
} from "@/lib/pricing";

export const SITE_NAME = "Lulaweb";
export const SITE_DEFAULT_URL = "https://lulaweb.co.za";
export const SITE_LOCALE = "en_ZA";
export const SITE_LANGUAGE = "en-ZA";

export function getSiteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (configured) {
    return configured;
  }
  return SITE_DEFAULT_URL;
}

export const SITE_TAGLINE = "AI website builder for South African businesses";

export const SITE_TITLE = `Lulaweb | AI Website Builder South Africa — .co.za Sites from R${ANNUAL_PLAN_MONTHLY_ZAR}/month`;

export const SITE_DESCRIPTION = `Create a professional website for your South African business in one chat. Design, a .co.za domain, and hosting are included from R${ANNUAL_PLAN_MONTHLY_ZAR} a month billed annually, or R${MONTHLY_PLAN_ZAR} billed monthly.`;

export const SITE_KEYWORDS = [
  "AI website builder South Africa",
  "website builder South Africa",
  "cheap website South Africa",
  "create a website South Africa",
  ".co.za website",
  "co.za domain website",
  "small business website South Africa",
  "AI website generator",
  "website for plumbers South Africa",
  "affordable web hosting South Africa",
  `R${ANNUAL_PLAN_MONTHLY_ZAR} website`,
  "Lulaweb",
];

export const HOME_FAQ = [
  {
    question: "How does Lulaweb work?",
    answer:
      "Describe your business in a chat — services, phone number, and location. Lulaweb writes the copy, designs the pages, and shows you a live preview. Use Edits to make changes, then subscribe when you are ready to publish on a .co.za domain.",
  },
  {
    question: "How much does a Lulaweb website cost?",
    answer: `A live Lulaweb website is R${ANNUAL_PLAN_MONTHLY_ZAR} per month billed annually (R${ANNUAL_PLAN_ZAR} a year), or R${MONTHLY_PLAN_ZAR} per month. That includes website design, a .co.za domain, and hosting. Extra Edits start at R${EDIT_TOPUP_ZAR}: ${EDIT_TOPUP_PACKAGES.map((pack) => `${pack.name} R${pack.amountZar} (${formatEdits(pack.edits)})`).join(", ")}. A website change uses 1 Edit, and a full rebuild uses 2 Edits. Publishing on a .co.za domain requires an active subscription, billed through PayFast.`,
  },
  {
    question: "Do I get a .co.za domain?",
    answer:
      "Yes. Design, a .co.za domain, and hosting are included in the subscription. When you subscribe you search for an available .co.za name and bind it to your site. Lulaweb hosts the website and points the domain at it after you publish.",
  },
  {
    question: "Do I need to pay to start?",
    answer:
      "No. Preview and website changes use Edits. New accounts start with 4 Edits. You only pay a subscription when you publish. Billing is through PayFast — no payment is needed to sign in and generate a preview.",
  },
  {
    question: "Who is Lulaweb for?",
    answer:
      "Local South African businesses that need a clear, mobile-friendly site with a phone number, WhatsApp button, and contact form — plumbers, electricians, salons, clinics, restaurants, consultants, and similar trades.",
  },
  {
    question: "Can I edit the website after it is generated?",
    answer:
      "Yes. After you subscribe you can ask Lulaweb to change copy, contact details, layout, and other page content from the same chat. Publishing puts the latest version on your .co.za domain.",
  },
] as const;

export function buildGraphJsonLd(siteUrl: string) {
  const origin = siteUrl.replace(/\/$/, "");

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${origin}/#website`,
        url: origin,
        name: SITE_NAME,
        description: SITE_DESCRIPTION,
        inLanguage: SITE_LANGUAGE,
        publisher: { "@id": `${origin}/#organization` },
      },
      {
        "@type": "Organization",
        "@id": `${origin}/#organization`,
        name: SITE_NAME,
        url: origin,
        logo: `${origin}/logo.png`,
        description: SITE_DESCRIPTION,
        areaServed: {
          "@type": "Country",
          name: "South Africa",
        },
        knowsAbout: [
          "AI website builder",
          "South African small business websites",
          ".co.za domain hosting",
        ],
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${origin}/#app`,
        name: SITE_NAME,
        url: origin,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        description: SITE_DESCRIPTION,
        offers: {
          "@type": "AggregateOffer",
          lowPrice: ANNUAL_PLAN_MONTHLY_ZAR,
          highPrice: MONTHLY_PLAN_ZAR,
          priceCurrency: "ZAR",
          offerCount: 2,
          availability: "https://schema.org/InStock",
          url: origin,
        },
        featureList: [
          "Chat-based AI website generation",
          "Live website preview",
          ".co.za domain registration",
          "WhatsApp and click-to-call buttons",
          "South African business hosting",
        ],
        publisher: { "@id": `${origin}/#organization` },
      },
      {
        "@type": "FAQPage",
        "@id": `${origin}/#faq`,
        url: `${origin}/#faq`,
        mainEntity: HOME_FAQ.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: item.answer,
          },
        })),
      },
    ],
  };
}
