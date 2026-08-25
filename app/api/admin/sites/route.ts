import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { jsonAuthError } from "@/lib/auth-server";
import { listActivePaidSites } from "@/lib/subscription";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
  } catch (error) {
    const authResponse = jsonAuthError(error);
    if (authResponse) return authResponse;
    return NextResponse.json(
      { success: false, error: "Admin access required." },
      { status: 403 },
    );
  }

  try {
    const sites = await listActivePaidSites();
    return NextResponse.json({
      success: true,
      count: sites.length,
      sites,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not load paid sites.";
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}
