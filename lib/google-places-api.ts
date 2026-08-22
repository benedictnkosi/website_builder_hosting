export function getGooglePlacesApiKey(): string | undefined {
  return (
    process.env.GOOGLE_PLACES_API_KEY ||
    process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
  );
}

export type GoogleAddressSuggestion = {
  description: string;
  place_id: string;
};

type PlacesPayload = {
  status?: string;
  predictions?: GoogleAddressSuggestion[];
  result?: { formatted_address?: string };
  error_message?: string;
};

async function placesJson(url: URL, action: string): Promise<PlacesPayload> {
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Google Places ${action} request failed.`);
  const data = (await response.json()) as PlacesPayload;
  if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    console.error("Google Places request failed", { action, status: data.status });
    throw new Error(data.error_message || `Google Places ${action} failed.`);
  }
  return data;
}

export async function searchSouthAfricanAddresses(
  input: string,
): Promise<GoogleAddressSuggestion[]> {
  const query = input.trim();
  if (query.length < 3) return [];
  const apiKey = getGooglePlacesApiKey();
  if (!apiKey) throw new Error("Google Places API key is not configured.");
  const url = new URL("https://maps.googleapis.com/maps/api/place/autocomplete/json");
  url.searchParams.set("input", query);
  url.searchParams.set("types", "address");
  url.searchParams.set("components", "country:za");
  url.searchParams.set("region", "za");
  url.searchParams.set("key", apiKey);
  return (await placesJson(url, "autocomplete")).predictions ?? [];
}

export async function getGoogleFormattedAddress(placeId: string): Promise<string> {
  const id = placeId.trim();
  if (!id) throw new Error("placeId is required.");
  const apiKey = getGooglePlacesApiKey();
  if (!apiKey) throw new Error("Google Places API key is not configured.");
  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  url.searchParams.set("place_id", id);
  url.searchParams.set("fields", "formatted_address");
  url.searchParams.set("key", apiKey);
  return (await placesJson(url, "details")).result?.formatted_address?.trim() ?? "";
}
