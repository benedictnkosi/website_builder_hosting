import { MONTHLY_SUBSCRIPTION_ZAR } from "@/lib/pricing";

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

export const SITE_TITLE =
  "Lulaweb | AI Website Builder South Africa — .co.za Sites from R19/month";

export const SITE_DESCRIPTION = `Create a professional website for your South African business in one chat. Lulaweb writes the copy, designs the pages, and hosts your .co.za domain from R${MONTHLY_SUBSCRIPTION_ZAR} a month.`;

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
  "R19 website",
  "Lulaweb",
];

export const HOME_FAQ = [
  {
    question: "How does Lulaweb work?",
    answer:
      "Describe your business in a chat — services, phone number, and location. Lulaweb writes the copy, designs the pages, and shows you a live preview. Use your tokens to make changes, then subscribe when you are ready to publish on a .co.za domain.",
  },
  {
    question: "How much does a Lulaweb website cost?",
    answer: `A live Lulaweb website with a .co.za domain is R${MONTHLY_SUBSCRIPTION_ZAR} per month. You can chat, generate, preview, and edit with tokens. Publishing on a .co.za domain requires an active subscription, billed through PayFast.`,
  },
  {
    question: "Do I get a .co.za domain?",
    answer:
      "Yes. When you subscribe you search for an available .co.za name and bind it to your site. Lulaweb hosts the website and points the domain at it after you publish.",
  },
  {
    question: "Do I need to pay to start?",
    answer:
      "No. Preview and edits use tokens. You only pay when you subscribe to publish. Billing is through PayFast — no payment is needed to sign in and generate a preview.",
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
          "@type": "Offer",
          price: MONTHLY_SUBSCRIPTION_ZAR,
          priceCurrency: "ZAR",
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
