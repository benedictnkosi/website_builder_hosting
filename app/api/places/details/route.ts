import { NextResponse } from "next/server";
import { jsonAuthError, requireActor } from "@/lib/auth-server";
import { getGoogleFormattedAddress } from "@/lib/google-places-api";
import { clientKey, consumeRateLimit, jsonRateLimitError } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireActor(request);
    consumeRateLimit(`places:${clientKey(request, user.uid)}`, 60, 10 * 60 * 1000);
  } catch (error) {
    const limited = jsonRateLimitError(error);
    if (limited) return limited;
    const authResponse = jsonAuthError(error);
    if (authResponse) return authResponse;
    return NextResponse.json(
      { error: "Sign in to continue." },
      { status: 401 },
    );
  }

  const placeId = new URL(request.url).searchParams.get("placeId")?.trim();

  if (!placeId) {
    return NextResponse.json({ error: "placeId is required." }, { status: 400 });
  }

  try {
    return NextResponse.json({ formatted_address: await getGoogleFormattedAddress(placeId) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Places details failed." },
      { status: 502 },
    );
  }
}
