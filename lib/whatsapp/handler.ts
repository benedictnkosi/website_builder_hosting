import "server-only";

import {
  getHumanHandoverChatLink,
  getHumanHandoverWhatsApp,
  MANAGED_WEBSITE_OFFER,
} from "./config";
import { markWhatsAppMessageRead, sendWhatsAppText } from "./client";
import { recordWhatsAppChatTurn } from "./chats";
import {
  getOrCreateWhatsAppLead,
  hasProcessedMessage,
  saveWhatsAppLead,
} from "./leads";
import { sendWhatsAppLeadEmail } from "./notify";
import { extractInboundMessages } from "./parse";
import { runWhatsAppSalesBot } from "./sales-bot";
import type { WhatsAppLead, WhatsAppWebhookPayload } from "./types";

const NON_TEXT_REPLY =
  "Thanks for your message. Please reply with a text message and I'll help you with the managed website offer.";

function handoverCustomerReply(): string {
  return `Thank you. I've got you. Please tap this link to chat to a Lulaweb team member who will help get your website started: ${getHumanHandoverChatLink()}`;
}

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

async function notifyHumanHandover(lead: WhatsAppLead): Promise<void> {
  const humanTo = getHumanHandoverWhatsApp();
  const f = lead.fields;
  const summary = [
    "Lulaweb WhatsApp handover — customer says they paid the R100 deposit.",
    "(Payment not independently verified by the bot.)",
    "",
    `Customer WhatsApp: +${lead.waId}`,
    `Contact name: ${lead.contactName || f.name || "—"}`,
    `Business: ${f.businessName || "—"}`,
    `Industry: ${f.industry || "—"}`,
    `Email: ${f.email || "—"}`,
    `Notes: ${f.notes || "—"}`,
    "",
    "Recent chat:",
    ...lead.messages.slice(-8).map((m) => {
      const who = m.role === "user" ? "Customer" : "Bot";
      return `${who}: ${m.content}`;
    }),
  ].join("\n");

  await sendWhatsAppText({ to: humanTo, body: summary });
  await sendWhatsAppLeadEmail(lead);
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

  // Stop automated sales after a successful human handover.
  if (lead.status === "handed_off" && lead.notifiedAt) {
    const at = new Date().toISOString();
    const userText = message.text || "(non-text)";
    lead.messages = [
      ...lead.messages,
      { role: "user", content: userText, at },
    ];
    await recordWhatsAppChatTurn({
      phone: message.from,
      userText,
      contactName: lead.contactName,
      at,
    });
    await saveWhatsAppLead(lead);
    return;
  }

  if (!message.text.trim()) {
    await sendWhatsAppText({ to: message.from, body: NON_TEXT_REPLY });
    const at = new Date().toISOString();
    lead.messages = [
      ...lead.messages,
      { role: "assistant", content: NON_TEXT_REPLY, at },
    ];
    await recordWhatsAppChatTurn({
      phone: message.from,
      assistantText: NON_TEXT_REPLY,
      contactName: lead.contactName,
      at,
    });
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

  let reply = result.reply;
  if (result.readyForHandoff) {
    reply = handoverCustomerReply();
    lead.status = "handed_off";
  }

  lead.messages = [
    ...lead.messages,
    { role: "user", content: message.text, at },
    { role: "assistant", content: reply, at },
  ];

  await sendWhatsAppText({ to: message.from, body: reply });
  await recordWhatsAppChatTurn({
    phone: message.from,
    userText: message.text,
    assistantText: reply,
    contactName: lead.contactName || lead.fields.name,
    at,
  });

  if (result.readyForHandoff && !lead.notifiedAt) {
    try {
      await notifyHumanHandover(lead);
      lead.notifiedAt = new Date().toISOString();
      lead.status = "handed_off";
      lead.fields.notes = [
        lead.fields.notes,
        `Handed over to +${getHumanHandoverWhatsApp()} (R${MANAGED_WEBSITE_OFFER.depositZar} deposit claimed by customer).`,
      ]
        .filter(Boolean)
        .join(" ");
    } catch (error) {
      console.error("WhatsApp human handover notify failed:", error);
      // Keep conversation open so a later message can retry handover.
      lead.status = "hot";
    }
  }

  await saveWhatsAppLead(lead);
}
