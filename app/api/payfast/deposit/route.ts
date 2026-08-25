import { NextResponse } from "next/server";
import {
  buildPayfastWhatsAppDepositCheckout,
  getPayfastConfigError,
  isPayfastConfigured,
} from "@/lib/payfast";
import { createPaymentId } from "@/lib/subscription";
import { clientKey, consumeRateLimit, jsonRateLimitError } from "@/lib/rate-limit";
import { MANAGED_WEBSITE_OFFER } from "@/lib/whatsapp/config";
import {
  createPendingWhatsAppPayment,
  findLatestLeadSummaryForPhone,
  normalizeWhatsAppPhone,
} from "@/lib/whatsapp/payments";

export const runtime = "nodejs";

function requestOrigin(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (configured) return configured;
  return new URL(request.url).origin;
}

export async function POST(request: Request) {
  if (!isPayfastConfigured()) {
    return NextResponse.json(
      {
        success: false,
        error: getPayfastConfigError() || "PayFast is not configured.",
      },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const rawPhone =
    typeof body === "object" &&
    body !== null &&
    typeof (body as Record<string, unknown>).phone === "string"
      ? ((body as Record<string, unknown>).phone as string)
      : "";
  const phone = normalizeWhatsAppPhone(rawPhone);

  if (phone.length < 10) {
    return NextResponse.json(
      {
        success: false,
        error: "A valid WhatsApp phone number is required to track this payment.",
      },
      { status: 400 },
    );
  }

  try {
    consumeRateLimit(`whatsapp-deposit:${clientKey(request)}:${phone}`, 8, 60 * 60 * 1000);
  } catch (error) {
    const limited = jsonRateLimitError(error);
    if (limited) return limited;
  }

  const leadInfo = await findLatestLeadSummaryForPhone(phone);
  const paymentId = createPaymentId();
  const amountZar = MANAGED_WEBSITE_OFFER.depositZar;

  await createPendingWhatsAppPayment({
    paymentId,
    phone,
    amountZar,
    summary: leadInfo.summary,
    contactName: leadInfo.contactName,
    email: leadInfo.email,
    businessName: leadInfo.businessName,
    industry: leadInfo.industry,
  });

  try {
    const checkout = buildPayfastWhatsAppDepositCheckout({
      origin: requestOrigin(request),
      paymentId,
      phone,
      amountZar,
      email: leadInfo.email,
      name: leadInfo.contactName,
    });

    return NextResponse.json({
      success: true,
      paymentId,
      phone,
      amountZar,
      processUrl: checkout.processUrl,
      fields: checkout.fields,
    });
  } catch (error) {
    console.error("WhatsApp deposit checkout error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Could not start PayFast checkout.",
      },
      { status: 500 },
    );
  }
}
