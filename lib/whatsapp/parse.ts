import "server-only";

import type { WhatsAppInboundText, WhatsAppWebhookPayload } from "./types";

type WebhookMessage = NonNullable<
  NonNullable<
    NonNullable<WhatsAppWebhookPayload["entry"]>[number]["changes"]
  >[number]["value"]
>["messages"] extends (infer M)[] | undefined
  ? M
  : never;

function textFromMessage(message: WebhookMessage): string | null {
  if (!message) return null;
  if (message.type === "text" && message.text?.body?.trim()) {
    return message.text.body.trim();
  }
  if (message.type === "button" && message.button?.text?.trim()) {
    return message.button.text.trim();
  }
  if (message.type === "interactive") {
    const title =
      message.interactive?.button_reply?.title ||
      message.interactive?.list_reply?.title;
    if (title?.trim()) return title.trim();
  }
  return null;
}

/** Extract inbound customer text messages from a Cloud API webhook payload. */
export function extractInboundMessages(
  payload: WhatsAppWebhookPayload,
): WhatsAppInboundText[] {
  if (payload.object !== "whatsapp_business_account") return [];

  const results: WhatsAppInboundText[] = [];

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field && change.field !== "messages") continue;
      const value = change.value;
      if (!value?.messages?.length) continue;

      const contactName = value.contacts?.[0]?.profile?.name?.trim() || "";

      for (const message of value.messages) {
        const from = message.from?.trim();
        const messageId = message.id?.trim();
        if (!from || !messageId) continue;

        const text = textFromMessage(message);
        results.push({
          messageId,
          from,
          timestamp: message.timestamp || String(Math.floor(Date.now() / 1000)),
          text: text ?? "",
          contactName,
          messageType: message.type,
          phoneNumberId: value.metadata?.phone_number_id,
        });
      }
    }
  }

  return results;
}
