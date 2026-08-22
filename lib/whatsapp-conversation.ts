import "server-only";

import { createHash, createHmac, randomBytes } from "node:crypto";
import { getAdminFirestore, isFirebaseAdminConfigured } from "@/lib/firebase-admin";
import { coerceWebsiteIntake, emptyWebsiteIntake, type ChatMessage, type WebsiteIntake } from "@/lib/intake";
import { getGoogleFormattedAddress, searchSouthAfricanAddresses, type GoogleAddressSuggestion } from "@/lib/google-places-api";
import { runIntakeChat } from "@/lib/intake-chat";
import { assessWhatsAppAddress } from "@/lib/whatsapp-address";
import { sendWhatsAppAddressOptions, sendWhatsAppText } from "@/lib/whatsapp-cloud";
import type { WhatsAppMessage } from "@/lib/whatsapp-webhook";

const WELCOME_MESSAGE =
  "Hi! I'm here to help build your website. Tell me about your business, or upload one flyer, business card, or PDF if you have one.\n\nI'll need this information:\n\n- Business name\n- About us\n- List of services\n- Contact number\n- WhatsApp number, if WhatsApp is required\n- Email address, if a contact form is required\n- Trading hours, if you have them";
const MAX_MESSAGES = 30;
const MAX_PROCESSED_IDS = 200;
const HANDOFF_TTL_MS = 24 * 60 * 60 * 1000;

type StoredConversation = {
  messages?: unknown;
  intake?: unknown;
  processedMessageIds?: unknown;
  processingMessageId?: unknown;
  phase?: unknown;
  addressSuggestions?: unknown;
  createdAt?: unknown;
};

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function messageText(message: WhatsAppMessage): string {
  const text = message.text;
  if (!text || typeof text !== "object") return "";
  return stringValue((text as Record<string, unknown>).body);
}

function interactiveSelection(message: WhatsAppMessage): string {
  if (!message.interactive || typeof message.interactive !== "object") return "";
  const interactive = message.interactive as Record<string, unknown>;
  const listReply = interactive.list_reply;
  if (!listReply || typeof listReply !== "object") return "";
  return stringValue((listReply as Record<string, unknown>).id);
}

function addressSuggestions(value: unknown): GoogleAddressSuggestion[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const data = item as Record<string, unknown>;
    const description = stringValue(data.description);
    const placeId = stringValue(data.place_id);
    return description && placeId ? [{ description, place_id: placeId }] : [];
  });
}

function conversationId(sender: string): string {
  const secret = process.env.WHATSAPP_APP_SECRET?.trim();
  if (!secret) throw new Error("WHATSAPP_APP_SECRET is not configured.");
  return createHmac("sha256", secret).update(sender, "utf8").digest("hex");
}

function handoffHash(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function chatMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const data = item as Record<string, unknown>;
    const role = data.role === "assistant" || data.role === "user" ? data.role : null;
    const content = stringValue(data.content);
    return role && content ? [{ role, content }] : [];
  });
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function appOrigin(): string {
  return (process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://lulaweb.co.za").replace(/\/$/, "");
}

export async function processWhatsAppConversationMessage(
  message: WhatsAppMessage,
): Promise<void> {
  const sender = stringValue(message.from);
  const messageId = stringValue(message.id);
  if (!sender || !messageId) return;

  if (!isFirebaseAdminConfigured()) {
    throw new Error("Firebase Admin is required for WhatsApp conversations.");
  }

  const db = getAdminFirestore();
  const ref = db.collection("whatsappConversations").doc(conversationId(sender));
  let claimed = false;
  let stored: StoredConversation = {};

  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    stored = (snap.data() ?? {}) as StoredConversation;
    const processed = stringArray(stored.processedMessageIds);
    if (processed.includes(messageId) || stored.processingMessageId === messageId) return;
    transaction.set(ref, {
      processingMessageId: messageId,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    claimed = true;
  });

  if (!claimed) return;

  const incomingText = messageText(message);
  const selectedOption = interactiveSelection(message);
  if (!incomingText && !selectedOption) {
    await sendWhatsAppText(
      sender,
      "I can currently continue the website chat from text messages. Please type your business details, or open the builder to upload a flyer: https://lulaweb.co.za/builder",
    );
    await finishMessage(ref, stored, messageId);
    return;
  }

  if (stringValue(stored.phase) === "address") {
    try {
      await continueAddressPhase(ref, stored, sender, messageId, incomingText, selectedOption);
    } catch (error) {
      await ref.set({ processingMessageId: "", updatedAt: new Date().toISOString() }, { merge: true });
      console.error("WhatsApp address processing failed", {
        error: error instanceof Error ? error.name : "UnknownError",
        messageId,
      });
      await sendWhatsAppText(sender, "I couldn't check that address just now. Please try again.");
    }
    return;
  }
  if (stringValue(stored.phase) === "complete") {
    const completedIntake = coerceWebsiteIntake(stored.intake);
    if (completedIntake.address) {
      await finishAddress(ref, stored, sender, messageId, completedIntake);
    } else {
      await continueAddressPhase(ref, { ...stored, phase: "address" }, sender, messageId, incomingText, selectedOption);
    }
    return;
  }

  const priorMessages = chatMessages(stored.messages);
  if (priorMessages.length === 0) {
    await sendWhatsAppText(sender, WELCOME_MESSAGE);
  }
  const history: ChatMessage[] = [
    ...(priorMessages.length > 0
      ? priorMessages
      : [{ role: "assistant" as const, content: WELCOME_MESSAGE }]),
    { role: "user" as const, content: incomingText },
  ].slice(-MAX_MESSAGES);
  const currentIntake = stored.intake ? coerceWebsiteIntake(stored.intake) : emptyWebsiteIntake();

  try {
    const result = await runIntakeChat(history, currentIntake);
    const nextMessages = [
      ...history,
      { role: "assistant" as const, content: result.reply },
    ].slice(-MAX_MESSAGES);
    const reply = result.complete
      ? "Great, I have the business details. What is the business street address? Send the street number, street name, and suburb or town. You can also reply “skip” if the business has no public address."
      : result.reply;

    await ref.set({
      messages: nextMessages,
      intake: result.intake,
      processedMessageIds: [...stringArray(stored.processedMessageIds), messageId].slice(-MAX_PROCESSED_IDS),
      processingMessageId: "",
      phase: result.complete ? "address" : "intake",
      addressSuggestions: [],
      updatedAt: new Date().toISOString(),
      createdAt: stringValue(stored.createdAt) || new Date().toISOString(),
    }, { merge: true });
    await sendWhatsAppText(sender, reply);
  } catch (error) {
    await ref.set({ processingMessageId: "", updatedAt: new Date().toISOString() }, { merge: true });
    console.error("WhatsApp conversation failed", {
      error: error instanceof Error ? error.name : "UnknownError",
      messageId,
    });
    await sendWhatsAppText(sender, "I couldn't reply just now. Please try again in a moment.");
  }
}

async function continueAddressPhase(
  ref: FirebaseFirestore.DocumentReference,
  stored: StoredConversation,
  sender: string,
  messageId: string,
  incomingText: string,
  selectedOption: string,
): Promise<void> {
  const intake = coerceWebsiteIntake(stored.intake);
  const suggestions = addressSuggestions(stored.addressSuggestions);
  let selected: GoogleAddressSuggestion | undefined;

  const optionMatch = /^address:(\d+)$/.exec(selectedOption || incomingText.trim());
  if (optionMatch) selected = suggestions[Number(optionMatch[1])];
  if (!selected && /^\d+$/.test(incomingText.trim())) {
    selected = suggestions[Number(incomingText.trim()) - 1];
  }

  if (selected) {
    const formattedAddress = await getGoogleFormattedAddress(selected.place_id);
    await finishAddress(ref, stored, sender, messageId, {
      ...intake,
      address: formattedAddress || selected.description,
    });
    return;
  }

  if (/^(skip|no address|none|no)$/i.test(incomingText.trim())) {
    await finishAddress(ref, stored, sender, messageId, { ...intake, address: "" });
    return;
  }

  const assessment = await assessWhatsAppAddress(incomingText, intake.business_name);
  if (!assessment.sufficient || !assessment.query) {
    await saveAddressTurn(ref, stored, messageId, []);
    await sendWhatsAppText(sender, assessment.reply);
    return;
  }

  const matches = (await searchSouthAfricanAddresses(assessment.query)).slice(0, 5);
  if (matches.length === 0) {
    await saveAddressTurn(ref, stored, messageId, []);
    await sendWhatsAppText(
      sender,
      "I couldn't find that address. Please add the street number, street name, and suburb or town, then try again.",
    );
    return;
  }

  await saveAddressTurn(ref, stored, messageId, matches);
  await sendWhatsAppAddressOptions(
    sender,
    matches.map((match, index) => {
      const [title, ...rest] = match.description.split(",");
      return {
        id: `address:${index}`,
        title: title.trim() || `Address ${index + 1}`,
        description: rest.join(",").trim(),
      };
    }),
  );
}

async function saveAddressTurn(
  ref: FirebaseFirestore.DocumentReference,
  stored: StoredConversation,
  messageId: string,
  suggestions: GoogleAddressSuggestion[],
): Promise<void> {
  await ref.set({
    addressSuggestions: suggestions,
    processedMessageIds: [...stringArray(stored.processedMessageIds), messageId].slice(-MAX_PROCESSED_IDS),
    processingMessageId: "",
    updatedAt: new Date().toISOString(),
  }, { merge: true });
}

async function finishAddress(
  ref: FirebaseFirestore.DocumentReference,
  stored: StoredConversation,
  sender: string,
  messageId: string,
  intake: WebsiteIntake,
): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  await ref.set({
    intake,
    phase: "complete",
    addressSuggestions: [],
    handoffTokenHash: handoffHash(token),
    handoffExpiresAt: new Date(Date.now() + HANDOFF_TTL_MS).toISOString(),
    processedMessageIds: [...stringArray(stored.processedMessageIds), messageId].slice(-MAX_PROCESSED_IDS),
    processingMessageId: "",
    updatedAt: new Date().toISOString(),
  }, { merge: true });
  const addressLine = intake.address
    ? `Address selected: ${intake.address}`
    : "No public business address selected.";
  await sendWhatsAppText(
    sender,
    `${addressLine}\n\nEverything is ready. Open the secure builder link to generate and preview the website:\n${appOrigin()}/builder?whatsapp=${encodeURIComponent(token)}`,
  );
}

async function finishMessage(
  ref: FirebaseFirestore.DocumentReference,
  stored: StoredConversation,
  messageId: string,
): Promise<void> {
  await ref.set({
    processedMessageIds: [...stringArray(stored.processedMessageIds), messageId].slice(-MAX_PROCESSED_IDS),
    processingMessageId: "",
    updatedAt: new Date().toISOString(),
  }, { merge: true });
}

export async function readWhatsAppHandoff(token: string): Promise<{
  messages: ChatMessage[];
  intake: WebsiteIntake;
  addressResolved: boolean;
} | null> {
  if (!isFirebaseAdminConfigured() || !token || token.length > 100) return null;
  const snap = await getAdminFirestore()
    .collection("whatsappConversations")
    .where("handoffTokenHash", "==", handoffHash(token))
    .limit(1)
    .get();
  const document = snap.docs[0];
  if (!document) return null;
  const data = document.data() as StoredConversation & { handoffExpiresAt?: unknown };
  const expiresAt = Date.parse(stringValue(data.handoffExpiresAt));
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return null;
  return {
    messages: chatMessages(data.messages),
    intake: coerceWebsiteIntake(data.intake),
    addressResolved: stringValue(data.phase) === "complete",
  };
}
