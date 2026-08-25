import { NextResponse } from "next/server";
import { isAdminUser } from "@/lib/admin";
import { jsonAuthError, requireUser } from "@/lib/auth-server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    return NextResponse.json({
      success: true,
      admin: isAdminUser(user),
      email: user.email ?? null,
    });
  } catch (error) {
    const authResponse = jsonAuthError(error);
    if (authResponse) return authResponse;
    return NextResponse.json(
      { success: false, error: "Sign in to continue." },
      { status: 401 },
    );
  }
}
