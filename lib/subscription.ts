import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { getWebsiteDirectory } from "@/lib/file-manager";
import { isValidWebsiteId } from "@/lib/validation";

export type SubscriptionStatus = "pending" | "active" | "cancelled";

export type WebsiteSubscription = {
  websiteId: string;
  paymentId: string;
  domain: string;
  sld: string;
  tld: string;
  status: SubscriptionStatus;
  amountZar: number;
  domainPriceZar: number;
  websiteFeeZar: number;
  currency: string;
  frequency: "annual";
  mocked: boolean;
  email?: string;
  payfastPaymentId?: string;
  token?: string;
  createdAt: string;
  updatedAt: string;
  paidAt?: string;
};

const SUBSCRIPTION_FILE = ".subscription.json";

function subscriptionPath(websiteId: string): string {
  return path.join(getWebsiteDirectory(websiteId), SUBSCRIPTION_FILE);
}

export function createPaymentId(): string {
  return randomBytes(8).toString("hex");
}

export async function readSubscription(
  websiteId: string,
): Promise<WebsiteSubscription | null> {
  if (!isValidWebsiteId(websiteId)) {
    return null;
  }

  try {
    const raw = await readFile(subscriptionPath(websiteId), "utf8");
    const data = JSON.parse(raw) as WebsiteSubscription;
    if (!data || typeof data !== "object" || data.websiteId !== websiteId) {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export async function writeSubscription(
  subscription: WebsiteSubscription,
): Promise<void> {
  const websiteDir = getWebsiteDirectory(subscription.websiteId);
  await mkdir(websiteDir, { recursive: true });
  await writeFile(
    subscriptionPath(subscription.websiteId),
    `${JSON.stringify(subscription, null, 2)}\n`,
    "utf8",
  );
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
