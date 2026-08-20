export const MOCK_AI_QUERY_PARAM = "mockai";
export const MOCK_AI_HEADER = "x-lulaweb-mock-ai";
export const MOCK_AI_COOKIE = "lulaweb-mock-ai";
export const MOCK_AI_STORAGE_KEY = "lulaweb-mock-ai";

export function parseMockAiFlag(value: string | null | undefined): boolean | undefined {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "false" || normalized === "0") return false;
  if (normalized === "true" || normalized === "1") return true;
  return undefined;
}

export function mockAiFlagFromSearch(search: string): boolean | undefined {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return parseMockAiFlag(params.get(MOCK_AI_QUERY_PARAM));
}

export function persistMockAiPreference(enabled: boolean): void {
  if (typeof window === "undefined") return;
  const value = enabled ? "true" : "false";
  sessionStorage.setItem(MOCK_AI_STORAGE_KEY, value);
  document.cookie = `${MOCK_AI_COOKIE}=${value}; path=/; SameSite=Lax`;
}

export function syncMockAiPreferenceFromUrl(): boolean | undefined {
  if (typeof window === "undefined") return undefined;
  const fromUrl = mockAiFlagFromSearch(window.location.search);
  if (fromUrl !== undefined) {
    persistMockAiPreference(fromUrl);
    return fromUrl;
  }

  const stored = parseMockAiFlag(sessionStorage.getItem(MOCK_AI_STORAGE_KEY));
  if (stored !== undefined) {
    persistMockAiPreference(stored);
    return stored;
  }

  return parseMockAiFlag(
    document.cookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${MOCK_AI_COOKIE}=`))
      ?.slice(MOCK_AI_COOKIE.length + 1),
  );
}

export function applyMockAiHeaders(headers: Headers): void {
  const flag = syncMockAiPreferenceFromUrl();
  if (flag === undefined) return;
  headers.set(MOCK_AI_HEADER, flag ? "true" : "false");
}
