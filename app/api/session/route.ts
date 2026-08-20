import { NextResponse } from "next/server";
import { jsonAuthError, verifyIdToken, sessionCookieOptions } from "@/lib/auth-server";
import { upsertUserProfile } from "@/lib/firestore";
import { SESSION_COOKIE } from "@/lib/session-cookie";
import { ensureSignupEdits } from "@/lib/edits";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const token =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";

  try {
    const user = await verifyIdToken(token);
    try {
      await upsertUserProfile(user);
      await ensureSignupEdits(user);
    } catch (error) {
      console.error("Could not save user profile to Firestore:", error);
    }
    const response = NextResponse.json({ success: true, uid: user.uid });
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    return response;
  } catch (error) {
    const authResponse = jsonAuthError(error);
    if (authResponse) return authResponse;
    return NextResponse.json(
      { success: false, error: "Could not create a session." },
      { status: 401 },
    );
  }
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.set(SESSION_COOKIE, "", {
    ...sessionCookieOptions(),
    maxAge: 0,
  });
  return response;
}
