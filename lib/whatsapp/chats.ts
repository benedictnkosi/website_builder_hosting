import "server-only";

import { getAdminFirestore, isFirebaseAdminConfigured } from "@/lib/firebase-admin";
import type { WhatsAppChatMessage } from "./types";
import { normalizeWhatsAppPhone } from "./payments";

const COLLECTION = "whatsapp_chats";
const MAX_CHAT_MESSAGES = 500;

export type WhatsAppChatRecord = {
  /** WhatsApp id digits */
  phone: string;
  /** Last activity ISO date */
  date: string;
  messages: WhatsAppChatMessage[];
  createdAt: string;
  updatedAt: string;
  contactName?: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Append one or more messages to the durable chat log for this WhatsApp number.
 * Every customer and AI message should go through here.
 */
export async function appendWhatsAppChatMessages(input: {
  phone: string;
  messages: WhatsAppChatMessage[];
  contactName?: string;
}): Promise<void> {
  if (!isFirebaseAdminConfigured()) return;

  const phone = normalizeWhatsAppPhone(input.phone);
  if (!phone || input.messages.length === 0) return;

  const now = nowIso();
  const ref = getAdminFirestore().collection(COLLECTION).doc(phone);
  const snap = await ref.get();

  if (!snap.exists) {
    await ref.set({
      phone,
      date: now,
      messages: input.messages.slice(-MAX_CHAT_MESSAGES),
      createdAt: now,
      updatedAt: now,
      ...(input.contactName?.trim()
        ? { contactName: input.contactName.trim() }
        : {}),
    });
    return;
  }

  const existing = snap.data() as Record<string, unknown>;
  const prior = Array.isArray(existing.messages)
    ? (existing.messages as WhatsAppChatMessage[])
    : [];
  const merged = [...prior, ...input.messages].slice(-MAX_CHAT_MESSAGES);

  await ref.set(
    {
      phone,
      date: now,
      messages: merged,
      updatedAt: now,
      ...(input.contactName?.trim()
        ? { contactName: input.contactName.trim() }
        : {}),
      createdAt:
        typeof existing.createdAt === "string" ? existing.createdAt : now,
    },
    { merge: true },
  );
}

/** Convenience: append a single turn (customer + optional assistant). */
export async function recordWhatsAppChatTurn(input: {
  phone: string;
  userText?: string;
  assistantText?: string;
  contactName?: string;
  at?: string;
}): Promise<void> {
  const at = input.at || nowIso();
  const messages: WhatsAppChatMessage[] = [];
  if (input.userText?.trim()) {
    messages.push({ role: "user", content: input.userText.trim(), at });
  }
  if (input.assistantText?.trim()) {
    messages.push({ role: "assistant", content: input.assistantText.trim(), at });
  }
  await appendWhatsAppChatMessages({
    phone: input.phone,
    messages,
    contactName: input.contactName,
  });
}

function coerceMessage(raw: unknown): WhatsAppChatMessage | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const role = row.role === "assistant" || row.role === "user" ? row.role : null;
  const content = typeof row.content === "string" ? row.content.trim() : "";
  const at = typeof row.at === "string" ? row.at : "";
  if (!role || !content || !at) return null;
  return { role, content, at };
}

function asChatRecord(
  phone: string,
  data: Record<string, unknown> | undefined,
): WhatsAppChatRecord | null {
  if (!data) return null;
  const messages = Array.isArray(data.messages)
    ? data.messages
        .map((item) => coerceMessage(item))
        .filter((item): item is WhatsAppChatMessage => item !== null)
    : [];
  const date =
    typeof data.date === "string"
      ? data.date
      : typeof data.updatedAt === "string"
        ? data.updatedAt
        : nowIso();
  return {
    phone: normalizeWhatsAppPhone(
      typeof data.phone === "string" ? data.phone : phone,
    ),
    date,
    messages,
    createdAt: typeof data.createdAt === "string" ? data.createdAt : date,
    updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : date,
    contactName:
      typeof data.contactName === "string" ? data.contactName : undefined,
  };
}

/** List every WhatsApp chat with full stored message history. */
export async function listAllWhatsAppChats(): Promise<WhatsAppChatRecord[]> {
  if (!isFirebaseAdminConfigured()) return [];

  const snap = await getAdminFirestore().collection(COLLECTION).get();
  const chats: WhatsAppChatRecord[] = [];

  for (const doc of snap.docs) {
    const chat = asChatRecord(doc.id, doc.data() as Record<string, unknown>);
    if (!chat) continue;
    chats.push(chat);
  }

  chats.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  return chats;
}

/** List WhatsApp chats with activity in the last `days` days (messages trimmed to that window). */
export async function listRecentWhatsAppChats(
  days = 7,
): Promise<WhatsAppChatRecord[]> {
  if (!isFirebaseAdminConfigured()) return [];

  const sinceMs = Date.now() - Math.max(1, days) * 24 * 60 * 60 * 1000;
  const snap = await getAdminFirestore().collection(COLLECTION).get();
  const chats: WhatsAppChatRecord[] = [];

  for (const doc of snap.docs) {
    const chat = asChatRecord(doc.id, doc.data() as Record<string, unknown>);
    if (!chat) continue;

    const recentMessages = chat.messages.filter((message) => {
      const time = Date.parse(message.at);
      return Number.isFinite(time) && time >= sinceMs;
    });

    const activityMs = Date.parse(chat.date || chat.updatedAt);
    const hasRecentActivity =
      recentMessages.length > 0 ||
      (Number.isFinite(activityMs) && activityMs >= sinceMs);

    if (!hasRecentActivity) continue;

    chats.push({
      ...chat,
      messages: recentMessages.length > 0 ? recentMessages : chat.messages.slice(-40),
    });
  }

  chats.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  return chats;
}
