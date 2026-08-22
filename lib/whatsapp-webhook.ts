import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export type WhatsAppWebhookEnv = {
  verifyToken: string;
  appSecret: string;
  accessToken: string;
  phoneNumberId: string;
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

type WebhookRequestContext = {
  signatureHeaderExists: boolean;
  rawBodyBytes: number;
};

const MAX_SEEN_EVENT_IDS = 10_000;
const seenEventIds = new Set<string>();

const ENV_NAMES = {
  verifyToken: "WHATSAPP_WEBHOOK_VERIFY_TOKEN",
  appSecret: "WHATSAPP_APP_SECRET",
  accessToken: "WHATSAPP_ACCESS_TOKEN",
  phoneNumberId: "WHATSAPP_PHONE_NUMBER_ID",
} as const;

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function requiredEnvValue(
  source: Record<string, string | undefined>,
  name: string,
): string {
  const value = nonEmpty(source[name]);
  if (!value) throw new Error(name);
  return value;
}

export function getWhatsAppWebhookEnv(
  source: Record<string, string | undefined> = process.env,
): WhatsAppWebhookEnv {
  const values = {
    verifyToken: nonEmpty(source[ENV_NAMES.verifyToken]),
    appSecret: nonEmpty(source[ENV_NAMES.appSecret]),
    accessToken: nonEmpty(source[ENV_NAMES.accessToken]),
    phoneNumberId: nonEmpty(source[ENV_NAMES.phoneNumberId]),
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
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string,
): boolean {
  if (!signatureHeader?.startsWith("sha256=")) return false;

  const suppliedHex = signatureHeader.slice("sha256=".length);
  if (!/^[a-fA-F0-9]{64}$/.test(suppliedHex)) return false;

  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest();
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

function structuredLog(event: string, summary: EventSummary): void {
  console.info(JSON.stringify({ event, ...summary }));
}

function firstSeen(eventId: string | undefined): boolean {
  if (!eventId) return true;
  if (seenEventIds.has(eventId)) return false;
  if (seenEventIds.size >= MAX_SEEN_EVENT_IDS) seenEventIds.clear();
  seenEventIds.add(eventId);
  return true;
}

function sanitizedWebhookPayload(payload: unknown): Record<string, unknown> {
  const root = asRecord(payload);
  const entries = Array.isArray(root?.entry) ? root.entry : [];

  return {
    object: stringValue(root?.object),
    entries: entries.map((entryValue) => {
      const entry = asRecord(entryValue);
      const changes = Array.isArray(entry?.changes) ? entry.changes : [];

      return {
        id: stringValue(entry?.id),
        changes: changes.map((changeValue) => {
          const change = asRecord(changeValue);
          const value = asRecord(change?.value);
          const metadata = asRecord(value?.metadata);
          const messages = Array.isArray(value?.messages) ? value.messages : [];
          const statuses = Array.isArray(value?.statuses) ? value.statuses : [];

          return {
            field: stringValue(change?.field),
            phoneNumberId: stringValue(metadata?.phone_number_id),
            messages: messages.flatMap((messageValue) => {
              const message = asRecord(messageValue);
              return message
                ? [{
                    id: stringValue(message.id),
                    from: phoneSuffix(message.from),
                    timestamp: stringValue(message.timestamp),
                    type: stringValue(message.type) ?? "unknown",
                    content: "[REDACTED]",
                  }]
                : [];
            }),
            statuses: statuses.flatMap((statusValue) => {
              const status = asRecord(statusValue);
              return status
                ? [{
                    id: stringValue(status.id),
                    recipient: phoneSuffix(status.recipient_id),
                    status: stringValue(status.status) ?? "unknown",
                    timestamp: stringValue(status.timestamp),
                  }]
                : [];
            }),
          };
        }),
      };
    }),
  };
}

export async function processWhatsAppMessage(
  message: WhatsAppMessage,
  context: EventSummary,
  handler?: WhatsAppWebhookHandlers["onMessage"],
): Promise<void> {
  structuredLog("whatsapp.message", {
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
  structuredLog("whatsapp.status", {
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
  requestContext: WebhookRequestContext = {
    signatureHeaderExists: true,
    rawBodyBytes: 0,
  },
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
        signatureHeaderExists: requestContext.signatureHeaderExists,
        rawBodyBytes: requestContext.rawBodyBytes,
      };
      let handled = false;

      if (Array.isArray(value?.messages)) {
        for (const messageValue of value.messages) {
          const message = asRecord(messageValue);
          if (!message) continue;
          const messageId = stringValue(message.id);
          if (!firstSeen(messageId ? `message:${messageId}` : undefined)) {
            structuredLog("whatsapp.message.duplicate", {
              ...context,
              messageId,
            });
            handled = true;
            continue;
          }
          await processWhatsAppMessage(message, context, handlers.onMessage);
          result.messages += 1;
          handled = true;
        }
      }

      if (Array.isArray(value?.statuses)) {
        for (const statusValue of value.statuses) {
          const status = asRecord(statusValue);
          if (!status) continue;
          const messageId = stringValue(status.id);
          const statusName = stringValue(status.status);
          const statusEventId = messageId && statusName
            ? `status:${messageId}:${statusName}`
            : undefined;
          if (!firstSeen(statusEventId)) {
            structuredLog("whatsapp.status.duplicate", {
              ...context,
              messageId,
              status: statusName,
            });
            handled = true;
            continue;
          }
          await processWhatsAppStatus(status, context, handlers.onStatus);
          result.statuses += 1;
          handled = true;
        }
      }

      if (!handled) {
        result.unsupported += 1;
        structuredLog("whatsapp.unsupported", context);
      }
    }
  }

  return result;
}

function configurationError(variableName: string): Response {
  console.error(JSON.stringify({
    event: "whatsapp.configuration.invalid",
    missingEnvironmentVariable: variableName,
  }));
  return Response.json({ error: "Webhook is not configured." }, { status: 503 });
}

export function handleWhatsAppVerification(
  request: Request,
  envSource: Record<string, string | undefined> = process.env,
): Response {
  let verifyToken: string;
  try {
    verifyToken = requiredEnvValue(envSource, ENV_NAMES.verifyToken);
  } catch (error) {
    return configurationError(error instanceof Error ? error.message : ENV_NAMES.verifyToken);
  }

  const params = new URL(request.url).searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  if (
    mode === "subscribe" &&
    token !== null &&
    challenge !== null &&
    constantTimeEqual(token, verifyToken)
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
  let appSecret: string;
  try {
    appSecret = requiredEnvValue(envSource, ENV_NAMES.appSecret);
  } catch (error) {
    return configurationError(error instanceof Error ? error.message : ENV_NAMES.appSecret);
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  const signatureHeader = request.headers.get("x-hub-signature-256");
  const requestContext: WebhookRequestContext = {
    signatureHeaderExists: signatureHeader !== null,
    rawBodyBytes: Buffer.byteLength(rawBody, "utf8"),
  };

  if (!isValidMetaSignature(rawBody, signatureHeader, appSecret)) {
    structuredLog("whatsapp.signature.invalid", requestContext);
    return new Response("Unauthorized", { status: 401 });
  }

  structuredLog("whatsapp.signature.valid", requestContext);

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody) as unknown;
  } catch {
    structuredLog("whatsapp.json.invalid", requestContext);
    return new Response("Bad Request", { status: 400 });
  }

  if (process.env.NODE_ENV === "development") {
    console.info(JSON.stringify({
      event: "whatsapp.webhook",
      payload: sanitizedWebhookPayload(payload),
    }));
  }

  try {
    await processWhatsAppPayload(payload, handlers, requestContext);
  } catch (error) {
    console.error("WhatsApp webhook processing failed", {
      error: error instanceof Error ? error.name : "UnknownError",
    });
  }

  return new Response("EVENT_RECEIVED", { status: 200 });
}
