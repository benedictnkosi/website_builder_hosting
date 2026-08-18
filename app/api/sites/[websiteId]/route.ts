import { NextResponse } from "next/server";
import { jsonAuthError, requireUser } from "@/lib/auth-server";
import { deleteOwnedWebsite } from "@/lib/sites";
import { isValidWebsiteId } from "@/lib/validation";

export const runtime = "nodejs";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ websiteId: string }> },
) {
  const { websiteId } = await params;

  if (!websiteId || !isValidWebsiteId(websiteId)) {
    return NextResponse.json(
      { success: false, error: "A valid websiteId is required." },
      { status: 400 },
    );
  }

  try {
    const user = await requireUser(request);
    const result = await deleteOwnedWebsite(websiteId, user);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const authResponse = jsonAuthError(error);
    if (authResponse) return authResponse;

    const message =
      error instanceof Error ? error.message : "Could not delete this website.";
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}
