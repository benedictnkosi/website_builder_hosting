import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { getWhatsAppAppSecret, getWhatsAppVerifyToken } from "./config";

export function verifyWebhookSubscription(params: {
  mode: string | null;
  token: string | null;
  challenge: string | null;
}): string | null {
  const expected = getWhatsAppVerifyToken();
  if (!expected) return null;
  if (params.mode !== "subscribe") return null;
  if (!params.token || params.token !== expected) return null;
  return params.challenge?.trim() || null;
}

/** Meta signs the raw request body with HMAC-SHA256 using the app secret. */
export function verifyWhatsAppSignature(
  rawBody: string,
  signatureHeader: string | null,
): boolean {
  const secret = getWhatsAppAppSecret();
  if (!secret) return false;
  if (!signatureHeader?.startsWith("sha256=")) return false;

  const expectedHex = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const receivedHex = signatureHeader.slice("sha256=".length).trim().toLowerCase();

  if (!/^[0-9a-f]+$/.test(receivedHex) || expectedHex.length !== receivedHex.length) {
    return false;
  }

  try {
    return timingSafeEqual(
      Buffer.from(expectedHex, "hex"),
      Buffer.from(receivedHex, "hex"),
    );
  } catch {
    return false;
  }
}
