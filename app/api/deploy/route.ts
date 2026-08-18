import { NextResponse } from "next/server";
import { jsonAuthError, type AuthUser } from "@/lib/auth-server";
import { provisionDomain } from "@/lib/domains-co-za";
import { readDeployableWebsiteFiles } from "@/lib/file-manager";
import { GeneratorError, isValidWebsiteId } from "@/lib/validation";
import { requireOwnedSite } from "@/lib/sites";
import { requireActiveSubscription } from "@/lib/subscription";

export const runtime = "nodejs";
export const maxDuration = 120;

const DEFAULT_AGENT_URL = "http://localhost:8080";

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

  const websiteId =
    typeof body === "object" &&
    body !== null &&
    "websiteId" in body &&
    typeof body.websiteId === "string"
      ? body.websiteId.trim()
      : "";

  const requestedDomain =
    typeof body === "object" &&
    body !== null &&
    "domain" in body &&
    typeof body.domain === "string"
      ? body.domain.trim().toLowerCase()
      : "";

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

  let subscription;
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

  const agentUrl = (process.env.DEPLOYMENT_AGENT_URL || DEFAULT_AGENT_URL).replace(
    /\/$/,
    "",
  );
  const apiKey = process.env.DEPLOYMENT_API_KEY?.trim() || "";

  if (!apiKey) {
    return NextResponse.json(
      { success: false, error: "DEPLOYMENT_API_KEY is not configured." },
      { status: 500 },
    );
  }

  try {
    await provisionDomain(domain);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Could not register the domain or update DNS.";
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }

  let files;
  try {
    files = await readDeployableWebsiteFiles(websiteId, user.idToken);
  } catch (error) {
    const message =
      error instanceof GeneratorError
        ? error.message
        : "Could not read website files.";
    return NextResponse.json({ success: false, error: message }, { status: 404 });
  }

  try {
    const response = await fetch(`${agentUrl}/api/v1/deploy`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        websiteId,
        domain,
        files,
      }),
      signal: AbortSignal.timeout(45_000),
    });

    const data = (await response.json()) as {
      success?: boolean;
      websiteId?: string;
      domain?: string;
      message?: string;
      error?: string;
      httpsReady?: boolean;
    };

    if (!response.ok || data.success === false) {
      return NextResponse.json(
        {
          success: false,
          error: data.message || data.error || "Deployment failed.",
        },
        { status: response.status },
      );
    }

    const domainName = data.domain || domain;
    const httpsReady = data.httpsReady === true;

    return NextResponse.json({
      success: true,
      websiteId: data.websiteId || websiteId,
      domain: domainName,
      url: `https://${domainName}`,
      httpsReady,
      message:
        data.message ||
        (httpsReady
          ? "Website deployed successfully"
          : "Website deployed. HTTPS will be enabled once public DNS points at this server."),
    });
  } catch (error) {
    const aborted =
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError");

    return NextResponse.json(
      {
        success: false,
        error: aborted
          ? "The deployment agent timed out. Please try again."
          : "Could not reach the deployment agent. Make sure it is running.",
      },
      { status: 502 },
    );
  }
}
