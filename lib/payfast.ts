import "server-only";

import { createHash } from "node:crypto";
import { payfastAmount } from "@/lib/pricing";

const CHECKOUT_FIELD_ORDER = [
  "merchant_id",
  "merchant_key",
  "return_url",
  "cancel_url",
  "notify_url",
  "name_first",
  "name_last",
  "email_address",
  "cell_number",
  "m_payment_id",
  "amount",
  "item_name",
  "item_description",
  "custom_int1",
  "custom_int2",
  "custom_int3",
  "custom_int4",
  "custom_int5",
  "custom_str1",
  "custom_str2",
  "custom_str3",
  "custom_str4",
  "custom_str5",
  "email_confirmation",
  "confirmation_address",
  "payment_method",
  "subscription_type",
  "billing_date",
  "recurring_amount",
  "frequency",
  "cycles",
  "subscription_notify_email",
  "subscription_notify_webhook",
  "subscription_notify_buyer",
] as const;

export type PayfastCheckoutFields = {
  merchant_id: string;
  merchant_key: string;
  return_url: string;
  cancel_url: string;
  notify_url: string;
  m_payment_id: string;
  amount: string;
  item_name: string;
  item_description: string;
  subscription_type: string;
  recurring_amount: string;
  frequency: string;
  cycles: string;
  name_first?: string;
  name_last?: string;
  email_address?: string;
  custom_str1?: string;
  custom_str2?: string;
  custom_str3?: string;
  signature: string;
};

function envValue(...keys: string[]): string {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return "";
}

export function getPayfastMerchantId(): string {
  return envValue("PAYFAST_MERCHANT_ID", "NEXT_PUBLIC_PAYFAST_MERCHANT_ID");
}

export function getPayfastMerchantKey(): string {
  return envValue("PAYFAST_MERCHANT_KEY", "NEXT_PUBLIC_PAYFAST_MERCHANT_KEY");
}

export function getPayfastPassphrase(): string {
  return envValue(
    "PAYFAST_PASSPHRASE",
    "PAYFAST_PASSPHASE",
    "NEXT_PUBLIC_PAYFAST_PASSPHRASE",
    "NEXT_PUBLIC_PAYFAST_PASSPHASE",
  );
}

export function isPayfastConfigured(): boolean {
  return Boolean(
    getPayfastMerchantId() && getPayfastMerchantKey() && getPayfastPassphrase(),
  );
}

export function isPayfastSandbox(): boolean {
  const value = process.env.PAYFAST_SANDBOX?.trim().toLowerCase();
  if (value === "false" || value === "0") {
    return false;
  }
  return true;
}

export function getPayfastProcessUrl(): string {
  return isPayfastSandbox()
    ? "https://sandbox.payfast.co.za/eng/process"
    : "https://www.payfast.co.za/eng/process";
}

function phpUrlEncode(value: string): string {
  return encodeURIComponent(value)
    .replace(/%20/g, "+")
    .replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/%[0-9A-F]{2}/gi, (hex) => hex.toUpperCase());
}

export function generatePayfastSignature(
  data: Record<string, string>,
  passphrase?: string,
): string {
  const pairs: string[] = [];

  for (const [key, value] of Object.entries(data)) {
    if (key === "signature" || value === "") continue;
    pairs.push(`${key}=${phpUrlEncode(value.trim())}`);
  }

  let paramString = pairs.join("&");
  const salt = passphrase?.trim();
  if (salt) {
    paramString += `&passphrase=${phpUrlEncode(salt)}`;
  }

  return createHash("md5").update(paramString).digest("hex");
}

function orderedCheckoutPayload(
  fields: Omit<PayfastCheckoutFields, "signature">,
): Record<string, string> {
  const payload: Record<string, string> = {};

  for (const key of CHECKOUT_FIELD_ORDER) {
    const value = fields[key as keyof typeof fields];
    if (typeof value === "string" && value !== "") {
      payload[key] = value;
    }
  }

  return payload;
}

export function buildPayfastSubscriptionCheckout(input: {
  origin: string;
  websiteId: string;
  paymentId: string;
  domain: string;
  amountZar: number;
  email?: string;
  name?: string;
}): { processUrl: string; fields: PayfastCheckoutFields } {
  const merchantId = getPayfastMerchantId();
  const merchantKey = getPayfastMerchantKey();
  const passphrase = getPayfastPassphrase();

  if (!merchantId || !merchantKey || !passphrase) {
    throw new Error("PayFast is not configured.");
  }

  const amount = payfastAmount(input.amountZar);
  const [firstName, ...lastParts] = (input.name ?? "").trim().split(/\s+/);
  const lastName = lastParts.join(" ");

  const unordered: Omit<PayfastCheckoutFields, "signature"> = {
    merchant_id: merchantId,
    merchant_key: merchantKey,
    return_url: `${input.origin}/builder?websiteId=${encodeURIComponent(input.websiteId)}&checkout=return`,
    cancel_url: `${input.origin}/builder?websiteId=${encodeURIComponent(input.websiteId)}&checkout=cancel`,
    notify_url: `${input.origin}/api/payfast/notify`,
    m_payment_id: input.paymentId,
    amount,
    item_name: `Website + ${input.domain}`,
    item_description: `Annual website and domain subscription for ${input.domain}`,
    subscription_type: "1",
    recurring_amount: amount,
    frequency: "6",
    cycles: "0",
    custom_str1: input.websiteId,
    custom_str2: input.domain,
    custom_str3: input.paymentId,
    ...(firstName ? { name_first: firstName.slice(0, 100) } : {}),
    ...(lastName ? { name_last: lastName.slice(0, 100) } : {}),
    ...(input.email ? { email_address: input.email.slice(0, 100) } : {}),
  };

  const payload = orderedCheckoutPayload(unordered);
  const signature = generatePayfastSignature(payload, passphrase);

  return {
    processUrl: getPayfastProcessUrl(),
    fields: {
      ...(payload as Omit<PayfastCheckoutFields, "signature">),
      signature,
    },
  };
}

export function parsePayfastNotify(formData: FormData): Record<string, string> {
  const data: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") {
      data[key] = value;
    }
  }
  return data;
}

export function verifyPayfastSignature(data: Record<string, string>): boolean {
  const passphrase = getPayfastPassphrase();
  const received = data.signature?.toLowerCase();
  if (!received) return false;

  const payload: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    if (key === "signature") continue;
    payload[key] = value;
  }

  const expected = generatePayfastSignature(payload, passphrase);
  return expected === received;
}

export function amountsMatch(expectedZar: number, received: string | undefined): boolean {
  const parsed = Number(received);
  if (!Number.isFinite(parsed)) return false;
  return payfastAmount(parsed) === payfastAmount(expectedZar);
}
