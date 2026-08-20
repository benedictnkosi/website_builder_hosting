import { NextResponse } from "next/server";
import { jsonAuthError, requireUser } from "@/lib/auth-server";
import { listEditTopupsForUser } from "@/lib/edit-topup";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const purchases = await listEditTopupsForUser(user.uid);
    return NextResponse.json({ success: true, purchases });
  } catch (error) {
    const authResponse = jsonAuthError(error);
    if (authResponse) return authResponse;
    return NextResponse.json(
      { success: false, error: "Could not load your purchases." },
      { status: 500 },
    );
  }
}
