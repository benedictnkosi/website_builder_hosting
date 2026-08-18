import { NextResponse } from "next/server";
import { readSiteOwnerUid } from "@/lib/firestore";
import {
  amountsMatch,
  getPayfastMerchantId,
  isPayfastConfigured,
  parsePayfastNotify,
  verifyPayfastSignature,
} from "@/lib/payfast";
import { TOKEN_TOPUP_ZAR } from "@/lib/pricing";
import { readSubscription, writeSubscription } from "@/lib/subscription";
import { readTokenTopup, writeTokenTopup } from "@/lib/token-topup";
import { grantSubscriptionTokens, grantTopupTokens } from "@/lib/tokens";

export const runtime = "nodejs";

async function handleTokenTopup(data: Record<string, string>) {
  const paymentId = data.m_payment_id?.trim() || data.custom_str2?.trim() || "";
  const uid = data.custom_str1?.trim() || "";
  if (!paymentId) {
    return new NextResponse("Missing payment details.", { status: 400 });
  }

  const topup = await readTokenTopup(paymentId);
  if (!topup || (uid && topup.ownerUid !== uid)) {
    return new NextResponse("Unknown payment.", { status: 404 });
  }

  const notifyId =
    data.pf_payment_id?.trim() ||
    `${paymentId}:${data.payment_status ?? ""}:${data.amount_gross ?? ""}`;
  if (topup.processedNotifyIds?.includes(notifyId)) {
    return new NextResponse("OK", { status: 200 });
  }

  if (!amountsMatch(topup.amountZar || TOKEN_TOPUP_ZAR, data.amount_gross)) {
    return new NextResponse("Amount mismatch.", { status: 400 });
  }

  const now = new Date().toISOString();
  const status = data.payment_status?.toUpperCase();
  const processedNotifyIds = [...(topup.processedNotifyIds ?? []), notifyId].slice(-20);

  if (status === "COMPLETE") {
    await grantTopupTokens(topup.ownerUid, topup.paymentId);
    await writeTokenTopup({
      ...topup,
      status: "complete",
      payfastPaymentId: data.pf_payment_id || topup.payfastPaymentId,
      paidAt: topup.paidAt ?? now,
      updatedAt: now,
      lastPaymentStatus: status,
      processedNotifyIds,
    });
  } else if (status === "FAILED") {
    await writeTokenTopup({
      ...topup,
      status: "failed",
      payfastPaymentId: data.pf_payment_id || topup.payfastPaymentId,
      updatedAt: now,
      lastPaymentStatus: status,
      processedNotifyIds,
    });
  } else {
    await writeTokenTopup({
      ...topup,
      payfastPaymentId: data.pf_payment_id || topup.payfastPaymentId,
      updatedAt: now,
      lastPaymentStatus: status,
      processedNotifyIds,
    });
  }

  return new NextResponse("OK", { status: 200 });
}

async function handleSubscription(data: Record<string, string>) {
  const websiteId = data.custom_str1?.trim() ?? "";
  const paymentId = data.m_payment_id?.trim() || data.custom_str3?.trim() || "";
  if (!websiteId || !paymentId) {
    return new NextResponse("Missing payment details.", { status: 400 });
  }

  const subscription = await readSubscription(websiteId);
  if (!subscription || subscription.paymentId !== paymentId) {
    return new NextResponse("Unknown payment.", { status: 404 });
  }

  const notifyId =
    data.pf_payment_id?.trim() ||
    `${paymentId}:${data.payment_status ?? ""}:${data.amount_gross ?? ""}`;
  if (subscription.processedNotifyIds?.includes(notifyId)) {
    return new NextResponse("OK", { status: 200 });
  }

  if (!amountsMatch(subscription.amountZar, data.amount_gross)) {
    return new NextResponse("Amount mismatch.", { status: 400 });
  }

  const now = new Date().toISOString();
  const status = data.payment_status?.toUpperCase();
  const processedNotifyIds = [...(subscription.processedNotifyIds ?? []), notifyId].slice(
    -20,
  );

    if (status === "COMPLETE") {
      const ownerUid = subscription.ownerUid || (await readSiteOwnerUid(websiteId));
      if (subscription.status !== "active" && ownerUid) {
        await grantSubscriptionTokens(ownerUid, websiteId);
      }

    await writeSubscription({
      ...subscription,
      ownerUid: ownerUid || subscription.ownerUid,
      status: "active",
      payfastPaymentId: data.pf_payment_id || subscription.payfastPaymentId,
      token: data.token || subscription.token,
      paidAt: subscription.paidAt ?? now,
      updatedAt: now,
      lastPaymentStatus: status,
      processedNotifyIds,
      tokensGranted: true,
    });
  } else if (status === "CANCELLED") {
    await writeSubscription({
      ...subscription,
      status: "cancelled",
      payfastPaymentId: data.pf_payment_id || subscription.payfastPaymentId,
      token: data.token || subscription.token,
      updatedAt: now,
      lastPaymentStatus: status,
      processedNotifyIds,
    });
  } else if (status === "FAILED") {
    await writeSubscription({
      ...subscription,
      updatedAt: now,
      lastPaymentStatus: status,
      processedNotifyIds,
    });
  } else {
    await writeSubscription({
      ...subscription,
      updatedAt: now,
      lastPaymentStatus: status,
      processedNotifyIds,
    });
  }

  return new NextResponse("OK", { status: 200 });
}

export async function POST(request: Request) {
  if (!isPayfastConfigured()) {
    return new NextResponse("PayFast is not configured.", { status: 503 });
  }

  let data: Record<string, string>;
  try {
    data = parsePayfastNotify(await request.formData());
  } catch {
    return new NextResponse("Invalid notification.", { status: 400 });
  }

  if (!verifyPayfastSignature(data)) {
    return new NextResponse("Invalid signature.", { status: 400 });
  }

  const merchantId = getPayfastMerchantId();
  if (merchantId && data.merchant_id && data.merchant_id !== merchantId) {
    return new NextResponse("Merchant mismatch.", { status: 400 });
  }

  if (data.custom_str4?.trim() === "tokens") {
    return handleTokenTopup(data);
  }

  return handleSubscription(data);
}
