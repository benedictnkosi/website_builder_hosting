import "server-only";

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { getAdminFirestore, isFirebaseAdminConfigured } from "@/lib/firebase-admin";
import { getWebsiteDirectory } from "@/lib/file-manager";
import { isBillingFrequency, type BillingFrequency } from "@/lib/pricing";
import { isValidWebsiteId } from "@/lib/validation";

export type SubscriptionStatus = "pending" | "active" | "cancelled";

export type WebsiteSubscription = {
  websiteId: string;
  ownerUid?: string;
  paymentId: string;
  domain: string;
  sld: string;
  tld: string;
  status: SubscriptionStatus;
  amountZar: number;
  domainPriceZar: number;
  websiteFeeZar: number;
  currency: string;
  frequency: BillingFrequency;
  mocked: boolean;
  email?: string;
  payfastPaymentId?: string;
  token?: string;
  createdAt: string;
  updatedAt: string;
  processedNotifyIds?: string[];
  lastPaymentStatus?: string;
  paidAt?: string;
};

const SUBSCRIPTION_FILE = ".subscription.json";
const SUBSCRIPTION_COLLECTION = "subscriptions";

function subscriptionPath(websiteId: string): string {
  return path.join(getWebsiteDirectory(websiteId), SUBSCRIPTION_FILE);
}

export function createPaymentId(): string {
  return randomBytes(8).toString("hex");
}

function isSubscriptionStatus(value: unknown): value is SubscriptionStatus {
  return value === "pending" || value === "active" || value === "cancelled";
}

function asSubscription(
  websiteId: string,
  data: Record<string, unknown> | undefined,
): WebsiteSubscription | null {
  if (!data || data.websiteId !== websiteId) return null;
  if (typeof data.paymentId !== "string" || !data.paymentId) return null;
  if (typeof data.domain !== "string" || !isSubscriptionStatus(data.status)) {
    return null;
  }

  return {
    websiteId,
    ownerUid: typeof data.ownerUid === "string" ? data.ownerUid : undefined,
    paymentId: data.paymentId,
    domain: data.domain,
    sld: typeof data.sld === "string" ? data.sld : "",
    tld: typeof data.tld === "string" ? data.tld : "",
    status: data.status,
    amountZar: typeof data.amountZar === "number" ? data.amountZar : 0,
    domainPriceZar: typeof data.domainPriceZar === "number" ? data.domainPriceZar : 0,
    websiteFeeZar: typeof data.websiteFeeZar === "number" ? data.websiteFeeZar : 0,
    currency: typeof data.currency === "string" ? data.currency : "ZAR",
    frequency: isBillingFrequency(data.frequency) ? data.frequency : "monthly",
    mocked: Boolean(data.mocked),
    email: typeof data.email === "string" ? data.email : undefined,
    payfastPaymentId:
      typeof data.payfastPaymentId === "string" ? data.payfastPaymentId : undefined,
    token: typeof data.token === "string" ? data.token : undefined,
    createdAt: typeof data.createdAt === "string" ? data.createdAt : new Date().toISOString(),
    updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : new Date().toISOString(),
    processedNotifyIds: Array.isArray(data.processedNotifyIds)
      ? data.processedNotifyIds.filter((id): id is string => typeof id === "string")
      : undefined,
    lastPaymentStatus:
      typeof data.lastPaymentStatus === "string" ? data.lastPaymentStatus : undefined,
    paidAt: typeof data.paidAt === "string" ? data.paidAt : undefined,
  };
}

function toFirestore(subscription: WebsiteSubscription): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(subscription)) {
    if (value !== undefined) data[key] = value;
  }
  return data;
}

async function readDiskSubscription(
  websiteId: string,
): Promise<WebsiteSubscription | null> {
  try {
    const raw = await readFile(subscriptionPath(websiteId), "utf8");
    const data = JSON.parse(raw) as Record<string, unknown>;
    return asSubscription(websiteId, data);
  } catch {
    return null;
  }
}

async function writeDiskSubscription(subscription: WebsiteSubscription): Promise<void> {
  const websiteDir = getWebsiteDirectory(subscription.websiteId);
  await mkdir(websiteDir, { recursive: true });
  await writeFile(
    subscriptionPath(subscription.websiteId),
    `${JSON.stringify(subscription, null, 2)}\n`,
    "utf8",
  );
}

async function readFirestoreSubscription(
  websiteId: string,
): Promise<WebsiteSubscription | null> {
  if (!isFirebaseAdminConfigured()) return null;
  const snap = await getAdminFirestore()
    .collection(SUBSCRIPTION_COLLECTION)
    .doc(websiteId)
    .get();
  if (!snap.exists) return null;
  return asSubscription(websiteId, snap.data() as Record<string, unknown>);
}

async function syncSubscriptionToSiteRecords(
  subscription: WebsiteSubscription,
): Promise<void> {
  const db = getAdminFirestore();
  const siteRef = db.collection("sites").doc(subscription.websiteId);
  const siteSnap = await siteRef.get();
  if (!siteSnap.exists) return;

  const payload = {
    subscription: toFirestore(subscription),
    updatedAt: subscription.updatedAt,
  };
  await siteRef.set(payload, { merge: true });

  const ownerUid = siteSnap.get("ownerUid");
  if (typeof ownerUid !== "string" || !ownerUid) return;

  await db
    .collection("users")
    .doc(ownerUid)
    .collection("sites")
    .doc(subscription.websiteId)
    .set(payload, { merge: true });
}

async function writeFirestoreSubscription(
  subscription: WebsiteSubscription,
): Promise<void> {
  if (!isFirebaseAdminConfigured()) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "Firebase Admin is required to save billing state. Paste the service account JSON into FIREBASE_SERVICE_ACCOUNT.",
      );
    }
    return;
  }

  await getAdminFirestore()
    .collection(SUBSCRIPTION_COLLECTION)
    .doc(subscription.websiteId)
    .set(toFirestore(subscription), { merge: true });
  await syncSubscriptionToSiteRecords(subscription);
}

export async function readSubscription(
  websiteId: string,
): Promise<WebsiteSubscription | null> {
  if (!isValidWebsiteId(websiteId)) {
    return null;
  }

  const stored = await readFirestoreSubscription(websiteId);
  if (stored) return stored;

  const disk = await readDiskSubscription(websiteId);
  if (disk) {
    await writeFirestoreSubscription(disk).catch((error) => {
      console.warn("Could not migrate subscription into Firestore:", error);
    });
  }
  return disk;
}

export async function writeSubscription(
  subscription: WebsiteSubscription,
): Promise<void> {
  if (!isValidWebsiteId(subscription.websiteId)) {
    throw new Error("A valid websiteId is required.");
  }

  await writeFirestoreSubscription(subscription);

  try {
    await writeDiskSubscription(subscription);
  } catch (error) {
    if (!isFirebaseAdminConfigured()) throw error;
    console.warn("Local subscription cache write failed:", error);
  }
}

export async function deleteSubscription(websiteId: string): Promise<void> {
  if (!isValidWebsiteId(websiteId)) return;

  if (isFirebaseAdminConfigured()) {
    await getAdminFirestore()
      .collection(SUBSCRIPTION_COLLECTION)
      .doc(websiteId)
      .delete()
      .catch(() => undefined);
  }

  await rm(subscriptionPath(websiteId), { force: true }).catch(() => undefined);
}

export async function hasActiveSubscription(websiteId: string): Promise<boolean> {
  const subscription = await readSubscription(websiteId);
  return subscription?.status === "active";
}

export async function requireActiveSubscription(
  websiteId: string,
): Promise<WebsiteSubscription> {
  const subscription = await readSubscription(websiteId);
  if (!subscription || subscription.status !== "active") {
    throw new Error("An active subscription is required to continue.");
  }
  return subscription;
}

export type AdminPaidSite = {
  websiteId: string;
  businessName: string;
  ownerUid: string;
  ownerEmail?: string;
  contactEmail?: string;
  domain: string;
  sld: string;
  tld: string;
  status: "active";
  amountZar: number;
  domainPriceZar: number;
  websiteFeeZar: number;
  currency: string;
  frequency: BillingFrequency;
  mocked: boolean;
  billingEmail?: string;
  paymentId: string;
  payfastPaymentId?: string;
  paidAt?: string;
  createdAt: string;
  updatedAt: string;
  siteCreatedAt?: string;
  siteUpdatedAt?: string;
  seoOptimizedAt?: string;
};

export async function listActivePaidSites(): Promise<AdminPaidSite[]> {
  if (!isFirebaseAdminConfigured()) {
    throw new Error(
      "Firebase Admin is required to list paid sites. Configure FIREBASE_SERVICE_ACCOUNT.",
    );
  }

  const db = getAdminFirestore();
  const snap = await db
    .collection(SUBSCRIPTION_COLLECTION)
    .where("status", "==", "active")
    .get();

  const rows: AdminPaidSite[] = [];

  for (const doc of snap.docs) {
    const subscription = asSubscription(
      doc.id,
      doc.data() as Record<string, unknown>,
    );
    if (!subscription || subscription.status !== "active") continue;

    const siteSnap = await db.collection("sites").doc(subscription.websiteId).get();
    const site = siteSnap.exists
      ? (siteSnap.data() as Record<string, unknown>)
      : null;

    const ownerUid =
      subscription.ownerUid ||
      (typeof site?.ownerUid === "string" ? site.ownerUid : "") ||
      "";

    rows.push({
      websiteId: subscription.websiteId,
      businessName:
        typeof site?.businessName === "string" && site.businessName.trim()
          ? site.businessName.trim()
          : "Untitled site",
      ownerUid,
      ownerEmail:
        typeof site?.ownerEmail === "string" && site.ownerEmail.trim()
          ? site.ownerEmail.trim()
          : undefined,
      contactEmail:
        typeof site?.contactEmail === "string" && site.contactEmail.trim()
          ? site.contactEmail.trim()
          : undefined,
      domain: subscription.domain,
      sld: subscription.sld,
      tld: subscription.tld,
      status: "active",
      amountZar: subscription.amountZar,
      domainPriceZar: subscription.domainPriceZar,
      websiteFeeZar: subscription.websiteFeeZar,
      currency: subscription.currency,
      frequency: subscription.frequency,
      mocked: subscription.mocked,
      billingEmail: subscription.email,
      paymentId: subscription.paymentId,
      payfastPaymentId: subscription.payfastPaymentId,
      paidAt: subscription.paidAt,
      createdAt: subscription.createdAt,
      updatedAt: subscription.updatedAt,
      siteCreatedAt:
        typeof site?.createdAt === "string" ? site.createdAt : undefined,
      siteUpdatedAt:
        typeof site?.updatedAt === "string" ? site.updatedAt : undefined,
      seoOptimizedAt:
        typeof site?.seoOptimizedAt === "string" && site.seoOptimizedAt.trim()
          ? site.seoOptimizedAt
          : undefined,
    });
  }

  rows.sort((a, b) => {
    const aTime = Date.parse(a.paidAt || a.updatedAt || a.createdAt);
    const bTime = Date.parse(b.paidAt || b.updatedAt || b.createdAt);
    return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
  });

  return rows;
}
