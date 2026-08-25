import "server-only";

import {
  getWhatsAppAccessToken,
  getWhatsAppPhoneNumberId,
  WHATSAPP_GRAPH_BASE,
} from "./config";

export class WhatsAppApiError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 502) {
    super(message);
    this.name = "WhatsAppApiError";
    this.statusCode = statusCode;
  }
}

type GraphErrorBody = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
};

function assertConfigured(): { token: string; phoneNumberId: string } {
  const token = getWhatsAppAccessToken();
  const phoneNumberId = getWhatsAppPhoneNumberId();
  if (!token || !phoneNumberId) {
    throw new WhatsAppApiError(
      "WhatsApp Cloud API is not configured. Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID.",
      500,
    );
  }
  return { token, phoneNumberId };
}

async function graphPost(
  path: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const { token } = assertConfigured();

  let response: Response;
  try {
    response = await fetch(`${WHATSAPP_GRAPH_BASE}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    const aborted =
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError");
    throw new WhatsAppApiError(
      aborted
        ? "WhatsApp API request timed out."
        : "Unable to reach the WhatsApp Cloud API.",
      502,
    );
  }

  const payload = (await response.json().catch(() => null)) as GraphErrorBody | null;
  if (!response.ok) {
    console.error("WhatsApp API error:", response.status, payload);
    throw new WhatsAppApiError(
      payload?.error?.message || `WhatsApp API failed with status ${response.status}.`,
      response.status === 401 || response.status === 403 ? 500 : 502,
    );
  }

  return payload;
}

/** Digits only, international format without +. */
export function normalizeWhatsAppTo(to: string): string {
  return to.replace(/\D/g, "");
}

export async function sendWhatsAppText(input: {
  to: string;
  body: string;
}): Promise<void> {
  const { phoneNumberId } = assertConfigured();
  const to = normalizeWhatsAppTo(input.to);
  const text = input.body.trim();
  if (!to || !text) {
    throw new WhatsAppApiError("Missing WhatsApp recipient or message body.", 400);
  }

  // WhatsApp text body max is 4096 characters.
  const body = text.length > 4000 ? `${text.slice(0, 3997)}...` : text;

  await graphPost(`/${encodeURIComponent(phoneNumberId)}/messages`, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: {
      preview_url: true,
      body,
    },
  });
}

export async function markWhatsAppMessageRead(messageId: string): Promise<void> {
  const id = messageId.trim();
  if (!id) return;
  const { phoneNumberId } = assertConfigured();

  try {
    await graphPost(`/${encodeURIComponent(phoneNumberId)}/messages`, {
      messaging_product: "whatsapp",
      status: "read",
      message_id: id,
    });
  } catch (error) {
    // Non-fatal — still reply even if read receipt fails.
    console.warn("WhatsApp mark-read failed:", error);
  }
}
