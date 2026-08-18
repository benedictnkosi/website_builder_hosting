import { NextResponse } from "next/server";
import { jsonAuthError, requireUser } from "@/lib/auth-server";
import {
  SIGNUP_TOKEN_GRANT,
  TOKEN_TOPUP_TOKENS,
  TOKEN_TOPUP_ZAR,
} from "@/lib/pricing";
import { ensureSignupTokens } from "@/lib/tokens";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const tokenBalance = await ensureSignupTokens(user);
    return NextResponse.json({
      success: true,
      tokenBalance,
      signupGrant: SIGNUP_TOKEN_GRANT,
      topup: {
        amountZar: TOKEN_TOPUP_ZAR,
        tokens: TOKEN_TOPUP_TOKENS,
      },
    });
  } catch (error) {
    const authResponse = jsonAuthError(error);
    if (authResponse) return authResponse;
    return NextResponse.json(
      { success: false, error: "Could not load your token balance." },
      { status: 500 },
    );
  }
}
