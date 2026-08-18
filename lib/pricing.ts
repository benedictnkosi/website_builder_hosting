export const MONTHLY_SUBSCRIPTION_ZAR = 19;
export const SUBSCRIPTION_TLD = "co.za";

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function formatZar(amount: number): string {
  return `R${roundMoney(amount).toFixed(2)}`;
}
  
export function payfastAmount(amount: number): string {
  return roundMoney(amount).toFixed(2);
}
