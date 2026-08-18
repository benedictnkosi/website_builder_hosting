import { NextResponse } from "next/server";
import { jsonAuthError, requireUser } from "@/lib/auth-server";
import { getGooglePlacesApiKey } from "@/lib/google-places-api";
import { clientKey, consumeRateLimit, jsonRateLimitError } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
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

  const apiKey = getGooglePlacesApiKey();
  if (!apiKey) {
    return NextResponse.json(
      { error: "Google Places API key is not configured." },
      { status: 500 },
    );
  }

  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  url.searchParams.set("place_id", placeId);
  url.searchParams.set("fields", "formatted_address");
  url.searchParams.set("key", apiKey);

  const response = await fetch(url.toString());

  if (!response.ok) {
    return NextResponse.json(
      { error: "Places details request failed." },
      { status: 502 },
    );
  }

  const data = (await response.json()) as {
    status?: string;
    result?: { formatted_address?: string };
    error_message?: string;
  };

  if (data.status !== "OK") {
    console.error("Places details error:", data.status, data.error_message);
    return NextResponse.json(
      { error: data.error_message || "Places details failed." },
      { status: 502 },
    );
  }

  return NextResponse.json({
    formatted_address: data.result?.formatted_address ?? "",
  });
}
