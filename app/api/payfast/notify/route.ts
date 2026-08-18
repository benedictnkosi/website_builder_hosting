import { NextResponse } from "next/server";
import {
  amountsMatch,
  getPayfastMerchantId,
  isPayfastConfigured,
  parsePayfastNotify,
  verifyPayfastSignature,
} from "@/lib/payfast";
import { readSubscription, writeSubscription } from "@/lib/subscription";

export const runtime = "nodejs";

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

  const websiteId = data.custom_str1?.trim() ?? "";
  const paymentId = data.m_payment_id?.trim() || data.custom_str3?.trim() || "";
  if (!websiteId || !paymentId) {
    return new NextResponse("Missing payment details.", { status: 400 });
  }

  const subscription = await readSubscription(websiteId);
  if (!subscription || subscription.paymentId !== paymentId) {
    return new NextResponse("Unknown payment.", { status: 404 });
  }

  if (!amountsMatch(subscription.amountZar, data.amount_gross)) {
    return new NextResponse("Amount mismatch.", { status: 400 });
  }

  const now = new Date().toISOString();
  const status = data.payment_status?.toUpperCase();

  if (status === "COMPLETE") {
    await writeSubscription({
      ...subscription,
      status: "active",
      payfastPaymentId: data.pf_payment_id || subscription.payfastPaymentId,
      token: data.token || subscription.token,
      paidAt: subscription.paidAt ?? now,
      updatedAt: now,
    });
  } else if (status === "CANCELLED") {
    await writeSubscription({
      ...subscription,
      status: "cancelled",
      payfastPaymentId: data.pf_payment_id || subscription.payfastPaymentId,
      token: data.token || subscription.token,
      updatedAt: now,
    });
  }

  return new NextResponse("OK", { status: 200 });
}
