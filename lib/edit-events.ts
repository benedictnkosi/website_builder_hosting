export const EDITS_CHANGED_EVENT = "lulaweb:edits";
export const EDITS_TOPUP_EVENT = "lulaweb:edits-topup";

export function notifyEditsChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(EDITS_CHANGED_EVENT));
}

export function openEditTopup() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(EDITS_TOPUP_EVENT));
}
