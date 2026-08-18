import { NextResponse } from "next/server";
import { jsonAuthError, requireUser } from "@/lib/auth-server";
import { listSearchableTlds } from "@/lib/domains-co-za";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await requireUser(request);
  } catch (error) {
    const authResponse = jsonAuthError(error);
    if (authResponse) return authResponse;
    return NextResponse.json(
      { success: false, error: "Sign in to continue." },
      { status: 401 },
    );
  }

  try {
    const tlds = await listSearchableTlds();
    return NextResponse.json({
      success: true,
      tlds: tlds.map((item) => item.tld),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not load domain extensions.";
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}
