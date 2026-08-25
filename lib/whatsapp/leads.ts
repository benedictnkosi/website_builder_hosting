import "server-only";

import { getAdminFirestore, isFirebaseAdminConfigured } from "@/lib/firebase-admin";
import type {
  WhatsAppChatMessage,
  WhatsAppLead,
  WhatsAppLeadFields,
  WhatsAppLeadStatus,
} from "./types";

const COLLECTION = "whatsapp_leads";
const MAX_STORED_MESSAGES = 40;
const MAX_PROCESSED_IDS = 80;

const emptyFields = (): WhatsAppLeadFields => ({
  name: "",
  businessName: "",
  email: "",
  phone: "",
  industry: "",
  notes: "",
  interested: null,
});

function nowIso(): string {
  return new Date().toISOString();
}

function coerceFields(raw: unknown): WhatsAppLeadFields {
  const data = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const interested =
    data.interested === true ? true : data.interested === false ? false : null;
  return {
    name: typeof data.name === "string" ? data.name : "",
    businessName: typeof data.businessName === "string" ? data.businessName : "",
    email: typeof data.email === "string" ? data.email : "",
    phone: typeof data.phone === "string" ? data.phone : "",
    industry: typeof data.industry === "string" ? data.industry : "",
    notes: typeof data.notes === "string" ? data.notes : "",
    interested,
  };
}

function coerceMessages(raw: unknown): WhatsAppChatMessage[] {
  if (!Array.isArray(raw)) return [];
  const out: WhatsAppChatMessage[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const role = row.role === "assistant" || row.role === "user" ? row.role : null;
    const content = typeof row.content === "string" ? row.content.trim() : "";
    const at = typeof row.at === "string" ? row.at : nowIso();
    if (!role || !content) continue;
    out.push({ role, content, at });
  }
  return out.slice(-MAX_STORED_MESSAGES);
}

function coerceStatus(raw: unknown): WhatsAppLeadStatus {
  switch (raw) {
    case "qualifying":
    case "hot":
    case "handed_off":
    case "closed":
      return raw;
    default:
      return "new";
  }
}

function fromSnap(waId: string, data: Record<string, unknown> | undefined): WhatsAppLead {
  const createdAt = typeof data?.createdAt === "string" ? data.createdAt : nowIso();
  return {
    waId,
    contactName: typeof data?.contactName === "string" ? data.contactName : "",
    status: coerceStatus(data?.status),
    fields: coerceFields(data?.fields),
    messages: coerceMessages(data?.messages),
    processedMessageIds: Array.isArray(data?.processedMessageIds)
      ? data.processedMessageIds.filter((id: unknown): id is string => typeof id === "string")
      : [],
    notifiedAt: typeof data?.notifiedAt === "string" ? data.notifiedAt : undefined,
    createdAt,
    updatedAt: typeof data?.updatedAt === "string" ? data.updatedAt : createdAt,
  };
}

export async function getOrCreateWhatsAppLead(input: {
  waId: string;
  contactName?: string;
}): Promise<WhatsAppLead> {
  if (!isFirebaseAdminConfigured()) {
    // Ephemeral fallback when Admin SDK is missing (local without credentials).
    return {
      waId: input.waId,
      contactName: input.contactName?.trim() || "",
      status: "new",
      fields: emptyFields(),
      messages: [],
      processedMessageIds: [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
  }

  const ref = getAdminFirestore().collection(COLLECTION).doc(input.waId);
  const snap = await ref.get();
  if (snap.exists) {
    const lead = fromSnap(input.waId, snap.data() as Record<string, unknown> | undefined);
    if (input.contactName?.trim() && !lead.contactName) {
      lead.contactName = input.contactName.trim();
    }
    return lead;
  }

  const lead: WhatsAppLead = {
    waId: input.waId,
    contactName: input.contactName?.trim() || "",
    status: "new",
    fields: emptyFields(),
    messages: [],
    processedMessageIds: [],
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  await ref.set(lead);
  return lead;
}

export function hasProcessedMessage(lead: WhatsAppLead, messageId: string): boolean {
  return lead.processedMessageIds.includes(messageId);
}

export async function saveWhatsAppLead(lead: WhatsAppLead): Promise<void> {
  if (!isFirebaseAdminConfigured()) return;

  const trimmed: WhatsAppLead = {
    ...lead,
    messages: lead.messages.slice(-MAX_STORED_MESSAGES),
    processedMessageIds: lead.processedMessageIds.slice(-MAX_PROCESSED_IDS),
    updatedAt: nowIso(),
  };

  await getAdminFirestore().collection(COLLECTION).doc(lead.waId).set(trimmed, { merge: true });
}
