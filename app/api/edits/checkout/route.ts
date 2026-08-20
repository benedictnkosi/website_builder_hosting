import { NextResponse } from "next/server";
import { jsonAuthError, requireUser } from "@/lib/auth-server";
import {
  buildPayfastEditTopupCheckout,
  isPayfastConfigured,
  isPayfastMockAllowed,
} from "@/lib/payfast";
import {
  DEFAULT_EDIT_TOPUP_PACKAGE_ID,
  editTopupPackage,
} from "@/lib/pricing";
import { clientKey, consumeRateLimit, jsonRateLimitError } from "@/lib/rate-limit";
import { createPaymentId } from "@/lib/subscription";
import { writeEditTopup, type EditTopup } from "@/lib/edit-topup";
import { ensureSignupEdits, grantTopupEdits } from "@/lib/edits";

export const runtime = "nodejs";

function requestOrigin(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (configured) {
    return configured;
  }
  return new URL(request.url).origin;
}

function stringField(body: unknown, key: string): string {
  if (
    typeof body === "object" &&
    body !== null &&
    key in body &&
    typeof (body as Record<string, unknown>)[key] === "string"
  ) {
    return ((body as Record<string, unknown>)[key] as string).trim();
  }
  return "";
}

function safeReturnPath(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("://")) {
    return "/dashboard";
  }
  return value;
}

export async function POST(request: Request) {
  let user;
  try {
    user = await requireUser(request);
    consumeRateLimit(`edit-topup:${clientKey(request, user.uid)}`, 8, 60 * 60 * 1000);
  } catch (error) {
    const limited = jsonRateLimitError(error);
    if (limited) return limited;
    const authResponse = jsonAuthError(error);
    if (authResponse) return authResponse;
    return NextResponse.json(
      { success: false, error: "Sign in to buy Edits." },
      { status: 401 },
    );
  }

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const returnPath = safeReturnPath(stringField(body, "returnPath") || "/dashboard");
  const requestedPackageId = stringField(body, "packageId");
  const pack = requestedPackageId
    ? editTopupPackage(requestedPackageId)
    : editTopupPackage(DEFAULT_EDIT_TOPUP_PACKAGE_ID);
  if (!pack) {
    return NextResponse.json(
      { success: false, error: "Choose an Edit pack." },
      { status: 400 },
    );
  }
  const now = new Date().toISOString();
  const paymentId = createPaymentId();
  const topup: EditTopup = {
    paymentId,
    ownerUid: user.uid,
    packageId: pack.id,
    amountZar: pack.amountZar,
    edits: pack.edits,
    status: "pending",
    mocked: false,
    email: user.email,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await ensureSignupEdits(user);

    if (!isPayfastConfigured()) {
      if (!isPayfastMockAllowed()) {
        return NextResponse.json(
          { success: false, error: "PayFast is not configured." },
          { status: 503 },
        );
      }

      topup.status = "complete";
      topup.mocked = true;
      topup.paidAt = now;
      await writeEditTopup(topup);
      const editsRemaining = await grantTopupEdits(user.uid, paymentId, pack.edits);
      return NextResponse.json({
        success: true,
        paid: true,
        mocked: true,
        editsRemaining,
        packageId: pack.id,
        edits: pack.edits,
        amountZar: pack.amountZar,
      });
    }

    await writeEditTopup(topup);
    const checkout = buildPayfastEditTopupCheckout({
      origin: requestOrigin(request),
      returnPath,
      paymentId,
      uid: user.uid,
      amountZar: pack.amountZar,
      edits: pack.edits,
      email: user.email,
      name: user.displayName,
    });

    return NextResponse.json({
      success: true,
      paid: false,
      mocked: false,
      processUrl: checkout.processUrl,
      fields: checkout.fields,
      packageId: pack.id,
      edits: pack.edits,
      amountZar: pack.amountZar,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not start Edit checkout.";
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}
