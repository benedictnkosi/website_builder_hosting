import { NextResponse } from "next/server";
import { jsonAuthError } from "@/lib/auth-server";
import { confirmPendingSubscription } from "@/lib/payfast-fulfill";
import { requireOwnedSite, writeWebsiteMeta } from "@/lib/sites";
import { isValidWebsiteId } from "@/lib/validation";

export const runtime = "nodejs";

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
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const websiteId = stringField(body, "websiteId");
  if (!websiteId || !isValidWebsiteId(websiteId)) {
    return NextResponse.json(
      { success: false, error: "A valid websiteId is required." },
      { status: 400 },
    );
  }

  let owner;
  try {
    owner = await requireOwnedSite(request, websiteId);
  } catch (error) {
    const authResponse = jsonAuthError(error);
    if (authResponse) return authResponse;
    return NextResponse.json(
      { success: false, error: "Sign in to continue." },
      { status: 401 },
    );
  }

  const { subscription, paid, confirmed } = await confirmPendingSubscription(
    websiteId,
    request,
  );

  if (confirmed && subscription) {
    await writeWebsiteMeta(
      { ...owner.meta, updatedAt: subscription.updatedAt },
      owner.user,
      subscription,
    );
  }

  return NextResponse.json({
    success: true,
    paid,
    subscription: subscription
      ? {
          websiteId: subscription.websiteId,
          domain: subscription.domain,
          status: subscription.status,
          amountZar: subscription.amountZar,
          frequency: subscription.frequency,
          mocked: subscription.mocked,
        }
      : null,
  });
}
