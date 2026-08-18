export const WEBSITE_FEE_ZAR = 100;

export type TldPrice = {
  tld: string;
  currency: string;
  registration: number;
  renewal: number;
  premium: number;
};

export type YearlyPlanPrice = TldPrice & {
  websiteFee: number;
  yearlyTotal: number;
};

export const FALLBACK_TLD_PRICES: Record<string, TldPrice> = {
  "co.za": {
    tld: "co.za",
    currency: "ZAR",
    registration: 82.5,
    renewal: 82.5,
    premium: 382.5,
  },
  com: {
    tld: "com",
    currency: "ZAR",
    registration: 305,
    renewal: 305,
    premium: 305,
  },
  org: {
    tld: "org",
    currency: "ZAR",
    registration: 200,
    renewal: 200,
    premium: 1400,
  },
  net: {
    tld: "net",
    currency: "ZAR",
    registration: 200,
    renewal: 200,
    premium: 1400,
  },
  xyz: {
    tld: "xyz",
    currency: "ZAR",
    registration: 200,
    renewal: 200,
    premium: 1400,
  },
};

export const DEFAULT_TLD_PRICE: TldPrice = {
  tld: "co.za",
  currency: "ZAR",
  registration: 200,
  renewal: 200,
  premium: 1400,
};

export function parseMoney(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value * 100) / 100;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/[^\d.-]/g, ""));
    if (Number.isFinite(parsed)) {
      return Math.round(parsed * 100) / 100;
    }
  }

  return 0;
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function formatZar(amount: number): string {
  return `R${roundMoney(amount).toFixed(2)}`;
}

export function buildYearlyPlan(
  price: TldPrice,
  options?: { premium?: boolean },
): YearlyPlanPrice {
  const registration = options?.premium ? price.premium || price.registration : price.registration;

  return {
    ...price,
    registration,
    websiteFee: WEBSITE_FEE_ZAR,
    yearlyTotal: roundMoney(registration + WEBSITE_FEE_ZAR),
  };
}

export function payfastAmount(amount: number): string {
  return roundMoney(amount).toFixed(2);
}
