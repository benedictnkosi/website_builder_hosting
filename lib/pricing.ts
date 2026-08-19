export const MONTHLY_SUBSCRIPTION_ZAR = 19;
export const SUBSCRIPTION_TLD =
  (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_DOMAIN_TLD?.trim()) || "co.za";

export const SIGNUP_TOKEN_GRANT = 20_000;
export const SUBSCRIPTION_TOKEN_GRANT = 20_000;
export const TOKEN_TOPUP_ZAR = 5;
export const TOKEN_TOPUP_TOKENS = 100_000;
export const GENERATE_MIN_TOKENS = 500;
export const EDIT_MIN_TOKENS = 200;
export const CHAT_MIN_TOKENS = 50;

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function formatZar(amount: number): string {
  return `R${roundMoney(amount).toFixed(2)}`;
}

export function formatTokenCount(value: number): string {
  return Math.max(0, Math.round(value)).toLocaleString("en-ZA");
}

export function payfastAmount(amount: number): string {
  return roundMoney(amount).toFixed(2);
}
