import { NextResponse } from "next/server";
import { isNextResponse, parseDeployJson, requireDeployTarget } from "@/lib/deploy-target";
import { readDeployableWebsiteFiles } from "@/lib/file-manager";
import { GeneratorError } from "@/lib/validation";

export const runtime = "nodejs";
export const maxDuration = 120;

const DEFAULT_AGENT_URL = "http://localhost:8080";

export async function POST(request: Request) {
  const parsed = await parseDeployJson(request);
  if (!parsed.ok) return parsed.response;

  const target = await requireDeployTarget(request, parsed.websiteId, parsed.requestedDomain);
  if (isNextResponse(target)) return target;

  const { user, websiteId, domain } = target;
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
