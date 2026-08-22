import { NextResponse } from "next/server";
import { jsonAuthError, requireActor } from "@/lib/auth-server";
import { getGooglePlacesApiKey } from "@/lib/google-places-api";
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

  const input = new URL(request.url).searchParams.get("input")?.trim();

  if (!input || input.length < 3) {
    return NextResponse.json({ predictions: [] });
  }

  const apiKey = getGooglePlacesApiKey();
  if (!apiKey) {
    return NextResponse.json(
      { error: "Google Places API key is not configured." },
      { status: 500 },
    );
  }

  const url = new URL(
    "https://maps.googleapis.com/maps/api/place/autocomplete/json",
  );
  url.searchParams.set("input", input);
  url.searchParams.set("types", "address");
  url.searchParams.set("components", "country:za");
  url.searchParams.set("region", "za");
  url.searchParams.set("key", apiKey);

  const response = await fetch(url.toString());

  if (!response.ok) {
    return NextResponse.json(
      { error: "Places autocomplete request failed." },
      { status: 502 },
    );
  }

  const data = (await response.json()) as {
    status?: string;
    predictions?: Array<{ description: string; place_id: string }>;
    error_message?: string;
  };

  if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    console.error("Places autocomplete error:", data.status, data.error_message);
    return NextResponse.json(
      { error: data.error_message || "Places autocomplete failed." },
      { status: 502 },
    );
  }

  return NextResponse.json({
    predictions: data.predictions ?? [],
  });
}
