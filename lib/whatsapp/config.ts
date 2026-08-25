import "server-only";

export const WHATSAPP_GRAPH_API_VERSION = "v21.0";
export const WHATSAPP_GRAPH_BASE = `https://graph.facebook.com/${WHATSAPP_GRAPH_API_VERSION}`;

/** Annual managed website package sold via Facebook ads → WhatsApp. */
export const MANAGED_WEBSITE_PRICE_ZAR = Number(
  process.env.WHATSAPP_SALES_OFFER_PRICE?.trim() || "999",
);

export const MANAGED_WEBSITE_DEPOSIT_ZAR = Number(
  process.env.WHATSAPP_SALES_DEPOSIT_PRICE?.trim() || "100",
);

export const MANAGED_WEBSITE_OFFER = {
  priceZar: Number.isFinite(MANAGED_WEBSITE_PRICE_ZAR) ? MANAGED_WEBSITE_PRICE_ZAR : 999,
  depositZar: Number.isFinite(MANAGED_WEBSITE_DEPOSIT_ZAR)
    ? MANAGED_WEBSITE_DEPOSIT_ZAR
    : 100,
  label: "fully managed website",
  billing: "per year" as const,
};

export function getWhatsAppVerifyToken(): string {
  return process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim() || "";
}

export function getWhatsAppAccessToken(): string {
  return process.env.WHATSAPP_ACCESS_TOKEN?.trim() || "";
}

export function getWhatsAppPhoneNumberId(): string {
  return process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() || "";
}

export function getWhatsAppAppSecret(): string {
  return process.env.WHATSAPP_APP_SECRET?.trim() || "";
}

/** Secure R100 deposit checkout URL used in sales replies. */
export function getDepositPaymentLink(): string {
  return (
    process.env.WHATSAPP_DEPOSIT_PAYMENT_LINK?.trim() ||
    "https://lulaweb.co.za/payfast/deposit"
  );
}

export function isWhatsAppConfigured(): boolean {
  return Boolean(
    getWhatsAppAccessToken() &&
      getWhatsAppPhoneNumberId() &&
      getWhatsAppVerifyToken() &&
      getWhatsAppAppSecret(),
  );
}

export function appPublicUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "") ||
    "https://lulaweb.co.za"
  );
}
