import "server-only";

import { getAdminFirestore, isFirebaseAdminConfigured } from "@/lib/firebase-admin";
import type { WhatsAppChatMessage, WhatsAppLead } from "./types";
import { MANAGED_WEBSITE_OFFER } from "./config";

export type WhatsAppPaymentStatus = "pending" | "complete" | "failed";

export type WhatsAppPayment = {
  paymentId: string;
  /** WhatsApp id digits, e.g. 2783… */
  phone: string;
  amountZar: number;
  /** ISO timestamp of successful payment (or createdAt while pending). */
  date: string;
  summary: string;
  status: WhatsAppPaymentStatus;
  payfastPaymentId?: string;
  contactName?: string;
  email?: string;
  businessName?: string;
  industry?: string;
  createdAt: string;
  updatedAt: string;
  paidAt?: string;
  processedNotifyIds?: string[];
  lastPaymentStatus?: string;
};

const COLLECTION = "whatsapp_payments";

function nowIso(): string {
  return new Date().toISOString();
}

export function normalizeWhatsAppPhone(value: string): string {
  return value.replace(/\D/g, "");
}

/** Build a short need-summary from the WhatsApp lead for payment records. */
export function buildClientNeedSummary(lead: WhatsAppLead | null): string {
  if (!lead) {
    return `R${MANAGED_WEBSITE_OFFER.depositZar} deposit for R${MANAGED_WEBSITE_OFFER.priceZar}/year managed website (WhatsApp enquiry).`;
  }

  const parts: string[] = [];
  const f = lead.fields;
  if (f.businessName.trim()) parts.push(`Business: ${f.businessName.trim()}`);
  if (f.industry.trim()) parts.push(`Needs website for: ${f.industry.trim()}`);
  if (f.name.trim() || lead.contactName.trim()) {
    parts.push(`Contact: ${(f.name || lead.contactName).trim()}`);
  }
  if (f.notes.trim()) parts.push(f.notes.trim());

  const recentUser = lead.messages
    .filter((m) => m.role === "user")
    .slice(-4)
    .map((m) => m.content.trim())
    .filter(Boolean);
  if (recentUser.length) {
    parts.push(`Customer messages: ${recentUser.join(" | ")}`);
  }

  const summary = parts.join(". ").trim();
  return (
    summary.slice(0, 2000) ||
    `R${MANAGED_WEBSITE_OFFER.depositZar} deposit for R${MANAGED_WEBSITE_OFFER.priceZar}/year managed website.`
  );
}

function asPayment(data: Record<string, unknown> | undefined): WhatsAppPayment | null {
  if (!data) return null;
  if (typeof data.paymentId !== "string" || !data.paymentId) return null;
  if (typeof data.phone !== "string" || !data.phone) return null;
  const status = data.status;
  if (status !== "pending" && status !== "complete" && status !== "failed") return null;

  return {
    paymentId: data.paymentId,
    phone: normalizeWhatsAppPhone(data.phone),
    amountZar:
      typeof data.amountZar === "number" && Number.isFinite(data.amountZar)
        ? data.amountZar
        : MANAGED_WEBSITE_OFFER.depositZar,
    date: typeof data.date === "string" ? data.date : nowIso(),
    summary: typeof data.summary === "string" ? data.summary : "",
    status,
    payfastPaymentId:
      typeof data.payfastPaymentId === "string" ? data.payfastPaymentId : undefined,
    contactName: typeof data.contactName === "string" ? data.contactName : undefined,
    email: typeof data.email === "string" ? data.email : undefined,
    businessName: typeof data.businessName === "string" ? data.businessName : undefined,
    industry: typeof data.industry === "string" ? data.industry : undefined,
    createdAt: typeof data.createdAt === "string" ? data.createdAt : nowIso(),
    updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : nowIso(),
    paidAt: typeof data.paidAt === "string" ? data.paidAt : undefined,
    processedNotifyIds: Array.isArray(data.processedNotifyIds)
      ? data.processedNotifyIds.filter((id): id is string => typeof id === "string")
      : undefined,
    lastPaymentStatus:
      typeof data.lastPaymentStatus === "string" ? data.lastPaymentStatus : undefined,
  };
}

function toFirestore(payment: WhatsAppPayment): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payment)) {
    if (value !== undefined) data[key] = value;
  }
  return data;
}

export async function readWhatsAppPayment(
  paymentId: string,
): Promise<WhatsAppPayment | null> {
  if (!paymentId || !isFirebaseAdminConfigured()) return null;
  const snap = await getAdminFirestore().collection(COLLECTION).doc(paymentId).get();
  if (!snap.exists) return null;
  return asPayment(snap.data() as Record<string, unknown>);
}

export async function writeWhatsAppPayment(payment: WhatsAppPayment): Promise<void> {
  if (!isFirebaseAdminConfigured()) {
    throw new Error("Firebase Admin is not configured.");
  }
  await getAdminFirestore()
    .collection(COLLECTION)
    .doc(payment.paymentId)
    .set(toFirestore(payment), { merge: true });
}

export async function createPendingWhatsAppPayment(input: {
  paymentId: string;
  phone: string;
  amountZar: number;
  summary: string;
  contactName?: string;
  email?: string;
  businessName?: string;
  industry?: string;
}): Promise<WhatsAppPayment> {
  const now = nowIso();
  const payment: WhatsAppPayment = {
    paymentId: input.paymentId,
    phone: normalizeWhatsAppPhone(input.phone),
    amountZar: input.amountZar,
    date: now,
    summary: input.summary.slice(0, 2000),
    status: "pending",
    contactName: input.contactName,
    email: input.email,
    businessName: input.businessName,
    industry: input.industry,
    createdAt: now,
    updatedAt: now,
  };
  await writeWhatsAppPayment(payment);
  return payment;
}

export async function findLatestLeadSummaryForPhone(phone: string): Promise<{
  summary: string;
  contactName?: string;
  email?: string;
  businessName?: string;
  industry?: string;
}> {
  const waId = normalizeWhatsAppPhone(phone);
  if (!waId || !isFirebaseAdminConfigured()) {
    return { summary: buildClientNeedSummary(null) };
  }

  const snap = await getAdminFirestore().collection("whatsapp_leads").doc(waId).get();
  if (!snap.exists) {
    return { summary: buildClientNeedSummary(null) };
  }

  const data = snap.data() as Record<string, unknown>;
  const fields =
    data.fields && typeof data.fields === "object"
      ? (data.fields as Record<string, unknown>)
      : {};

  const lead = {
    waId,
    contactName: typeof data.contactName === "string" ? data.contactName : "",
    status: "qualifying" as const,
    fields: {
      name: typeof fields.name === "string" ? fields.name : "",
      businessName: typeof fields.businessName === "string" ? fields.businessName : "",
      email: typeof fields.email === "string" ? fields.email : "",
      phone: typeof fields.phone === "string" ? fields.phone : waId,
      industry: typeof fields.industry === "string" ? fields.industry : "",
      notes: typeof fields.notes === "string" ? fields.notes : "",
      interested: null,
    },
    messages: Array.isArray(data.messages)
      ? (data.messages as WhatsAppChatMessage[])
      : [],
    processedMessageIds: [],
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  return {
    summary: buildClientNeedSummary(lead),
    contactName: lead.fields.name || lead.contactName || undefined,
    email: lead.fields.email || undefined,
    businessName: lead.fields.businessName || undefined,
    industry: lead.fields.industry || undefined,
  };
}

/** List WhatsApp deposit payments, newest first. Defaults to completed only. */
export async function listWhatsAppPayments(input?: {
  status?: WhatsAppPaymentStatus | "all";
  days?: number;
}): Promise<WhatsAppPayment[]> {
  if (!isFirebaseAdminConfigured()) return [];

  const status = input?.status ?? "complete";
  const days = input?.days;
  const sinceMs =
    typeof days === "number" && days > 0
      ? Date.now() - days * 24 * 60 * 60 * 1000
      : null;

  const snap = await getAdminFirestore().collection(COLLECTION).get();
  const payments: WhatsAppPayment[] = [];

  for (const doc of snap.docs) {
    const payment = asPayment(doc.data() as Record<string, unknown>);
    if (!payment) continue;
    if (status !== "all" && payment.status !== status) continue;

    const stamp = payment.paidAt || payment.date || payment.createdAt;
    const time = Date.parse(stamp);
    if (sinceMs != null && (!Number.isFinite(time) || time < sinceMs)) continue;

    payments.push(payment);
  }

  payments.sort((a, b) => {
    const aTime = Date.parse(a.paidAt || a.date || a.createdAt);
    const bTime = Date.parse(b.paidAt || b.date || b.createdAt);
    return bTime - aTime;
  });

  return payments;
}
