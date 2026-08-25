import "server-only";

import { createHash } from "node:crypto";
import {
  payfastAmount,
  payfastFrequencyCode,
  type BillingFrequency,
} from "@/lib/pricing";

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
  subscription_type?: string;
  recurring_amount?: string;
  frequency?: string;
  cycles?: string;
  payment_method?: string;
  name_first?: string;
  name_last?: string;
  email_address?: string;
  cell_number?: string;
  custom_str1?: string;
  custom_str2?: string;
  custom_str3?: string;
  custom_str4?: string;
  custom_str5?: string;
  signature: string;
};

function cleanEnv(value: string | undefined): string {
  if (!value) return "";
  return value.trim().replace(/^['"]|['"]$/g, "").trim();
}

function envValue(...keys: string[]): string {
  for (const key of keys) {
    const value = cleanEnv(process.env[key]);
    if (value) return value;
  }
  return "";
}

function envFlag(value: string | undefined): boolean | null {
  const normalized = cleanEnv(value).toLowerCase();
  if (!normalized) return null;
  if (normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on") {
    return true;
  }
  if (normalized === "false" || normalized === "0" || normalized === "no" || normalized === "off") {
    return false;
  }
  return null;
}

type PayfastCredentials = {
  merchantId: string;
  merchantKey: string;
  passphrase: string;
};

function liveCredentials(): PayfastCredentials {
  return {
    merchantId: envValue("PAYFAST_MERCHANT_ID", "NEXT_PUBLIC_PAYFAST_MERCHANT_ID"),
    merchantKey: envValue("PAYFAST_MERCHANT_KEY", "NEXT_PUBLIC_PAYFAST_MERCHANT_KEY"),
    passphrase: envValue(
      "PAYFAST_PASSPHRASE",
      "PAYFAST_PASSPHASE",
      "NEXT_PUBLIC_PAYFAST_PASSPHRASE",
      "NEXT_PUBLIC_PAYFAST_PASSPHASE",
    ),
  };
}

function sandboxCredentials(): PayfastCredentials {
  return {
    merchantId: envValue("PAYFAST_SANDBOX_MERCHANT_ID"),
    merchantKey: envValue("PAYFAST_SANDBOX_MERCHANT_KEY"),
    passphrase: envValue("PAYFAST_SANDBOX_PASSPHRASE", "PAYFAST_SANDBOX_PASSPHASE"),
  };
}

function hasAnySandboxCredential(): boolean {
  const sandbox = sandboxCredentials();
  return Boolean(sandbox.merchantId || sandbox.merchantKey || sandbox.passphrase);
}

export function getPayfastCredentials(): PayfastCredentials {
  if (!isPayfastSandbox()) return liveCredentials();

  // Production sandbox must use the sandbox merchant set. Mixing live keys with
  // sandbox.payfast.co.za causes "Generated signature does not match".
  if (hasAnySandboxCredential() || process.env.NODE_ENV === "production") {
    return sandboxCredentials();
  }

  return liveCredentials();
}

export function getPayfastMerchantId(): string {
  return getPayfastCredentials().merchantId;
}

export function getPayfastMerchantKey(): string {
  return getPayfastCredentials().merchantKey;
}

export function getPayfastPassphrase(): string {
  return getPayfastCredentials().passphrase;
}

export function isPayfastConfigured(): boolean {
  const { merchantId, merchantKey, passphrase } = getPayfastCredentials();
  return Boolean(merchantId && merchantKey && passphrase);
}

export function getPayfastConfigError(): string | null {
  if (isPayfastConfigured()) return null;

  if (isPayfastSandbox()) {
    return "PayFast sandbox is on, but PAYFAST_SANDBOX_MERCHANT_ID, PAYFAST_SANDBOX_MERCHANT_KEY, and PAYFAST_SANDBOX_PASSPHRASE must all be set to the sandbox merchant. Live keys cannot be used on sandbox.payfast.co.za.";
  }

  return "PayFast is not configured.";
}

export function isPayfastSandbox(): boolean {
  const explicit = envFlag(process.env.PAYFAST_SANDBOX);
  if (explicit !== null) return explicit;
  return process.env.NODE_ENV === "development";
}

export function isPayfastMockAllowed(): boolean {
  const value = process.env.PAYFAST_ALLOW_MOCK?.trim().toLowerCase();
  return value === "true" || value === "1" || value === "yes";
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
  options?: { includeEmpty?: boolean },
): string {
  const includeEmpty = options?.includeEmpty === true;
  const pairs: string[] = [];

  for (const [key, value] of Object.entries(data)) {
    if (key === "signature") continue;
    const trimmed = value.trim();
    if (trimmed === "") {
      // PayFast ITN includes posted-but-empty fields as "key=".
      if (includeEmpty) pairs.push(`${key}=`);
      continue;
    }
    pairs.push(`${key}=${phpUrlEncode(trimmed)}`);
  }

  let paramString = pairs.join("&");
  const salt = passphrase?.trim();
  if (salt) {
    paramString += `&passphrase=${phpUrlEncode(salt)}`;
  }

  return createHash("md5").update(paramString).digest("hex");
}

export function generatePayfastApiSignature(
  data: Record<string, string>,
  passphrase: string,
): string {
  const payload: Record<string, string> = { ...data, passphrase };

  const pairs = Object.keys(payload)
    .sort()
    .filter((key) => payload[key] !== "")
    .map((key) => `${key}=${phpUrlEncode(payload[key].trim())}`);

  return createHash("md5").update(pairs.join("&")).digest("hex");
}

function payfastApiTimestamp(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${value("year")}-${value("month")}-${value("day")}T${value("hour")}:${value("minute")}:${value("second")}+02:00`;
}

export async function cancelPayfastSubscription(token: string): Promise<void> {
  const merchantId = getPayfastMerchantId();
  const passphrase = getPayfastPassphrase();
  const trimmedToken = token.trim();

  if (!merchantId || !passphrase) {
    throw new Error("PayFast is not configured.");
  }

  if (!trimmedToken) {
    throw new Error("Missing PayFast subscription token.");
  }

  const timestamp = payfastApiTimestamp();
  const signature = generatePayfastApiSignature(
    {
      "merchant-id": merchantId,
      timestamp,
      version: "v1",
    },
    passphrase,
  );

  const url = new URL(
    `https://api.payfast.co.za/subscriptions/${encodeURIComponent(trimmedToken)}/cancel`,
  );
  if (isPayfastSandbox()) {
    url.searchParams.set("testing", "true");
  }

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      "merchant-id": merchantId,
      version: "v1",
      timestamp,
      signature,
    },
    signal: AbortSignal.timeout(15_000),
  });

  const payload = (await response.json().catch(() => null)) as {
    code?: number;
    status?: string;
    data?: { response?: boolean; message?: string };
    message?: string;
  } | null;

  if (!response.ok || payload?.status === "failed" || payload?.data?.response === false) {
    throw new Error(
      payload?.data?.message ||
        payload?.message ||
        "PayFast could not cancel this subscription.",
    );
  }
}

function orderedCheckoutPayload(
  fields: Omit<PayfastCheckoutFields, "signature">,
): Record<string, string> {
  const payload: Record<string, string> = {};

  for (const key of CHECKOUT_FIELD_ORDER) {
    const value = fields[key as keyof typeof fields];
    if (typeof value === "string" && value.trim() !== "") {
      payload[key] = value.trim();
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
  frequency: BillingFrequency;
  email?: string;
  name?: string;
}): { processUrl: string; fields: PayfastCheckoutFields } {
  const merchantId = getPayfastMerchantId();
  const merchantKey = getPayfastMerchantKey();
  const passphrase = getPayfastPassphrase();

  if (!merchantId || !merchantKey || !passphrase) {
    throw new Error(getPayfastConfigError() || "PayFast is not configured.");
  }

  const amount = payfastAmount(input.amountZar);
  const [firstName, ...lastParts] = (input.name ?? "").trim().split(/\s+/);
  const lastName = lastParts.join(" ");
  const annual = input.frequency === "annual";
  const periodLabel = annual ? "Annual" : "Monthly";
  // PayFast 1=Daily, 2=Weekly, 3=Monthly, 4=Quarterly, 5=Biannually, 6=Annual
  const frequency = payfastFrequencyCode(input.frequency);

  const unordered: Omit<PayfastCheckoutFields, "signature"> = {
    merchant_id: merchantId,
    merchant_key: merchantKey,
    return_url: `${input.origin}/builder?websiteId=${encodeURIComponent(input.websiteId)}&checkout=return`,
    cancel_url: `${input.origin}/builder?websiteId=${encodeURIComponent(input.websiteId)}&checkout=cancel`,
    notify_url: `${input.origin}/api/payfast/notify`,
    m_payment_id: input.paymentId,
    amount,
    item_name: `${periodLabel} Lulaweb website ${input.domain}`.slice(0, 100),
    item_description: `${periodLabel} Lulaweb website and domain. Renews every ${annual ? "year" : "month"} for ${input.domain}.`.slice(0, 255),
    subscription_type: "1",
    recurring_amount: amount,
    frequency,
    cycles: "0",
    custom_str1: input.websiteId,
    custom_str2: input.domain,
    custom_str3: input.paymentId,
    custom_str4: "subscription",
    custom_str5: input.frequency,
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

export function buildPayfastEditTopupCheckout(input: {
  origin: string;
  returnPath: string;
  paymentId: string;
  uid: string;
  amountZar: number;
  edits: number;
  email?: string;
  name?: string;
}): { processUrl: string; fields: PayfastCheckoutFields } {
  const merchantId = getPayfastMerchantId();
  const merchantKey = getPayfastMerchantKey();
  const passphrase = getPayfastPassphrase();

  if (!merchantId || !merchantKey || !passphrase) {
    throw new Error(getPayfastConfigError() || "PayFast is not configured.");
  }

  const amount = payfastAmount(input.amountZar);
  const [firstName, ...lastParts] = (input.name ?? "").trim().split(/\s+/);
  const lastName = lastParts.join(" ");
  const returnPath = input.returnPath.startsWith("/") ? input.returnPath : `/${input.returnPath}`;
  const separator = returnPath.includes("?") ? "&" : "?";

  const unordered: Omit<PayfastCheckoutFields, "signature"> = {
    merchant_id: merchantId,
    merchant_key: merchantKey,
    return_url: `${input.origin}${returnPath}${separator}edits=return`,
    cancel_url: `${input.origin}${returnPath}${separator}edits=cancel`,
    notify_url: `${input.origin}/api/payfast/notify`,
    m_payment_id: input.paymentId,
    amount,
    item_name: `Lulaweb ${input.edits} Edits`.slice(0, 100),
    item_description: `${input.edits} Edits for website building`.slice(0, 255),
    payment_method: "cc",
    custom_str1: input.uid,
    custom_str2: input.paymentId,
    custom_str4: "edits",
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

/** One-off R100 managed-website deposit from WhatsApp, tracked by phone (custom_str1). */
export function buildPayfastWhatsAppDepositCheckout(input: {
  origin: string;
  paymentId: string;
  phone: string;
  amountZar: number;
  email?: string;
  name?: string;
}): { processUrl: string; fields: PayfastCheckoutFields } {
  const merchantId = getPayfastMerchantId();
  const merchantKey = getPayfastMerchantKey();
  const passphrase = getPayfastPassphrase();

  if (!merchantId || !merchantKey || !passphrase) {
    throw new Error(getPayfastConfigError() || "PayFast is not configured.");
  }

  const amount = payfastAmount(input.amountZar);
  const phone = input.phone.replace(/\D/g, "");
  const [firstName, ...lastParts] = (input.name ?? "").trim().split(/\s+/);
  const lastName = lastParts.join(" ");
  const cellNumber =
    phone.startsWith("27") && phone.length >= 11 ? `0${phone.slice(2)}` : phone;

  const unordered: Omit<PayfastCheckoutFields, "signature"> = {
    merchant_id: merchantId,
    merchant_key: merchantKey,
    return_url: `${input.origin}/payfast/deposit?status=return&wa=${encodeURIComponent(phone)}`,
    cancel_url: `${input.origin}/payfast/deposit?status=cancel&wa=${encodeURIComponent(phone)}`,
    notify_url: `${input.origin}/api/payfast/notify`,
    m_payment_id: input.paymentId,
    amount,
    item_name: "Lulaweb website deposit".slice(0, 100),
    item_description:
      "R100 refundable deposit to start a fully managed Lulaweb website.".slice(0, 255),
    payment_method: "cc",
    custom_str1: phone,
    custom_str3: input.paymentId,
    custom_str4: "whatsapp_deposit",
    ...(cellNumber ? { cell_number: cellNumber.slice(0, 100) } : {}),
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

  const expected = generatePayfastSignature(payload, passphrase, { includeEmpty: true });
  return expected === received;
}

export function amountsMatch(expectedZar: number, received: string | undefined): boolean {
  const parsed = Number(received);
  if (!Number.isFinite(parsed)) return false;
  return payfastAmount(parsed) === payfastAmount(expectedZar);
}
