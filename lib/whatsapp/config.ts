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

/** Secure R100 deposit checkout URL. Pass waId to track who pays via PayFast. */
export function getDepositPaymentLink(waId?: string): string {
  const base =
    process.env.WHATSAPP_DEPOSIT_PAYMENT_LINK?.trim() ||
    "https://lulaweb.co.za/payfast/deposit";
  const phone = waId?.replace(/\D/g, "") || "";
  if (!phone) return base;
  try {
    const url = new URL(base);
    url.searchParams.set("wa", phone);
    return url.toString();
  } catch {
    const sep = base.includes("?") ? "&" : "?";
    return `${base}${sep}wa=${encodeURIComponent(phone)}`;
  }
}

/** Team member WhatsApp for post-deposit human handover (digits only). */
export function getHumanHandoverWhatsApp(): string {
  const raw =
    process.env.WHATSAPP_HUMAN_HANDOVER_NUMBER?.trim() || "27837917430";
  return raw.replace(/\D/g, "");
}

/** Click-to-chat link for customers who want a real person. */
export function getHumanHandoverChatLink(): string {
  const phone = getHumanHandoverWhatsApp();
  return `https://wa.me/${phone}`;
}

/** Exact FNB banking details for EFT deposits — never invent alternatives. */
export const EFT_BANKING_DETAILS = {
  bank: "FNB",
  accountName: "Sixty Five Group",
  accountNumber: "62788863241",
  accountType: "Gold Business Account",
} as const;

export function formatEftBankingDetails(depositZar: number): string {
  const d = EFT_BANKING_DETAILS;
  return [
    `Bank: ${d.bank}`,
    `Account Name: ${d.accountName}`,
    `Account Number: ${d.accountNumber}`,
    `Account Type: ${d.accountType}`,
    "",
    `Please pay the R${depositZar} deposit and let me know once payment has been made.`,
  ].join("\n");
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
