import { NextResponse } from "next/server";
import { jsonAuthError, requireUser } from "@/lib/auth-server";
import { EDIT_TOPUP_PACKAGES, SIGNUP_EDITS_GRANT } from "@/lib/pricing";
import { ensureSignupEdits } from "@/lib/edits";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const editsRemaining = await ensureSignupEdits(user);
    return NextResponse.json({
      success: true,
      editsRemaining,
      signupGrant: SIGNUP_EDITS_GRANT,
      packages: EDIT_TOPUP_PACKAGES,
    });
  } catch (error) {
    const authResponse = jsonAuthError(error);
    if (authResponse) return authResponse;
    return NextResponse.json(
      { success: false, error: "Could not load your Edit balance." },
      { status: 500 },
    );
  }
}
