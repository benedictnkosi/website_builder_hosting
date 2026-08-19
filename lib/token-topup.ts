import "server-only";

import { getAdminFirestore, isFirebaseAdminConfigured } from "@/lib/firebase-admin";
import { TOKEN_TOPUP_TOKENS, TOKEN_TOPUP_ZAR } from "@/lib/pricing";
import { isValidUid } from "@/lib/auth-server";

export type TokenTopupStatus = "pending" | "complete" | "failed";

export type TokenTopup = {
  paymentId: string;
  ownerUid: string;
  amountZar: number;
  tokens: number;
  status: TokenTopupStatus;
  mocked: boolean;
  email?: string;
  payfastPaymentId?: string;
  createdAt: string;
  updatedAt: string;
  paidAt?: string;
  processedNotifyIds?: string[];
  lastPaymentStatus?: string;
};

export type TokenPurchase = {
  paymentId: string;
  amountZar: number;
  tokens: number;
  status: TokenTopupStatus;
  mocked: boolean;
  createdAt: string;
  paidAt?: string;
};

const PURCHASE_LIMIT = 50;

const TOPUP_COLLECTION = "tokenTopups";

function isTopupStatus(value: unknown): value is TokenTopupStatus {
  return value === "pending" || value === "complete" || value === "failed";
}

function asTopup(data: Record<string, unknown> | undefined): TokenTopup | null {
  if (!data) return null;
  if (typeof data.paymentId !== "string" || !data.paymentId) return null;
  if (typeof data.ownerUid !== "string" || !isValidUid(data.ownerUid)) return null;
  if (!isTopupStatus(data.status)) return null;

  return {
    paymentId: data.paymentId,
    ownerUid: data.ownerUid,
    amountZar: typeof data.amountZar === "number" ? data.amountZar : TOKEN_TOPUP_ZAR,
    tokens: typeof data.tokens === "number" ? data.tokens : TOKEN_TOPUP_TOKENS,
    status: data.status,
    mocked: Boolean(data.mocked),
    email: typeof data.email === "string" ? data.email : undefined,
    payfastPaymentId:
      typeof data.payfastPaymentId === "string" ? data.payfastPaymentId : undefined,
    createdAt: typeof data.createdAt === "string" ? data.createdAt : new Date().toISOString(),
    updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : new Date().toISOString(),
    paidAt: typeof data.paidAt === "string" ? data.paidAt : undefined,
    processedNotifyIds: Array.isArray(data.processedNotifyIds)
      ? data.processedNotifyIds.filter((id): id is string => typeof id === "string")
      : undefined,
    lastPaymentStatus:
      typeof data.lastPaymentStatus === "string" ? data.lastPaymentStatus : undefined,
  };
}

function toFirestore(topup: TokenTopup): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(topup)) {
    if (value !== undefined) data[key] = value;
  }
  return data;
}

export async function readTokenTopup(paymentId: string): Promise<TokenTopup | null> {
  if (!paymentId || !isFirebaseAdminConfigured()) return null;
  const snap = await getAdminFirestore().collection(TOPUP_COLLECTION).doc(paymentId).get();
  if (!snap.exists) return null;
  return asTopup(snap.data() as Record<string, unknown>);
}

export function toTokenPurchase(topup: TokenTopup): TokenPurchase {
  return {
    paymentId: topup.paymentId,
    amountZar: topup.amountZar,
    tokens: topup.tokens,
    status: topup.status,
    mocked: topup.mocked,
    createdAt: topup.createdAt,
    paidAt: topup.paidAt,
  };
}

function purchaseTime(purchase: TokenPurchase): number {
  return Date.parse(purchase.paidAt || purchase.createdAt) || 0;
}

export async function listTokenTopupsForUser(uid: string): Promise<TokenPurchase[]> {
  if (!uid || !isValidUid(uid) || !isFirebaseAdminConfigured()) return [];

  const snap = await getAdminFirestore()
    .collection(TOPUP_COLLECTION)
    .where("ownerUid", "==", uid)
    .get();

  return snap.docs
    .map((doc) => asTopup(doc.data() as Record<string, unknown>))
    .filter((topup): topup is TokenTopup => Boolean(topup))
    .map(toTokenPurchase)
    .sort((a, b) => purchaseTime(b) - purchaseTime(a))
    .slice(0, PURCHASE_LIMIT);
}

export async function writeTokenTopup(topup: TokenTopup): Promise<void> {
  if (!isFirebaseAdminConfigured()) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "Firebase Admin is required to save token top-ups. Paste the service account JSON into FIREBASE_SERVICE_ACCOUNT.",
      );
    }
    return;
  }

  await getAdminFirestore()
    .collection(TOPUP_COLLECTION)
    .doc(topup.paymentId)
    .set(toFirestore(topup), { merge: true });
}
