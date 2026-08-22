import { NextResponse } from "next/server";
import { jsonAuthError, verifyIdToken, sessionCookieOptions } from "@/lib/auth-server";
import { upsertUserProfile } from "@/lib/firestore";
import { isGuestUid } from "@/lib/guest";
import { SESSION_COOKIE } from "@/lib/session-cookie";
import { adoptGuestEdits, ensureSignupEdits } from "@/lib/edits";
import { claimWebsiteIfUnowned } from "@/lib/sites";
import { isValidWebsiteId } from "@/lib/validation";

export const runtime = "nodejs";

function guestSyncFromBody(body: unknown): {
  guestId: string;
  websiteId: string;
  editsRemaining: number | null;
  synced: boolean;
} {
  if (!body || typeof body !== "object") {
    return { guestId: "", websiteId: "", editsRemaining: null, synced: false };
  }
  const data = body as Record<string, unknown>;
  const guestId = typeof data.guestId === "string" ? data.guestId.trim() : "";
  const websiteId = typeof data.websiteId === "string" ? data.websiteId.trim() : "";
  const editsRemaining =
    typeof data.editsRemaining === "number" && Number.isFinite(data.editsRemaining)
      ? Math.max(0, Math.round(data.editsRemaining))
      : null;
  return {
    guestId: isGuestUid(guestId) ? guestId : "",
    websiteId,
    editsRemaining,
    synced: data.synced === true,
  };
}

export async function POST(request: Request) {
  const token =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const guest = guestSyncFromBody(body);

  try {
    const user = await verifyIdToken(token);
    try {
      await upsertUserProfile(user);
      if (!guest.synced && guest.editsRemaining !== null) {
        await adoptGuestEdits(user, guest.editsRemaining);
      } else {
        await ensureSignupEdits(user);
      }
      if (guest.websiteId && isValidWebsiteId(guest.websiteId)) {
        await claimWebsiteIfUnowned({
          websiteId: guest.websiteId,
          user,
          guestId: guest.guestId || undefined,
        }).catch((error) => {
          console.warn("Could not claim guest website during sign-in:", error);
        });
      }
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
