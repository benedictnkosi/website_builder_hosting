export const GA_MEASUREMENT_ID = sanitizeTagId(
  process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
);
export const GOOGLE_ADS_ID = sanitizeTagId(
  process.env.NEXT_PUBLIC_GOOGLE_ADS_ID,
);
export const GOOGLE_TAG_ID = GA_MEASUREMENT_ID || GOOGLE_ADS_ID;

export const GOOGLE_ADS_SUBSCRIPTION_EVENT = "ua_3__minute_visit_duration";

function sanitizeTagId(value: string | undefined): string {
  const id = value?.trim() ?? "";
  return /^(G|AW|GT|DC)-[A-Z0-9]+$/i.test(id) ? id : "";
}

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export function trackGoogleAdsSubscription(amountZar?: number) {
  sendGtagEvent(GOOGLE_ADS_SUBSCRIPTION_EVENT, {
    currency: "ZAR",
    value: amountZar,
  });
}

function sendGtagEvent(
  name: string,
  params?: Record<string, string | number | undefined>,
) {
  if (typeof window === "undefined") return;

  const payload = Object.fromEntries(
    Object.entries(params ?? {}).filter(([, value]) => value !== undefined),
  );

  if (typeof window.gtag === "function") {
    window.gtag("event", name, payload);
    return;
  }

  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(["event", name, payload]);
}
