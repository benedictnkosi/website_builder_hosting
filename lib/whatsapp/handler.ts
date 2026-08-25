import "server-only";

import { markWhatsAppMessageRead, sendWhatsAppText } from "./client";
import {
  getOrCreateWhatsAppLead,
  hasProcessedMessage,
  saveWhatsAppLead,
} from "./leads";
import { sendWhatsAppLeadEmail } from "./notify";
import { extractInboundMessages } from "./parse";
import { runWhatsAppSalesBot } from "./sales-bot";
import type { WhatsAppWebhookPayload } from "./types";

const NON_TEXT_REPLY =
  "Thanks for your message. Please reply with a text message and I'll help you with the managed website offer.";

/**
 * Process a verified Cloud API webhook. Always safe to call — errors are logged
 * per message so Meta still gets a 200 from the route.
 */
export async function handleWhatsAppWebhook(
  payload: WhatsAppWebhookPayload,
): Promise<void> {
  const inbound = extractInboundMessages(payload);
  if (inbound.length === 0) return;

  for (const message of inbound) {
    try {
      await processInboundMessage(message);
    } catch (error) {
      console.error("WhatsApp inbound processing failed:", message.messageId, error);
    }
  }
}

async function processInboundMessage(message: {
  messageId: string;
  from: string;
  timestamp: string;
  text: string;
  contactName?: string;
}): Promise<void> {
  const lead = await getOrCreateWhatsAppLead({
    waId: message.from,
    contactName: message.contactName,
  });

  if (hasProcessedMessage(lead, message.messageId)) {
    return;
  }

  lead.processedMessageIds = [...lead.processedMessageIds, message.messageId];
  await markWhatsAppMessageRead(message.messageId);

  if (!message.text.trim()) {
    await sendWhatsAppText({ to: message.from, body: NON_TEXT_REPLY });
    lead.messages = [
      ...lead.messages,
      {
        role: "assistant",
        content: NON_TEXT_REPLY,
        at: new Date().toISOString(),
      },
    ];
    await saveWhatsAppLead(lead);
    return;
  }

  // Seed phone from WhatsApp id when unknown.
  if (!lead.fields.phone) {
    lead.fields.phone = message.from;
  }

  const result = await runWhatsAppSalesBot({
    lead,
    userText: message.text,
  });

  const at = new Date().toISOString();
  lead.fields = result.fields;
  if (!lead.fields.phone) lead.fields.phone = message.from;
  lead.status = result.status;
  lead.messages = [
    ...lead.messages,
    { role: "user", content: message.text, at },
    { role: "assistant", content: result.reply, at },
  ];

  await sendWhatsAppText({ to: message.from, body: result.reply });

  if (result.readyForHandoff && !lead.notifiedAt) {
    try {
      await sendWhatsAppLeadEmail(lead);
      lead.notifiedAt = new Date().toISOString();
      lead.status = "handed_off";
    } catch (error) {
      console.error("WhatsApp lead notify failed:", error);
      // Keep status hot so a later message can retry notify.
      lead.status = "hot";
    }
  }

  await saveWhatsAppLead(lead);
}
