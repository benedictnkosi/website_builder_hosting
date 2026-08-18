import { NextResponse } from "next/server";
import { jsonAuthError, requireUser } from "@/lib/auth-server";
import {
  buildPayfastTokenTopupCheckout,
  isPayfastConfigured,
  isPayfastMockAllowed,
} from "@/lib/payfast";
import { TOKEN_TOPUP_TOKENS, TOKEN_TOPUP_ZAR } from "@/lib/pricing";
import { clientKey, consumeRateLimit, jsonRateLimitError } from "@/lib/rate-limit";
import { createPaymentId } from "@/lib/subscription";
import { writeTokenTopup, type TokenTopup } from "@/lib/token-topup";
import { ensureSignupTokens, grantTopupTokens } from "@/lib/tokens";

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
    consumeRateLimit(`token-topup:${clientKey(request, user.uid)}`, 8, 60 * 60 * 1000);
  } catch (error) {
    const limited = jsonRateLimitError(error);
    if (limited) return limited;
    const authResponse = jsonAuthError(error);
    if (authResponse) return authResponse;
    return NextResponse.json(
      { success: false, error: "Sign in to buy tokens." },
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
  const now = new Date().toISOString();
  const paymentId = createPaymentId();
  const topup: TokenTopup = {
    paymentId,
    ownerUid: user.uid,
    amountZar: TOKEN_TOPUP_ZAR,
    tokens: TOKEN_TOPUP_TOKENS,
    status: "pending",
    mocked: false,
    email: user.email,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await ensureSignupTokens(user);

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
      await writeTokenTopup(topup);
      const tokenBalance = await grantTopupTokens(user.uid, paymentId);
      return NextResponse.json({
        success: true,
        paid: true,
        mocked: true,
        tokenBalance,
        tokens: TOKEN_TOPUP_TOKENS,
        amountZar: TOKEN_TOPUP_ZAR,
      });
    }

    await writeTokenTopup(topup);
    const checkout = buildPayfastTokenTopupCheckout({
      origin: requestOrigin(request),
      returnPath,
      paymentId,
      uid: user.uid,
      amountZar: TOKEN_TOPUP_ZAR,
      tokens: TOKEN_TOPUP_TOKENS,
      email: user.email,
      name: user.displayName,
    });

    return NextResponse.json({
      success: true,
      paid: false,
      mocked: false,
      processUrl: checkout.processUrl,
      fields: checkout.fields,
      tokens: TOKEN_TOPUP_TOKENS,
      amountZar: TOKEN_TOPUP_ZAR,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not start token checkout.";
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}
