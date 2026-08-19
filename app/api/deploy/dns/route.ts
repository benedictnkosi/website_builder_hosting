import { NextResponse } from "next/server";
import { isNextResponse, requireDeployTarget } from "@/lib/deploy-target";
import { checkPublicDns } from "@/lib/public-dns";
import { clientKey, consumeRateLimit, jsonRateLimitError } from "@/lib/rate-limit";
import { isValidWebsiteId } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const websiteId = new URL(request.url).searchParams.get("websiteId")?.trim() ?? "";
  if (!websiteId || !isValidWebsiteId(websiteId)) {
    return NextResponse.json(
      { success: false, error: "A valid websiteId is required." },
      { status: 400 },
    );
  }

  const target = await requireDeployTarget(request, websiteId);
  if (isNextResponse(target)) return target;

  try {
    consumeRateLimit(`deploy-dns:${clientKey(request, target.user.uid)}`, 90, 10 * 60 * 1000);
  } catch (error) {
    const limited = jsonRateLimitError(error);
    if (limited) return limited;
  }

  try {
    const status = await checkPublicDns(target.domain);
    return NextResponse.json({
      success: true,
      domain: target.domain,
      ready: status.ready,
      expectedIp: status.expectedIp,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not check public DNS.";
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}
