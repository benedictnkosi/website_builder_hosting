import { NextResponse } from "next/server";
import {
  amountsMatch,
  getPayfastMerchantId,
  isPayfastConfigured,
  parsePayfastNotify,
  verifyPayfastSignature,
} from "@/lib/payfast";
import { fulfillPaidEditTopup, fulfillPaidSubscription } from "@/lib/payfast-fulfill";
import { EDIT_TOPUP_ZAR } from "@/lib/pricing";
import { readSubscription, writeSubscription } from "@/lib/subscription";
import { readEditTopup, writeEditTopup } from "@/lib/edit-topup";
import {
  MANAGED_WEBSITE_OFFER,
  getHumanHandoverWhatsApp,
} from "@/lib/whatsapp/config";
import { sendWhatsAppText } from "@/lib/whatsapp/client";
import { getOrCreateWhatsAppLead, saveWhatsAppLead } from "@/lib/whatsapp/leads";
import { sendWhatsAppLeadEmail } from "@/lib/whatsapp/notify";
import {
  buildClientNeedSummary,
  normalizeWhatsAppPhone,
  readWhatsAppPayment,
  writeWhatsAppPayment,
} from "@/lib/whatsapp/payments";

export const runtime = "nodejs";

async function handleWhatsAppDeposit(data: Record<string, string>) {
  const paymentId = data.m_payment_id?.trim() || data.custom_str3?.trim() || "";
  const phone = normalizeWhatsAppPhone(data.custom_str1?.trim() || data.cell_number || "");
  if (!paymentId || !phone) {
    return rejectNotify("Missing WhatsApp deposit payment details.", 400, data);
  }

  const payment = await readWhatsAppPayment(paymentId);
  if (!payment || payment.phone !== phone) {
    return new NextResponse("Unknown WhatsApp deposit payment.", { status: 404 });
  }

  const notifyId =
    data.pf_payment_id?.trim() ||
    `${paymentId}:${data.payment_status ?? ""}:${data.amount_gross ?? ""}`;
  if (payment.processedNotifyIds?.includes(notifyId)) {
    return new NextResponse("OK", { status: 200 });
  }

  if (!amountsMatch(payment.amountZar || MANAGED_WEBSITE_OFFER.depositZar, data.amount_gross)) {
    return rejectNotify("Amount mismatch.", 400, data);
  }

  const now = new Date().toISOString();
  const status = data.payment_status?.toUpperCase();
  const processedNotifyIds = [...(payment.processedNotifyIds ?? []), notifyId].slice(-20);

  if (status === "COMPLETE") {
    let summary = payment.summary;
    let contactName = payment.contactName;
    let email = payment.email;
    let businessName = payment.businessName;
    let industry = payment.industry;

    try {
      const lead = await getOrCreateWhatsAppLead({ waId: phone });
      summary = buildClientNeedSummary(lead) || summary;
      contactName = lead.fields.name || lead.contactName || contactName;
      email = lead.fields.email || email;
      businessName = lead.fields.businessName || businessName;
      industry = lead.fields.industry || industry;

      lead.fields.notes = [
        lead.fields.notes,
        `PayFast deposit confirmed (${data.pf_payment_id || paymentId}).`,
      ]
        .filter(Boolean)
        .join(" ");
      lead.fields.interested = true;
      lead.status = "handed_off";
      if (!lead.notifiedAt) {
        try {
          const humanTo = getHumanHandoverWhatsApp();
          await sendWhatsAppText({
            to: humanTo,
            body: [
              "Lulaweb PayFast deposit COMPLETE.",
              `Amount: R${payment.amountZar}`,
              `Customer WhatsApp: +${phone}`,
              `Payment id: ${data.pf_payment_id || paymentId}`,
              `Summary: ${summary}`,
            ].join("\n"),
          });
          await sendWhatsAppLeadEmail({
            ...lead,
            fields: { ...lead.fields, notes: summary },
          });
          lead.notifiedAt = now;
        } catch (error) {
          console.error("WhatsApp deposit handover notify failed:", error);
        }
      }
      await saveWhatsAppLead(lead);
    } catch (error) {
      console.error("WhatsApp deposit lead refresh failed:", error);
    }

    await writeWhatsAppPayment({
      ...payment,
      status: "complete",
      amountZar: payment.amountZar,
      date: now,
      paidAt: now,
      summary,
      contactName,
      email,
      businessName,
      industry,
      payfastPaymentId: data.pf_payment_id || payment.payfastPaymentId,
      updatedAt: now,
      lastPaymentStatus: status,
      processedNotifyIds,
    });
  } else if (status === "FAILED") {
    await writeWhatsAppPayment({
      ...payment,
      status: "failed",
      payfastPaymentId: data.pf_payment_id || payment.payfastPaymentId,
      updatedAt: now,
      lastPaymentStatus: status,
      processedNotifyIds,
    });
  } else {
    await writeWhatsAppPayment({
      ...payment,
      payfastPaymentId: data.pf_payment_id || payment.payfastPaymentId,
      updatedAt: now,
      lastPaymentStatus: status,
      processedNotifyIds,
    });
  }

  return new NextResponse("OK", { status: 200 });
}
async function handleEditTopup(data: Record<string, string>) {
  const paymentId = data.m_payment_id?.trim() || data.custom_str2?.trim() || "";
  const uid = data.custom_str1?.trim() || "";
  if (!paymentId) {
    return rejectNotify("Missing payment details.", 400, data);
  }

  const topup = await readEditTopup(paymentId);
  if (!topup || (uid && topup.ownerUid !== uid)) {
    return new NextResponse("Unknown payment.", { status: 404 });
  }

  const notifyId =
    data.pf_payment_id?.trim() ||
    `${paymentId}:${data.payment_status ?? ""}:${data.amount_gross ?? ""}`;
  if (topup.processedNotifyIds?.includes(notifyId)) {
    return new NextResponse("OK", { status: 200 });
  }

  if (!amountsMatch(topup.amountZar || EDIT_TOPUP_ZAR, data.amount_gross)) {
    return rejectNotify("Amount mismatch.", 400, data);
  }

  const now = new Date().toISOString();
  const status = data.payment_status?.toUpperCase();
  const processedNotifyIds = [...(topup.processedNotifyIds ?? []), notifyId].slice(-20);

  if (status === "COMPLETE") {
    await fulfillPaidEditTopup(topup, {
      payfastPaymentId: data.pf_payment_id || topup.payfastPaymentId,
      lastPaymentStatus: status,
      processedNotifyIds,
    });
  } else if (status === "FAILED") {
    await writeEditTopup({
      ...topup,
      status: "failed",
      payfastPaymentId: data.pf_payment_id || topup.payfastPaymentId,
      updatedAt: now,
      lastPaymentStatus: status,
      processedNotifyIds,
    });
  } else {
    await writeEditTopup({
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
    return rejectNotify("Missing payment details.", 400, data);
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
    return rejectNotify("Amount mismatch.", 400, data);
  }

  const now = new Date().toISOString();
  const status = data.payment_status?.toUpperCase();
  const processedNotifyIds = [...(subscription.processedNotifyIds ?? []), notifyId].slice(
    -20,
  );

  if (status === "COMPLETE") {
    await fulfillPaidSubscription(subscription, {
      payfastPaymentId: data.pf_payment_id || subscription.payfastPaymentId,
      token: data.token || subscription.token,
      lastPaymentStatus: status,
      processedNotifyIds,
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

function rejectNotify(reason: string, status: number, data?: Record<string, string>) {
  console.warn("PayFast notify rejected:", reason, {
    merchant_id: data?.merchant_id,
    expected_merchant_id: getPayfastMerchantId() || undefined,
    m_payment_id: data?.m_payment_id,
    custom_str1: data?.custom_str1,
    custom_str4: data?.custom_str4,
    payment_status: data?.payment_status,
    amount_gross: data?.amount_gross,
    has_signature: Boolean(data?.signature),
  });
  return new NextResponse(reason, { status });
}

export async function POST(request: Request) {
  if (!isPayfastConfigured()) {
    return rejectNotify("PayFast is not configured.", 503);
  }

  let data: Record<string, string>;
  try {
    data = parsePayfastNotify(await request.formData());
  } catch {
    return rejectNotify("Invalid notification.", 400);
  }

  if (!verifyPayfastSignature(data)) {
    return rejectNotify("Invalid signature.", 400, data);
  }

  const merchantId = getPayfastMerchantId();
  if (merchantId && data.merchant_id && data.merchant_id !== merchantId) {
    return rejectNotify("Merchant mismatch.", 400, data);
  }

  if (data.custom_str4?.trim() === "edits" || data.custom_str4?.trim() === "tokens") {
    return handleEditTopup(data);
  }

  if (data.custom_str4?.trim() === "whatsapp_deposit") {
    return handleWhatsAppDeposit(data);
  }

  return handleSubscription(data);
}
