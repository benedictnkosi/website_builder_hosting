export const TOKENS_CHANGED_EVENT = "lulaweb:tokens";
export const TOKENS_TOPUP_EVENT = "lulaweb:topup";

export function notifyTokensChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(TOKENS_CHANGED_EVENT));
}

export function openTokenTopup() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(TOKENS_TOPUP_EVENT));
}
