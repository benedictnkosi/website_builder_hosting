import { NextResponse } from "next/server";
import { jsonAuthError, requireUser } from "@/lib/auth-server";
import { claimWebsiteIfUnowned } from "@/lib/sites";
import { isValidWebsiteId } from "@/lib/validation";
import { authorizeWhatsAppWebsiteClaim } from "@/lib/whatsapp-conversation";

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
  const guestId =
    typeof body === "object" &&
    body !== null &&
    "guestId" in body &&
    typeof body.guestId === "string"
      ? body.guestId.trim()
      : "";
  const whatsappToken =
    typeof body === "object" && body !== null && "whatsappToken" in body && typeof body.whatsappToken === "string"
      ? body.whatsappToken.trim()
      : "";

  if (!websiteId || !isValidWebsiteId(websiteId)) {
    return NextResponse.json(
      { success: false, error: "A valid websiteId is required." },
      { status: 400 },
    );
  }

  try {
    const user = await requireUser(request);
    const allowedOwnerUid = whatsappToken
      ? await authorizeWhatsAppWebsiteClaim(whatsappToken, websiteId)
      : null;
    const meta = await claimWebsiteIfUnowned({
      websiteId,
      user,
      businessName: businessName || undefined,
      guestId: guestId || undefined,
      allowedOwnerUid: allowedOwnerUid || undefined,
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
