import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export type WhatsAppWebhookEnv = {
  verifyToken: string;
  appSecret: string;
  accessToken: string;
  phoneNumberId: string;
  businessAccountId: string;
};

type WhatsAppMessage = {
  id?: unknown;
  from?: unknown;
  timestamp?: unknown;
  type?: unknown;
};

type WhatsAppStatus = {
  id?: unknown;
  recipient_id?: unknown;
  status?: unknown;
  timestamp?: unknown;
};

type EventSummary = Record<string, string | number | boolean | undefined>;

export type WhatsAppWebhookHandlers = {
  onMessage?: (message: WhatsAppMessage, context: EventSummary) => void | Promise<void>;
  onStatus?: (status: WhatsAppStatus, context: EventSummary) => void | Promise<void>;
};

const ENV_NAMES = {
  verifyToken: "WHATSAPP_WEBHOOK_VERIFY_TOKEN",
  appSecret: "META_APP_SECRET",
  accessToken: "WHATSAPP_ACCESS_TOKEN",
  phoneNumberId: "WHATSAPP_PHONE_NUMBER_ID",
  businessAccountId: "WHATSAPP_BUSINESS_ACCOUNT_ID",
} as const;

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function getWhatsAppWebhookEnv(
  source: Record<string, string | undefined> = process.env,
): WhatsAppWebhookEnv {
  const values = {
    verifyToken: nonEmpty(source[ENV_NAMES.verifyToken]),
    appSecret: nonEmpty(source[ENV_NAMES.appSecret]),
    accessToken: nonEmpty(source[ENV_NAMES.accessToken]),
    phoneNumberId: nonEmpty(source[ENV_NAMES.phoneNumberId]),
    businessAccountId: nonEmpty(source[ENV_NAMES.businessAccountId]),
  };
  const missing = (Object.keys(values) as Array<keyof typeof values>)
    .filter((key) => !values[key])
    .map((key) => ENV_NAMES[key]);

  if (missing.length > 0) {
    throw new Error(`Missing WhatsApp environment variables: ${missing.join(", ")}`);
  }

  return values as WhatsAppWebhookEnv;
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftHash = createHash("sha256").update(left, "utf8").digest();
  const rightHash = createHash("sha256").update(right, "utf8").digest();
  return timingSafeEqual(leftHash, rightHash);
}

export function isValidMetaSignature(
  rawBody: Buffer,
  signatureHeader: string | null,
  appSecret: string,
): boolean {
  if (!signatureHeader?.startsWith("sha256=")) return false;

  const suppliedHex = signatureHeader.slice("sha256=".length);
  if (!/^[a-fA-F0-9]{64}$/.test(suppliedHex)) return false;

  const expected = createHmac("sha256", appSecret).update(rawBody).digest();
  const supplied = Buffer.from(suppliedHex, "hex");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function phoneSuffix(value: unknown): string | undefined {
  const phone = stringValue(value);
  if (!phone) return undefined;
  const suffix = phone.replace(/\D/g, "").slice(-4);
  return suffix ? `***${suffix}` : undefined;
}

function developmentLog(event: string, summary: EventSummary): void {
  if (process.env.NODE_ENV !== "development") return;
  console.info(JSON.stringify({ event, ...summary }));
}

export async function processWhatsAppMessage(
  message: WhatsAppMessage,
  context: EventSummary,
  handler?: WhatsAppWebhookHandlers["onMessage"],
): Promise<void> {
  developmentLog("whatsapp.message", {
    ...context,
    messageId: stringValue(message.id),
    messageType: stringValue(message.type) ?? "unknown",
    sender: phoneSuffix(message.from),
    timestamp: stringValue(message.timestamp),
  });
  await handler?.(message, context);
}

export async function processWhatsAppStatus(
  status: WhatsAppStatus,
  context: EventSummary,
  handler?: WhatsAppWebhookHandlers["onStatus"],
): Promise<void> {
  developmentLog("whatsapp.status", {
    ...context,
    messageId: stringValue(status.id),
    status: stringValue(status.status) ?? "unknown",
    recipient: phoneSuffix(status.recipient_id),
    timestamp: stringValue(status.timestamp),
  });
  await handler?.(status, context);
}

export async function processWhatsAppPayload(
  payload: unknown,
  handlers: WhatsAppWebhookHandlers = {},
): Promise<{ messages: number; statuses: number; unsupported: number }> {
  const result = { messages: 0, statuses: 0, unsupported: 0 };
  const root = asRecord(payload);
  const entries = Array.isArray(root?.entry) ? root.entry : [];

  if (entries.length === 0) result.unsupported += 1;

  for (const entryValue of entries) {
    const entry = asRecord(entryValue);
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    if (changes.length === 0) result.unsupported += 1;

    for (const changeValue of changes) {
      const change = asRecord(changeValue);
      const value = asRecord(change?.value);
      const metadata = asRecord(value?.metadata);
      const context: EventSummary = {
        entryId: stringValue(entry?.id),
        field: stringValue(change?.field) ?? "unknown",
        phoneNumberId: stringValue(metadata?.phone_number_id),
      };
      let handled = false;

      if (Array.isArray(value?.messages)) {
        for (const messageValue of value.messages) {
          const message = asRecord(messageValue);
          if (!message) continue;
          await processWhatsAppMessage(message, context, handlers.onMessage);
          result.messages += 1;
          handled = true;
        }
      }

      if (Array.isArray(value?.statuses)) {
        for (const statusValue of value.statuses) {
          const status = asRecord(statusValue);
          if (!status) continue;
          await processWhatsAppStatus(status, context, handlers.onStatus);
          result.statuses += 1;
          handled = true;
        }
      }

      if (!handled) {
        result.unsupported += 1;
        developmentLog("whatsapp.unsupported", context);
      }
    }
  }

  return result;
}

function configurationError(): Response {
  return Response.json({ error: "Webhook is not configured." }, { status: 503 });
}

export function handleWhatsAppVerification(
  request: Request,
  envSource: Record<string, string | undefined> = process.env,
): Response {
  let env: WhatsAppWebhookEnv;
  try {
    env = getWhatsAppWebhookEnv(envSource);
  } catch {
    return configurationError();
  }

  const params = new URL(request.url).searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  if (
    mode === "subscribe" &&
    token !== null &&
    challenge !== null &&
    constantTimeEqual(token, env.verifyToken)
  ) {
    return new Response(challenge, {
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  return new Response("Forbidden", { status: 403 });
}

export async function handleWhatsAppWebhook(
  request: Request,
  envSource: Record<string, string | undefined> = process.env,
  handlers: WhatsAppWebhookHandlers = {},
): Promise<Response> {
  let env: WhatsAppWebhookEnv;
  try {
    env = getWhatsAppWebhookEnv(envSource);
  } catch {
    return configurationError();
  }

  let rawBody: Buffer;
  try {
    rawBody = Buffer.from(await request.arrayBuffer());
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  if (!isValidMetaSignature(rawBody, request.headers.get("x-hub-signature-256"), env.appSecret)) {
    return new Response("Unauthorized", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody.toString("utf8")) as unknown;
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  try {
    await processWhatsAppPayload(payload, handlers);
  } catch (error) {
    console.error("WhatsApp webhook processing failed", {
      error: error instanceof Error ? error.name : "UnknownError",
    });
  }

  return new Response("EVENT_RECEIVED", { status: 200 });
}
