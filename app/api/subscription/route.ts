import { NextResponse } from "next/server";
import { websiteExists } from "@/lib/file-manager";
import { isValidWebsiteId } from "@/lib/validation";
import { readSubscription } from "@/lib/subscription";

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

  if (!(await websiteExists(websiteId))) {
    return NextResponse.json(
      { success: false, error: "Website not found." },
      { status: 404 },
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
          mocked: subscription.mocked,
        }
      : null,
  });
}
