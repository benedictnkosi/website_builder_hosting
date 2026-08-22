import { notifyEditsChanged } from "@/lib/edit-events";
import { getFirebaseAuth, isFirebaseClientConfigured } from "@/lib/firebase";
import { GUEST_ID_PREFIX, isGuestUid } from "@/lib/guest";
import { SIGNUP_EDITS_GRANT } from "@/lib/pricing";
import { loadBuilderSession } from "@/lib/builder-session";

const STORAGE_KEY = "lulaweb-guest-state";

export type GuestState = {
  guestId: string;
  editsRemaining: number;
  initialized: boolean;
  synced: boolean;
  websiteId: string;
  usageIds: string[];
};

export type GuestSyncPayload = {
  guestId: string;
  websiteId: string;
  editsRemaining: number;
  synced: boolean;
};

function emptyState(guestId: string): GuestState {
  return {
    guestId,
    editsRemaining: 0,
    initialized: false,
    synced: false,
    websiteId: "",
    usageIds: [],
  };
}

function createGuestId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${GUEST_ID_PREFIX}${hex}`;
}

function parseState(raw: string | null): GuestState | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Partial<GuestState>;
    const guestId = typeof data.guestId === "string" ? data.guestId : "";
    if (!isGuestUid(guestId)) return null;
    return {
      guestId,
      editsRemaining:
        typeof data.editsRemaining === "number" && Number.isFinite(data.editsRemaining)
          ? Math.max(0, Math.round(data.editsRemaining))
          : 0,
      initialized: data.initialized === true,
      synced: data.synced === true,
      websiteId: typeof data.websiteId === "string" ? data.websiteId : "",
      usageIds: Array.isArray(data.usageIds)
        ? data.usageIds.filter((item): item is string => typeof item === "string" && item.length > 0)
        : [],
    };
  } catch {
    return null;
  }
}

function hasSignedInUser(): boolean {
  if (typeof window === "undefined" || !isFirebaseClientConfigured()) return false;
  try {
    return Boolean(getFirebaseAuth().currentUser);
  } catch {
    return false;
  }
}

function persist(state: GuestState): GuestState {
  if (typeof window === "undefined") return state;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  return state;
}

function newGuestState(): GuestState {
  return {
    ...emptyState(createGuestId()),
    editsRemaining: SIGNUP_EDITS_GRANT,
    initialized: true,
  };
}

export function loadGuestState(): GuestState {
  if (typeof window === "undefined") return emptyState(`${GUEST_ID_PREFIX}pending`);
  const existing = parseState(localStorage.getItem(STORAGE_KEY));
  if (existing) return existing;
  return persist(newGuestState());
}

export function startFreshGuestSession(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
  persist(newGuestState());
  notifyEditsChanged();
}

export function ensureLocalCredits(): number {
  const state = loadGuestState();
  if (state.synced) return 0;
  if (state.initialized) return state.editsRemaining;
  const next = {
    ...state,
    editsRemaining: SIGNUP_EDITS_GRANT,
    initialized: true,
  };
  persist(next);
  notifyEditsChanged();
  return next.editsRemaining;
}

export function getOrCreateGuestId(): string {
  return loadGuestState().guestId;
}

export function getLocalEditsRemaining(): number {
  const state = loadGuestState();
  if (state.synced) return 0;
  if (!state.initialized) return ensureLocalCredits();
  return state.editsRemaining;
}

export function consumeLocalEdits(amount: number, usageId: string): number {
  if (hasSignedInUser()) return getLocalEditsRemaining();
  const state = loadGuestState();
  if (state.synced) return 0;
  if (!state.initialized) ensureLocalCredits();
  const current = loadGuestState();
  if (current.usageIds.includes(usageId)) return current.editsRemaining;
  const cost = Math.max(0, Math.round(amount));
  current.editsRemaining = Math.max(0, current.editsRemaining - cost);
  current.usageIds = [...current.usageIds, usageId].slice(-200);
  persist(current);
  notifyEditsChanged();
  return current.editsRemaining;
}

export function rememberGuestWebsite(websiteId: string): void {
  const trimmed = websiteId.trim();
  if (!trimmed) return;
  const state = loadGuestState();
  if (state.websiteId === trimmed) return;
  persist({ ...state, websiteId: trimmed });
}

export function markGuestSynced(): void {
  const state = loadGuestState();
  persist({
    ...state,
    synced: true,
    editsRemaining: 0,
  });
}

export function getGuestSyncPayload(): GuestSyncPayload {
  const state = loadGuestState();
  const session = typeof window === "undefined" ? null : loadBuilderSession();
  return {
    guestId: state.guestId,
    websiteId: state.websiteId || session?.websiteId || "",
    editsRemaining: state.synced ? 0 : state.initialized ? state.editsRemaining : SIGNUP_EDITS_GRANT,
    synced: state.synced,
  };
}
