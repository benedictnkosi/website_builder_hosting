import { NextResponse } from "next/server";
import { isNextResponse, parseDeployJson, requireDeployTarget } from "@/lib/deploy-target";
import { prepareFirstPublishSeo } from "@/lib/publish-seo";
import { clientKey, consumeRateLimit, jsonRateLimitError } from "@/lib/rate-limit";
import { GeneratorError } from "@/lib/validation";
import { runWithMockAiFromRequest } from "@/lib/mock-ai";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  return runWithMockAiFromRequest(request, () => handlePost(request));
}

async function handlePost(request: Request) {
  const parsed = await parseDeployJson(request);
  if (!parsed.ok) return parsed.response;

  const target = await requireDeployTarget(request, parsed.websiteId, parsed.requestedDomain);
  if (isNextResponse(target)) return target;

  try {
    consumeRateLimit(`deploy-seo:${clientKey(request, target.user.uid)}`, 12, 60 * 60 * 1000);
  } catch (error) {
    const limited = jsonRateLimitError(error);
    if (limited) return limited;
  }

  try {
    const result = await prepareFirstPublishSeo({
      websiteId: target.websiteId,
      domain: target.domain,
      user: target.user,
    });
    return NextResponse.json({
      success: true,
      applied: result.applied,
      skipped: !result.applied,
      domain: target.domain,
    });
  } catch (error) {
    const message =
      error instanceof GeneratorError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Could not add search listings to the website.";
    const status = error instanceof GeneratorError ? error.statusCode : 502;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
