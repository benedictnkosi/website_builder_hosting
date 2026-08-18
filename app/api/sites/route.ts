import { NextResponse } from "next/server";
import { jsonAuthError, requireUser } from "@/lib/auth-server";
import { FirestoreError } from "@/lib/firestore";
import { listManagedWebsites } from "@/lib/sites";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const sites = await listManagedWebsites(user);
    return NextResponse.json({ success: true, sites });
  } catch (error) {
    const authResponse = jsonAuthError(error);
    if (authResponse) return authResponse;

    if (error instanceof FirestoreError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode },
      );
    }

    const message =
      error instanceof Error ? error.message : "Could not load your websites.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
