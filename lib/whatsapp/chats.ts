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
  /** When true, the sales bot must not auto-reply. */
  humanTakeover?: boolean;
  humanTakeoverAt?: string;
  /** Admin-marked high buying intent. */
  highIntent?: boolean;
  highIntentAt?: string;
  /** When an admin last opened this chat in the dashboard. */
  adminReadAt?: string;
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
  source?: "ai" | "human";
}): Promise<void> {
  const at = input.at || nowIso();
  const messages: WhatsAppChatMessage[] = [];
  if (input.userText?.trim()) {
    messages.push({ role: "user", content: input.userText.trim(), at });
  }
  if (input.assistantText?.trim()) {
    messages.push({
      role: "assistant",
      content: input.assistantText.trim(),
      at,
      ...(input.source ? { source: input.source } : {}),
    });
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
  const source = row.source === "human" || row.source === "ai" ? row.source : undefined;
  return { role, content, at, ...(source ? { source } : {}) };
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
    humanTakeover: data.humanTakeover === true,
    humanTakeoverAt:
      typeof data.humanTakeoverAt === "string" ? data.humanTakeoverAt : undefined,
    highIntent: data.highIntent === true,
    highIntentAt:
      typeof data.highIntentAt === "string" ? data.highIntentAt : undefined,
    adminReadAt:
      typeof data.adminReadAt === "string" ? data.adminReadAt : undefined,
  };
}

export function whatsappChatHasUnread(chat: {
  messages: WhatsAppChatMessage[];
  adminReadAt?: string;
}): boolean {
  const readMs = chat.adminReadAt ? Date.parse(chat.adminReadAt) : NaN;
  const readThreshold = Number.isFinite(readMs) ? readMs : 0;
  return chat.messages.some((message) => {
    if (message.role !== "user") return false;
    const at = Date.parse(message.at);
    return Number.isFinite(at) && at > readThreshold;
  });
}

export async function getWhatsAppChat(
  phone: string,
): Promise<WhatsAppChatRecord | null> {
  if (!isFirebaseAdminConfigured()) return null;
  const id = normalizeWhatsAppPhone(phone);
  if (!id) return null;
  const snap = await getAdminFirestore().collection(COLLECTION).doc(id).get();
  if (!snap.exists) return null;
  return asChatRecord(id, snap.data() as Record<string, unknown>);
}

export async function isWhatsAppHumanTakeover(phone: string): Promise<boolean> {
  const chat = await getWhatsAppChat(phone);
  return Boolean(chat?.humanTakeover);
}

export async function setWhatsAppHumanTakeover(input: {
  phone: string;
  humanTakeover: boolean;
}): Promise<WhatsAppChatRecord | null> {
  if (!isFirebaseAdminConfigured()) return null;

  const phone = normalizeWhatsAppPhone(input.phone);
  if (!phone) return null;

  const now = nowIso();
  const ref = getAdminFirestore().collection(COLLECTION).doc(phone);
  const snap = await ref.get();
  const existing = snap.exists
    ? (snap.data() as Record<string, unknown>)
    : undefined;

  await ref.set(
    {
      phone,
      humanTakeover: input.humanTakeover,
      ...(input.humanTakeover
        ? { humanTakeoverAt: now }
        : { humanTakeoverAt: null }),
      updatedAt: now,
      date: typeof existing?.date === "string" ? existing.date : now,
      messages: Array.isArray(existing?.messages) ? existing.messages : [],
      createdAt:
        typeof existing?.createdAt === "string" ? existing.createdAt : now,
      ...(typeof existing?.contactName === "string"
        ? { contactName: existing.contactName }
        : {}),
    },
    { merge: true },
  );

  return getWhatsAppChat(phone);
}

export async function setWhatsAppHighIntent(input: {
  phone: string;
  highIntent: boolean;
}): Promise<WhatsAppChatRecord | null> {
  if (!isFirebaseAdminConfigured()) return null;

  const phone = normalizeWhatsAppPhone(input.phone);
  if (!phone) return null;

  const now = nowIso();
  const ref = getAdminFirestore().collection(COLLECTION).doc(phone);
  const snap = await ref.get();
  const existing = snap.exists
    ? (snap.data() as Record<string, unknown>)
    : undefined;

  await ref.set(
    {
      phone,
      highIntent: input.highIntent,
      ...(input.highIntent
        ? { highIntentAt: now }
        : { highIntentAt: null }),
      updatedAt: now,
      date: typeof existing?.date === "string" ? existing.date : now,
      messages: Array.isArray(existing?.messages) ? existing.messages : [],
      createdAt:
        typeof existing?.createdAt === "string" ? existing.createdAt : now,
      ...(typeof existing?.contactName === "string"
        ? { contactName: existing.contactName }
        : {}),
    },
    { merge: true },
  );

  return getWhatsAppChat(phone);
}

export async function markWhatsAppChatRead(
  phone: string,
): Promise<WhatsAppChatRecord | null> {
  if (!isFirebaseAdminConfigured()) return null;

  const id = normalizeWhatsAppPhone(phone);
  if (!id) return null;

  const now = nowIso();
  const ref = getAdminFirestore().collection(COLLECTION).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return null;

  await ref.set(
    {
      adminReadAt: now,
      updatedAt: now,
    },
    { merge: true },
  );

  return getWhatsAppChat(id);
}

export async function deleteWhatsAppChat(phone: string): Promise<boolean> {
  if (!isFirebaseAdminConfigured()) return false;

  const id = normalizeWhatsAppPhone(phone);
  if (!id) return false;

  await getAdminFirestore().collection(COLLECTION).doc(id).delete();
  return true;
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
