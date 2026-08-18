import { NextResponse } from "next/server";
import { jsonAuthError, requireUser } from "@/lib/auth-server";
import { searchDomainAvailability } from "@/lib/domains-co-za";
import { clientKey, consumeRateLimit, jsonRateLimitError } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    consumeRateLimit(`domains:${clientKey(request, user.uid)}`, 30, 10 * 60 * 1000);
  } catch (error) {
    const limited = jsonRateLimitError(error);
    if (limited) return limited;
    const authResponse = jsonAuthError(error);
    if (authResponse) return authResponse;
    return NextResponse.json(
      { success: false, error: "Sign in to continue." },
      { status: 401 },
    );
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";

  if (!query) {
    return NextResponse.json(
      { success: false, error: "A domain name is required." },
      { status: 400 },
    );
  }

  try {
    const data = await searchDomainAvailability(query);
    return NextResponse.json({
      success: true,
      ...data,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not check domain availability.";
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}
