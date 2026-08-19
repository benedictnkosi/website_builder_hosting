import "server-only";

import { NextResponse } from "next/server";
import { jsonAuthError, type AuthUser } from "@/lib/auth-server";
import { requireOwnedSite } from "@/lib/sites";
import { requireActiveSubscription, type WebsiteSubscription } from "@/lib/subscription";
import { isValidWebsiteId } from "@/lib/validation";

export type DeployTarget = {
  user: AuthUser;
  websiteId: string;
  domain: string;
  subscription: WebsiteSubscription;
};

function readWebsiteId(body: unknown): string {
  return typeof body === "object" &&
    body !== null &&
    "websiteId" in body &&
    typeof body.websiteId === "string"
    ? body.websiteId.trim()
    : "";
}

function readRequestedDomain(body: unknown): string {
  return typeof body === "object" &&
    body !== null &&
    "domain" in body &&
    typeof body.domain === "string"
    ? body.domain.trim().toLowerCase()
    : "";
}

export async function parseDeployJson(request: Request): Promise<
  { ok: true; websiteId: string; requestedDomain: string } | { ok: false; response: NextResponse }
> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: "Request body must be valid JSON." },
        { status: 400 },
      ),
    };
  }

  return {
    ok: true,
    websiteId: readWebsiteId(body),
    requestedDomain: readRequestedDomain(body),
  };
}

export async function requireDeployTarget(
  request: Request,
  websiteId: string,
  requestedDomain = "",
): Promise<DeployTarget | NextResponse> {
  if (!websiteId || !isValidWebsiteId(websiteId)) {
    return NextResponse.json(
      { success: false, error: "A valid websiteId is required." },
      { status: 400 },
    );
  }

  let user: AuthUser;
  try {
    ({ user } = await requireOwnedSite(request, websiteId));
  } catch (error) {
    const authResponse = jsonAuthError(error);
    if (authResponse) return authResponse;
    return NextResponse.json(
      { success: false, error: "Sign in to continue." },
      { status: 401 },
    );
  }

  let subscription: WebsiteSubscription;
  try {
    subscription = await requireActiveSubscription(websiteId);
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: "Subscribe before deploying your website.",
        paywall: true,
      },
      { status: 402 },
    );
  }

  const domain = subscription.domain;
  if (requestedDomain && requestedDomain !== domain) {
    return NextResponse.json(
      {
        success: false,
        error: `This subscription is for ${domain}.`,
      },
      { status: 400 },
    );
  }

  return { user, websiteId, domain, subscription };
}

export function isNextResponse(value: DeployTarget | NextResponse): value is NextResponse {
  return !("user" in value);
}
