export type BillingFrequency = "monthly" | "annual";

export const MONTHLY_PLAN_ZAR = 15;
export const ANNUAL_PLAN_MONTHLY_ZAR = 10;
export const ANNUAL_PLAN_ZAR = ANNUAL_PLAN_MONTHLY_ZAR * 12;

export const SUBSCRIPTION_TLD =
  (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_DOMAIN_TLD?.trim()) || "co.za";

export const SIGNUP_EDITS_GRANT = 4;
export const SUBSCRIPTION_EDITS_GRANT = 4;
export const GENERATE_EDITS_COST = 2;
export const EDIT_EDITS_COST = 1;

export type EditTopupPackageId = "one" | "three" | "five";

export type EditTopupPackage = {
  id: EditTopupPackageId;
  name: string;
  edits: number;
  amountZar: number;
  usage: string;
};

export const EDIT_TOPUP_PACKAGES: readonly EditTopupPackage[] = [
  {
    id: "one",
    name: "1 Edit",
    edits: 1,
    amountZar: 15,
    usage: "Good for 1 website change",
  },
  {
    id: "three",
    name: "3 Edits",
    edits: 3,
    amountZar: 35,
    usage: "Good for 3 changes or 1 full site generation + 1 change",
  },
  {
    id: "five",
    name: "5 Edits",
    edits: 5,
    amountZar: 50,
    usage: "Best value pack",
  },
];

export const DEFAULT_EDIT_TOPUP_PACKAGE_ID: EditTopupPackageId = "three";
export const EDIT_TOPUP_ZAR = EDIT_TOPUP_PACKAGES[0].amountZar;

export function isEditTopupPackageId(value: unknown): value is EditTopupPackageId {
  return value === "one" || value === "three" || value === "five";
}

export function editTopupPackage(id: unknown): EditTopupPackage | null {
  if (!isEditTopupPackageId(id)) return null;
  return EDIT_TOPUP_PACKAGES.find((pack) => pack.id === id) ?? null;
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function formatZar(amount: number): string {
  return `R${roundMoney(amount).toFixed(2)}`;
}

export function parseBillingFrequency(value: string): BillingFrequency {
  return value === "monthly" ? "monthly" : "annual";
}

export function isBillingFrequency(value: unknown): value is BillingFrequency {
  return value === "monthly" || value === "annual";
}

export function subscriptionAmountZar(frequency: BillingFrequency): number {
  return frequency === "annual" ? ANNUAL_PLAN_ZAR : MONTHLY_PLAN_ZAR;
}

export function payfastFrequencyCode(frequency: BillingFrequency): "3" | "6" {
  if (frequency === "annual") return "6";
  if (frequency === "monthly") return "3";
  throw new Error(`Unsupported PayFast billing frequency: ${String(frequency)}`);
}

export function formatBilledAmount(amountZar: number, frequency: BillingFrequency): string {
  return frequency === "annual"
    ? `${formatZar(amountZar)} / year`
    : `${formatZar(amountZar)} / month`;
}

export function formatEdits(edits: number): string {
  const count = Math.max(0, Math.round(edits));
  return `${count.toLocaleString("en-ZA")} ${count === 1 ? "Edit" : "Edits"}`;
}

export function formatEditsRemaining(edits: number): string {
  return `${formatEdits(edits)} Remaining`;
}

export function payfastAmount(amount: number): string {
  return roundMoney(amount).toFixed(2);
}
