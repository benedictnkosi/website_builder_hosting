import { NextResponse } from "next/server";
import { jsonAuthError, requireUser } from "@/lib/auth-server";
import { claimWebsiteIfUnowned } from "@/lib/sites";
import { isValidWebsiteId } from "@/lib/validation";

export const runtime = "nodejs";

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
  const businessName =
    typeof body === "object" &&
    body !== null &&
    "businessName" in body &&
    typeof body.businessName === "string"
      ? body.businessName.trim()
      : "";

  if (!websiteId || !isValidWebsiteId(websiteId)) {
    return NextResponse.json(
      { success: false, error: "A valid websiteId is required." },
      { status: 400 },
    );
  }

  try {
    const user = await requireUser(request);
    const meta = await claimWebsiteIfUnowned({
      websiteId,
      user,
      businessName: businessName || undefined,
    });
    return NextResponse.json({ success: true, site: meta });
  } catch (error) {
    const authResponse = jsonAuthError(error);
    if (authResponse) return authResponse;

    const message =
      error instanceof Error ? error.message : "Could not save this website to your account.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
