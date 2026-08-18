import { NextResponse } from "next/server";
import {
  getYearlyPlanPrice,
  searchDomainAvailability,
  splitRegisteredDomain,
} from "@/lib/domains-co-za";
import { websiteExists } from "@/lib/file-manager";
import {
  buildPayfastSubscriptionCheckout,
  isPayfastConfigured,
} from "@/lib/payfast";
import { WEBSITE_FEE_ZAR } from "@/lib/pricing";
import {
  createPaymentId,
  readSubscription,
  writeSubscription,
  type WebsiteSubscription,
} from "@/lib/subscription";
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

  if (!(await websiteExists(websiteId))) {
    return NextResponse.json(
      { success: false, error: "Website not found." },
      { status: 404 },
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

  let sld: string;
  let tld: string;
  try {
    ({ sld, tld } = splitRegisteredDomain(domain));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "A valid domain is required.";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }

  try {
    const availability = await searchDomainAvailability(sld, tld);
    const result = availability.results[0];
    if (!result?.available) {
      return NextResponse.json(
        { success: false, error: "That domain is not available. Choose another name or extension." },
        { status: 409 },
      );
    }

    const price = availability.price ?? (await getYearlyPlanPrice(tld, { premium: result.premium }));
    const now = new Date().toISOString();
    const paymentId = createPaymentId();
    const subscription: WebsiteSubscription = {
      websiteId,
      paymentId,
      domain: result.domain,
      sld,
      tld,
      status: "pending",
      amountZar: price.yearlyTotal,
      domainPriceZar: price.registration,
      websiteFeeZar: WEBSITE_FEE_ZAR,
      currency: "ZAR",
      frequency: "annual",
      mocked: !isPayfastConfigured(),
      email: email || undefined,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    if (!isPayfastConfigured()) {
      subscription.status = "active";
      subscription.paidAt = now;
      await writeSubscription(subscription);
      return NextResponse.json({
        success: true,
        paid: true,
        mocked: true,
        subscription,
      });
    }

    await writeSubscription(subscription);

    const checkout = buildPayfastSubscriptionCheckout({
      origin: requestOrigin(request),
      websiteId,
      paymentId,
      domain: result.domain,
      amountZar: price.yearlyTotal,
      email: email || undefined,
      name: name || undefined,
    });

    return NextResponse.json({
      success: true,
      paid: false,
      mocked: false,
      processUrl: checkout.processUrl,
      fields: checkout.fields,
      subscription: {
        websiteId,
        domain: result.domain,
        amountZar: price.yearlyTotal,
        domainPriceZar: price.registration,
        websiteFeeZar: WEBSITE_FEE_ZAR,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not start checkout.";
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}
