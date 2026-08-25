import {
  EDIT_TOPUP_PACKAGES,
  EDIT_TOPUP_ZAR,
  formatEdits,
  SUBSCRIPTION_PLAN_ZAR,
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

export const SITE_TAGLINE = `The cheapest small business website in South Africa from R${SUBSCRIPTION_PLAN_ZAR} a month`;

export const SITE_TITLE = `Small Business Website South Africa from R${SUBSCRIPTION_PLAN_ZAR} | Lulaweb`;

export const SITE_DESCRIPTION = `A cheap small business website in South Africa from R${SUBSCRIPTION_PLAN_ZAR} a month. Built for SMMEs — free website design to start, plus hosting and a .co.za domain included.`;

export const SITE_KEYWORDS = [
  "small business website South Africa",
  "website for small business South Africa",
  "small business website builder South Africa",
  "SMME website South Africa",
  "SME website South Africa",
  "affordable website for small business",
  "small business web design South Africa",
  "local business website South Africa",
  "website for SMMEs",
  `${SUBSCRIPTION_PLAN_ZAR} rand website`,
  `${SUBSCRIPTION_PLAN_ZAR} rand website South Africa`,
  `R${SUBSCRIPTION_PLAN_ZAR} website`,
  `R${SUBSCRIPTION_PLAN_ZAR} website South Africa`,
  "cheapest website in South Africa",
  "cheapest website South Africa",
  "cheapest website builder South Africa",
  "cheap website South Africa",
  "free website hosting South Africa",
  "free website design South Africa",
  "free website South Africa",
  "free website builder South Africa",
  "AI website builder South Africa",
  "website builder South Africa",
  "create a website South Africa",
  ".co.za website",
  "co.za domain website",
  "affordable web hosting South Africa",
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
    answer: `R${SUBSCRIPTION_PLAN_ZAR} per month. That includes website design, a .co.za domain, and hosting. Extra Edits start at R${EDIT_TOPUP_ZAR}: ${EDIT_TOPUP_PACKAGES.map((pack) => `${pack.name} R${pack.amountZar} (${formatEdits(pack.edits)})`).join(", ")}. A website change uses 1 Edit, and a full rebuild uses 2 Edits. Publishing on a .co.za domain requires an active subscription, billed monthly through PayFast.`,
  },
  {
    question: "Is Lulaweb the cheapest website in South Africa?",
    answer: `Lulaweb is built for small South African businesses at R${SUBSCRIPTION_PLAN_ZAR} a month, with website design, a .co.za domain, and hosting in one price. There is no separate designer, registrar, or hosting bill.`,
  },
  {
    question: "Do I get free website design and hosting?",
    answer:
      "Website design and preview are free to start — new accounts get 4 Edits and no payment is needed to generate a site. When you publish, website hosting and a .co.za domain are included in the subscription, so you do not pay a separate hosting company or designer.",
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
    question: "Is Lulaweb for small businesses and SMMEs?",
    answer: `Yes. Lulaweb is a website builder for South African small businesses and SMMEs. A live site is R${SUBSCRIPTION_PLAN_ZAR} a month and includes design, a .co.za domain, and hosting — so a plumber, salon, clinic, restaurant, or consultant can get online without an agency.`,
  },
  {
    question: "Who is Lulaweb for?",
    answer:
      "South African small businesses that need a clear, mobile-friendly site with a phone number, WhatsApp button, and contact form — plumbers, electricians, salons, clinics, restaurants, consultants, spaza shops, and similar local trades. It is not built for giant ecommerce catalogues.",
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
        slogan: SITE_TAGLINE,
        areaServed: {
          "@type": "Country",
          name: "South Africa",
        },
        knowsAbout: [
          "small business website South Africa",
          "SMME website South Africa",
          "website for small businesses",
          "cheapest website in South Africa",
          `${SUBSCRIPTION_PLAN_ZAR} rand website`,
          "free website design South Africa",
          "free website hosting South Africa",
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
        audience: {
          "@type": "BusinessAudience",
          audienceType:
            "Small, medium and micro enterprises (SMMEs) in South Africa",
        },
        offers: {
          "@type": "Offer",
          price: SUBSCRIPTION_PLAN_ZAR,
          priceCurrency: "ZAR",
          availability: "https://schema.org/InStock",
          url: origin,
        },
        featureList: [
          "Chat-based AI website generation",
          "Free website design preview",
          "Website hosting included",
          "Live website preview",
          ".co.za domain registration",
          "WhatsApp and click-to-call buttons",
          "South African small business hosting",
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
