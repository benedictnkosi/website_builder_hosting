import { NextResponse } from "next/server";
import { jsonAuthError } from "@/lib/auth-server";
import { requireOwnedSite } from "@/lib/sites";
import { readSubscription } from "@/lib/subscription";
import { isValidWebsiteId } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const websiteId = searchParams.get("websiteId")?.trim() ?? "";

  if (!websiteId || !isValidWebsiteId(websiteId)) {
    return NextResponse.json(
      { success: false, error: "A valid websiteId is required." },
      { status: 400 },
    );
  }

  try {
    await requireOwnedSite(request, websiteId);
  } catch (error) {
    const authResponse = jsonAuthError(error);
    if (authResponse) return authResponse;
    return NextResponse.json(
      { success: false, error: "Sign in to continue." },
      { status: 401 },
    );
  }

  const subscription = await readSubscription(websiteId);

  return NextResponse.json({
    success: true,
    paid: subscription?.status === "active",
    subscription: subscription
      ? {
          websiteId: subscription.websiteId,
          domain: subscription.domain,
          tld: subscription.tld,
          status: subscription.status,
          amountZar: subscription.amountZar,
          domainPriceZar: subscription.domainPriceZar,
          websiteFeeZar: subscription.websiteFeeZar,
          frequency: subscription.frequency,
          mocked: subscription.mocked,
        }
      : null,
  });
}
