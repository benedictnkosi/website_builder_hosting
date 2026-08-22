export const GUEST_ID_HEADER = "x-lulaweb-guest-id";
export const GUEST_ID_PREFIX = "g_";

export function isGuestUid(uid: string): boolean {
  return /^g_[a-zA-Z0-9_-]{8,120}$/.test(uid);
}
