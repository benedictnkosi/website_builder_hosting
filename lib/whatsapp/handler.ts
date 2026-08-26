import "server-only";

import {
  formatHumanJoinRequest,
  getHumanHandoverWhatsApp,
  getHumanJoiningCustomerReply,
} from "./config";
import { markWhatsAppMessageRead, sendWhatsAppText } from "./client";
import {
  isWhatsAppHumanTakeover,
  recordWhatsAppChatTurn,
  setWhatsAppHumanTakeover,
} from "./chats";
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
  const joinRequest = formatHumanJoinRequest(lead.waId);
  const summary = [
    joinRequest,
    "",
    "Lulaweb WhatsApp — please take over this chat in the admin inbox / business WhatsApp.",
    "(Stay in this same thread — do not send the customer a different WhatsApp link.)",
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

/** Alert Benedict when a customer messages a chat that is on human takeover (AI paused). */
async function notifyHumanOfManagedMessage(input: {
  phone: string;
  text: string;
  contactName?: string;
}): Promise<void> {
  const humanTo = getHumanHandoverWhatsApp();
  const customer = input.phone.replace(/\D/g, "");
  if (!humanTo || !customer || customer === humanTo) return;

  const preview =
    input.text.length > 500 ? `${input.text.slice(0, 497)}...` : input.text;
  const name = input.contactName?.trim();
  const body = [
    `New message in human-managed chat +${customer}${name ? ` (${name})` : ""}.`,
    "",
    preview,
    "",
    "Reply from the admin inbox / business WhatsApp — AI is paused on this chat.",
  ].join("\n");

  await sendWhatsAppText({ to: humanTo, body });
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
    const humanTakeover = await isWhatsAppHumanTakeover(message.from);
    if (humanTakeover) {
      await saveWhatsAppLead(lead);
      return;
    }
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

  const at = new Date().toISOString();

  // Human takeover: log the customer message, do not run or reply with the AI.
  if (await isWhatsAppHumanTakeover(message.from)) {
    lead.messages = [
      ...lead.messages,
      { role: "user", content: message.text, at },
    ];
    await recordWhatsAppChatTurn({
      phone: message.from,
      userText: message.text,
      contactName: lead.contactName || lead.fields.name,
      at,
    });
    await saveWhatsAppLead(lead);
    try {
      await notifyHumanOfManagedMessage({
        phone: message.from,
        text: message.text,
        contactName: lead.contactName || lead.fields.name,
      });
    } catch (error) {
      console.error("WhatsApp human-managed message notify failed:", error);
    }
    return;
  }

  const alreadyHandedOff = lead.status === "handed_off" && Boolean(lead.notifiedAt);

  const result = await runWhatsAppSalesBot({
    lead,
    userText: message.text,
  });

  lead.fields = result.fields;
  if (!lead.fields.phone) lead.fields.phone = message.from;
  lead.status = result.status;

  let reply = result.reply;
  // First handover: keep the customer in this chat and call Benedict in.
  if (result.readyForHandoff && !alreadyHandedOff && !lead.notifiedAt) {
    reply = getHumanJoiningCustomerReply();
    lead.status = "handed_off";
  } else if (alreadyHandedOff && result.status === "handed_off") {
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
        `Asked Benedict (+${getHumanHandoverWhatsApp()}) to join chat with ${lead.waId}.`,
      ]
        .filter(Boolean)
        .join(" ");
      await setWhatsAppHumanTakeover({
        phone: message.from,
        humanTakeover: true,
      });
    } catch (error) {
      console.error("WhatsApp human handover notify failed:", error);
      // Keep conversation open so a later message can retry handover.
      lead.status = "hot";
    }
  }

  await saveWhatsAppLead(lead);
}
