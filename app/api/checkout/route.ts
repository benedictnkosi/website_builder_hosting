import { NextResponse } from "next/server";
import { jsonAuthError } from "@/lib/auth-server";
import {
  searchDomainAvailability,
  splitRegisteredDomain,
} from "@/lib/domains-co-za";
import {
  buildPayfastSubscriptionCheckout,
  getPayfastConfigError,
  isPayfastConfigured,
  isPayfastMockAllowed,
} from "@/lib/payfast";
import {
  parseBillingFrequency,
  SUBSCRIPTION_TLD,
  subscriptionAmountZar,
  type BillingFrequency,
} from "@/lib/pricing";
import { clientKey, consumeRateLimit, jsonRateLimitError } from "@/lib/rate-limit";
import { requireOwnedSite, writeWebsiteMeta } from "@/lib/sites";
import {
  createPaymentId,
  readSubscription,
  writeSubscription,
  type WebsiteSubscription,
} from "@/lib/subscription";
import { grantSubscriptionEdits } from "@/lib/edits";
import { isValidWebsiteId } from "@/lib/validation";

export const runtime = "nodejs";
export const maxDuration = 60;

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

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const websiteId = stringField(body, "websiteId");
  const domain = stringField(body, "domain").toLowerCase();
  const email = stringField(body, "email");
  const name = stringField(body, "name");
  const frequency = parseBillingFrequency(stringField(body, "frequency"));
  const amountZar = subscriptionAmountZar(frequency);

  if (!websiteId || !isValidWebsiteId(websiteId)) {
    return NextResponse.json(
      { success: false, error: "A valid websiteId is required." },
      { status: 400 },
    );
  }

  if (!domain) {
    return NextResponse.json(
      { success: false, error: "A domain is required." },
      { status: 400 },
    );
  }

  let owner;
  try {
    owner = await requireOwnedSite(request, websiteId);
    consumeRateLimit(`checkout:${clientKey(request, owner.user.uid)}`, 10, 60 * 60 * 1000);
  } catch (error) {
    const limited = jsonRateLimitError(error);
    if (limited) return limited;
    const authResponse = jsonAuthError(error);
    if (authResponse) return authResponse;
    return NextResponse.json(
      { success: false, error: "Sign in to continue." },
      { status: 401 },
    );
  }

  if (!owner) {
    return NextResponse.json(
      { success: false, error: "Sign in to continue." },
      { status: 401 },
    );
  }

  const existing = await readSubscription(websiteId);
  if (existing?.status === "active") {
    return NextResponse.json({
      success: true,
      paid: true,
      mocked: existing.mocked,
      subscription: existing,
    });
  }

  if (existing?.status === "pending") {
    if (existing.domain !== domain) {
      return NextResponse.json(
        {
          success: false,
          error: `Checkout for ${existing.domain} is already in progress. Finish that payment or wait before choosing another domain.`,
          domain: existing.domain,
        },
        { status: 409 },
      );
    }

    if (
      existing.frequency === frequency &&
      existing.amountZar === amountZar
    ) {
      if (!isPayfastConfigured()) {
        if (!isPayfastMockAllowed()) {
          return NextResponse.json(
            { success: false, error: getPayfastConfigError() || "PayFast is not configured." },
            { status: 503 },
          );
        }
      } else {
        return NextResponse.json(
          payfastCheckoutResponse({
            origin: requestOrigin(request),
            websiteId,
            paymentId: existing.paymentId,
            domain: existing.domain,
            amountZar: existing.amountZar,
            websiteFeeZar: existing.websiteFeeZar,
            frequency: existing.frequency,
            email: email || existing.email,
            name: name || undefined,
          }),
        );
      }
    }
  }

  let sld: string;
  let tld: string;
  try {
    ({ sld, tld } = splitRegisteredDomain(domain));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "A valid .co.za domain is required.";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }

  if (tld !== SUBSCRIPTION_TLD) {
    return NextResponse.json(
      { success: false, error: "Only .co.za domains are available." },
      { status: 400 },
    );
  }

  try {
    const availability = await searchDomainAvailability(sld);
    const result = availability.results[0];
    if (!result?.available) {
      return NextResponse.json(
        { success: false, error: "That domain is not available. Choose another name." },
        { status: 409 },
      );
    }

    const now = new Date().toISOString();
    const paymentId = existing?.paymentId || createPaymentId();
    const subscription: WebsiteSubscription = {
      websiteId,
      ownerUid: owner.user.uid,
      paymentId,
      domain: result.domain,
      sld,
      tld,
      status: "pending",
      amountZar,
      domainPriceZar: 0,
      websiteFeeZar: amountZar,
      currency: "ZAR",
      frequency,
      mocked: false,
      email: email || existing?.email,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      processedNotifyIds: existing?.processedNotifyIds,
    };

    if (!isPayfastConfigured()) {
      if (!isPayfastMockAllowed()) {
        return NextResponse.json(
          { success: false, error: getPayfastConfigError() || "PayFast is not configured." },
          { status: 503 },
        );
      }

      subscription.status = "active";
      subscription.mocked = true;
      subscription.paidAt = now;
      await writeSubscription(subscription);
      await writeWebsiteMeta(
        { ...owner.meta, updatedAt: subscription.updatedAt },
        owner.user,
        subscription,
      );
      try {
        await grantSubscriptionEdits(owner.user.uid, websiteId);
      } catch (error) {
        console.error("Could not grant subscription Edits:", error);
      }
      return NextResponse.json({
        success: true,
        paid: true,
        mocked: true,
        subscription,
      });
    }

    await writeSubscription(subscription);
    await writeWebsiteMeta(
      { ...owner.meta, updatedAt: subscription.updatedAt },
      owner.user,
      subscription,
    );

    return NextResponse.json(
      payfastCheckoutResponse({
        origin: requestOrigin(request),
        websiteId,
        paymentId,
        domain: result.domain,
        amountZar,
        websiteFeeZar: amountZar,
        frequency,
        email: email || undefined,
        name: name || undefined,
      }),
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not start checkout.";
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}

function payfastCheckoutResponse(input: {
  origin: string;
  websiteId: string;
  paymentId: string;
  domain: string;
  amountZar: number;
  websiteFeeZar: number;
  frequency: BillingFrequency;
  email?: string;
  name?: string;
}) {
  const checkout = buildPayfastSubscriptionCheckout(input);
  return {
    success: true,
    paid: false,
    mocked: false,
    processUrl: checkout.processUrl,
    fields: checkout.fields,
    subscription: {
      websiteId: input.websiteId,
      domain: input.domain,
      amountZar: input.amountZar,
      websiteFeeZar: input.websiteFeeZar,
      frequency: input.frequency,
    },
  };
}
