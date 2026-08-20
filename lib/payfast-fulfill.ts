import "server-only";

import { readSiteOwnerUid } from "@/lib/firestore";
import { grantSubscriptionEdits, grantTopupEdits } from "@/lib/edits";
import { writeEditTopup, type EditTopup } from "@/lib/edit-topup";
import { isPayfastMockAllowed, isPayfastSandbox } from "@/lib/payfast";
import {
  readSubscription,
  writeSubscription,
  type WebsiteSubscription,
} from "@/lib/subscription";

export function canConfirmPayfastWithoutNotify(request?: Request): boolean {
  if (isPayfastSandbox() || isPayfastMockAllowed()) return true;
  if (!request) return false;
  const hostname = new URL(request.url).hostname;
  return hostname === "localhost" || hostname === "127.0.0.1";
}

export async function fulfillPaidSubscription(
  subscription: WebsiteSubscription,
  extras: {
    payfastPaymentId?: string;
    token?: string;
    lastPaymentStatus?: string;
    processedNotifyIds?: string[];
  } = {},
): Promise<WebsiteSubscription> {
  const now = new Date().toISOString();
  const ownerUid = subscription.ownerUid || (await readSiteOwnerUid(subscription.websiteId));

  if (subscription.status !== "active" && ownerUid) {
    try {
      await grantSubscriptionEdits(ownerUid, subscription.websiteId);
    } catch (error) {
      console.error("Could not grant subscription Edits:", error);
    }
  }

  const next: WebsiteSubscription = {
    ...subscription,
    ownerUid: ownerUid || subscription.ownerUid,
    status: "active",
    payfastPaymentId: extras.payfastPaymentId || subscription.payfastPaymentId,
    token: extras.token || subscription.token,
    paidAt: subscription.paidAt ?? now,
    updatedAt: now,
    lastPaymentStatus: extras.lastPaymentStatus || subscription.lastPaymentStatus,
    processedNotifyIds: extras.processedNotifyIds ?? subscription.processedNotifyIds,
  };

  await writeSubscription(next);
  return next;
}

export async function confirmPendingSubscription(
  websiteId: string,
  request?: Request,
): Promise<{
  subscription: WebsiteSubscription | null;
  paid: boolean;
  confirmed: boolean;
}> {
  const subscription = await readSubscription(websiteId);
  if (!subscription) {
    return { subscription: null, paid: false, confirmed: false };
  }
  if (subscription.status === "active") {
    return { subscription, paid: true, confirmed: false };
  }
  if (subscription.status !== "pending" || !canConfirmPayfastWithoutNotify(request)) {
    return { subscription, paid: false, confirmed: false };
  }

  const notifyId = `sandbox-return:${subscription.paymentId}`;
  const processedNotifyIds = [...(subscription.processedNotifyIds ?? []), notifyId].slice(-20);
  const next = await fulfillPaidSubscription(subscription, {
    lastPaymentStatus: "COMPLETE",
    processedNotifyIds,
  });

  return { subscription: next, paid: true, confirmed: true };
}

export async function fulfillPaidEditTopup(
  topup: EditTopup,
  extras: {
    payfastPaymentId?: string;
    lastPaymentStatus?: string;
    processedNotifyIds?: string[];
  } = {},
): Promise<EditTopup> {
  const now = new Date().toISOString();
  if (topup.status !== "complete") {
    await grantTopupEdits(topup.ownerUid, topup.paymentId, topup.edits);
  }

  const next: EditTopup = {
    ...topup,
    status: "complete",
    payfastPaymentId: extras.payfastPaymentId || topup.payfastPaymentId,
    paidAt: topup.paidAt ?? now,
    updatedAt: now,
    lastPaymentStatus: extras.lastPaymentStatus || topup.lastPaymentStatus,
    processedNotifyIds: extras.processedNotifyIds ?? topup.processedNotifyIds,
  };

  await writeEditTopup(next);
  return next;
}
