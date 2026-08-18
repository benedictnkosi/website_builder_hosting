export type BuilderSession = {
  websiteId: string;
  businessName: string;
  businessDescription: string;
};

const SESSION_KEY = "website-builder-session";

export function saveBuilderSession(session: BuilderSession): void {
  if (typeof window === "undefined") return;
  const payload = JSON.stringify(session);
  sessionStorage.setItem(SESSION_KEY, payload);
  localStorage.setItem(SESSION_KEY, payload);
}

export function loadBuilderSession(): BuilderSession | null {
  if (typeof window === "undefined") return null;

  const raw =
    sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY);
  if (!raw) return null;

  try {
    const data = JSON.parse(raw) as BuilderSession;
    if (
      typeof data?.websiteId === "string" &&
      data.websiteId &&
      typeof data.businessName === "string" &&
      typeof data.businessDescription === "string"
    ) {
      return data;
    }
  } catch {
    return null;
  }

  return null;
}

export function clearBuilderSession(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(SESSION_KEY);
}
