import { NextResponse } from "next/server";
import { provisionDomain } from "@/lib/domains-co-za";
import { isNextResponse, parseDeployJson, requireDeployTarget } from "@/lib/deploy-target";
import { readWebsiteMeta } from "@/lib/sites";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  const parsed = await parseDeployJson(request);
  if (!parsed.ok) return parsed.response;

  const target = await requireDeployTarget(request, parsed.websiteId, parsed.requestedDomain);
  if (isNextResponse(target)) return target;

  try {
    await provisionDomain(target.domain);
    const meta = await readWebsiteMeta(target.websiteId, target.user);
    return NextResponse.json({
      success: true,
      domain: target.domain,
      seoOptimized: Boolean(meta?.seoOptimizedAt),
      message: "Domain registered and DNS records updated.",
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Could not register the domain or update DNS.";
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}
