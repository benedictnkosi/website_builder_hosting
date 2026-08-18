import { NextResponse } from "next/server";
import { readDeployableWebsiteFiles } from "@/lib/file-manager";
import { GeneratorError } from "@/lib/validation";

export const runtime = "nodejs";
export const maxDuration = 60;

const DEFAULT_AGENT_URL = "http://localhost:8080";

function isValidWebsiteId(websiteId: string): boolean {
  return /^[a-zA-Z0-9_-]{1,64}$/.test(websiteId);
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

  const websiteId =
    typeof body === "object" &&
    body !== null &&
    "websiteId" in body &&
    typeof body.websiteId === "string"
      ? body.websiteId.trim()
      : "";

  const domain =
    typeof body === "object" &&
    body !== null &&
    "domain" in body &&
    typeof body.domain === "string"
      ? body.domain.trim()
      : "";

  if (!websiteId || !isValidWebsiteId(websiteId)) {
    return NextResponse.json(
      { success: false, error: "A valid websiteId is required." },
      { status: 400 },
    );
  }

  const localUrl = `${new URL(request.url).origin}/api/preview/${websiteId}/index.html`;

  if (!domain) {
    return NextResponse.json({
      success: true,
      websiteId,
      domain: null,
      url: localUrl,
      message: "No domain provided. Use the local preview URL.",
    });
  }

  let files;
  try {
    files = await readDeployableWebsiteFiles(websiteId);
  } catch (error) {
    const message =
      error instanceof GeneratorError
        ? error.message
        : "Could not read website files.";
    return NextResponse.json({ success: false, error: message }, { status: 404 });
  }

  const agentUrl = (
    process.env.DEPLOYMENT_AGENT_URL || DEFAULT_AGENT_URL
  ).replace(/\/$/, "");
  const apiKey = process.env.DEPLOYMENT_API_KEY || "development-key";

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

    return NextResponse.json({
      success: true,
      websiteId: data.websiteId || websiteId,
      domain: data.domain || domain,
      url: `http://${data.domain || domain}`,
      message: data.message || "Website deployed successfully",
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
