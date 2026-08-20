import "server-only";

import { getAdminFirestore, isFirebaseAdminConfigured } from "@/lib/firebase-admin";
import {
  EDIT_TOPUP_PACKAGES,
  EDIT_TOPUP_ZAR,
  isEditTopupPackageId,
  type EditTopupPackageId,
} from "@/lib/pricing";
import { isValidUid } from "@/lib/auth-server";

export type EditTopupStatus = "pending" | "complete" | "failed";

export type EditTopup = {
  paymentId: string;
  ownerUid: string;
  packageId?: EditTopupPackageId;
  amountZar: number;
  edits: number;
  status: EditTopupStatus;
  mocked: boolean;
  email?: string;
  payfastPaymentId?: string;
  createdAt: string;
  updatedAt: string;
  paidAt?: string;
  processedNotifyIds?: string[];
  lastPaymentStatus?: string;
};

export type EditPurchase = {
  paymentId: string;
  amountZar: number;
  edits: number;
  status: EditTopupStatus;
  mocked: boolean;
  createdAt: string;
  paidAt?: string;
};

const PURCHASE_LIMIT = 5;
const TOPUP_COLLECTION = "editTopups";
const LEGACY_TOPUP_COLLECTION = "tokenTopups";

function isTopupStatus(value: unknown): value is EditTopupStatus {
  return value === "pending" || value === "complete" || value === "failed";
}

function editsFromRecord(data: Record<string, unknown>): number {
  if (typeof data.edits === "number" && Number.isFinite(data.edits)) {
    return Math.max(0, Math.round(data.edits));
  }
  const amountZar = typeof data.amountZar === "number" ? data.amountZar : 0;
  const pack = EDIT_TOPUP_PACKAGES.find((item) => item.amountZar === amountZar);
  return pack?.edits ?? (amountZar > 0 ? 1 : EDIT_TOPUP_PACKAGES[0].edits);
}

function asTopup(data: Record<string, unknown> | undefined): EditTopup | null {
  if (!data) return null;
  if (typeof data.paymentId !== "string" || !data.paymentId) return null;
  if (typeof data.ownerUid !== "string" || !isValidUid(data.ownerUid)) return null;
  if (!isTopupStatus(data.status)) return null;

  return {
    paymentId: data.paymentId,
    ownerUid: data.ownerUid,
    packageId: isEditTopupPackageId(data.packageId) ? data.packageId : undefined,
    amountZar: typeof data.amountZar === "number" ? data.amountZar : EDIT_TOPUP_ZAR,
    edits: editsFromRecord(data),
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

function toFirestore(topup: EditTopup): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(topup)) {
    if (value !== undefined) data[key] = value;
  }
  return data;
}

async function readTopupFromCollection(
  collection: string,
  paymentId: string,
): Promise<EditTopup | null> {
  if (!paymentId || !isFirebaseAdminConfigured()) return null;
  const snap = await getAdminFirestore().collection(collection).doc(paymentId).get();
  if (!snap.exists) return null;
  return asTopup(snap.data() as Record<string, unknown>);
}

export async function readEditTopup(paymentId: string): Promise<EditTopup | null> {
  return (
    (await readTopupFromCollection(TOPUP_COLLECTION, paymentId)) ??
    (await readTopupFromCollection(LEGACY_TOPUP_COLLECTION, paymentId))
  );
}

export function toEditPurchase(topup: EditTopup): EditPurchase {
  return {
    paymentId: topup.paymentId,
    amountZar: topup.amountZar,
    edits: topup.edits,
    status: topup.status,
    mocked: topup.mocked,
    createdAt: topup.createdAt,
    paidAt: topup.paidAt,
  };
}

function purchaseTime(purchase: EditPurchase): number {
  return Date.parse(purchase.paidAt || purchase.createdAt) || 0;
}

async function listTopupsFromCollection(
  collection: string,
  uid: string,
): Promise<EditPurchase[]> {
  const snap = await getAdminFirestore().collection(collection).where("ownerUid", "==", uid).get();
  return snap.docs
    .map((doc) => asTopup(doc.data() as Record<string, unknown>))
    .filter((topup): topup is EditTopup => Boolean(topup))
    .map(toEditPurchase);
}

export async function listEditTopupsForUser(uid: string): Promise<EditPurchase[]> {
  if (!uid || !isValidUid(uid) || !isFirebaseAdminConfigured()) return [];

  const [current, legacy] = await Promise.all([
    listTopupsFromCollection(TOPUP_COLLECTION, uid),
    listTopupsFromCollection(LEGACY_TOPUP_COLLECTION, uid),
  ]);

  const seen = new Set<string>();
  return [...current, ...legacy]
    .filter((purchase) => {
      if (seen.has(purchase.paymentId)) return false;
      seen.add(purchase.paymentId);
      return true;
    })
    .sort((a, b) => purchaseTime(b) - purchaseTime(a))
    .slice(0, PURCHASE_LIMIT);
}

export async function writeEditTopup(topup: EditTopup): Promise<void> {
  if (!isFirebaseAdminConfigured()) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "Firebase Admin is required to save edit top-ups. Paste the service account JSON into FIREBASE_SERVICE_ACCOUNT.",
      );
    }
    return;
  }

  await getAdminFirestore()
    .collection(TOPUP_COLLECTION)
    .doc(topup.paymentId)
    .set(toFirestore(topup), { merge: true });
}
