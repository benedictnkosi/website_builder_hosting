import "server-only";

import { createHash, createHmac, randomBytes } from "node:crypto";
import { getAdminFirestore, isFirebaseAdminConfigured } from "@/lib/firebase-admin";
import { coerceWebsiteIntake, emptyWebsiteIntake, type ChatMessage, type WebsiteIntake } from "@/lib/intake";
import { runIntakeChat } from "@/lib/intake-chat";
import { sendWhatsAppText } from "@/lib/whatsapp-cloud";
import type { WhatsAppMessage } from "@/lib/whatsapp-webhook";

const WELCOME_MESSAGE =
  "Hi! I'm here to help build your website. Tell me about your business and I'll guide you one question at a time.";
const MAX_MESSAGES = 30;
const MAX_PROCESSED_IDS = 200;
const HANDOFF_TTL_MS = 24 * 60 * 60 * 1000;

type StoredConversation = {
  messages?: unknown;
  intake?: unknown;
  processedMessageIds?: unknown;
  processingMessageId?: unknown;
};

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function messageText(message: WhatsAppMessage): string {
  const text = message.text;
  if (!text || typeof text !== "object") return "";
  return stringValue((text as Record<string, unknown>).body);
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
  if (!incomingText) {
    await sendWhatsAppText(
      sender,
      "I can currently continue the website chat from text messages. Please type your business details, or open the builder to upload a flyer: https://lulaweb.co.za/builder",
    );
    await finishMessage(ref, stored, messageId);
    return;
  }

  const priorMessages = chatMessages(stored.messages);
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
    let reply = result.reply;
    let handoffTokenHash = "";
    let handoffExpiresAt = "";

    if (result.complete) {
      const token = randomBytes(32).toString("base64url");
      handoffTokenHash = handoffHash(token);
      handoffExpiresAt = new Date(Date.now() + HANDOFF_TTL_MS).toISOString();
      reply = `${reply}\n\nContinue securely in the builder to choose your address and generate the website:\n${appOrigin()}/builder?whatsapp=${encodeURIComponent(token)}`;
    }

    await ref.set({
      messages: nextMessages,
      intake: result.intake,
      processedMessageIds: [...stringArray(stored.processedMessageIds), messageId].slice(-MAX_PROCESSED_IDS),
      processingMessageId: "",
      handoffTokenHash,
      handoffExpiresAt,
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
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
  };
}
