import "server-only";

import {
  DEFAULT_TLD,
  FALLBACK_TLD_GROUPS,
  FALLBACK_TLDS,
  flattenTldGroups,
  parseDomainQuery,
} from "@/lib/domain-name";
import {
  DEFAULT_TLD_PRICE,
  FALLBACK_TLD_PRICES,
  buildYearlyPlan,
  parseMoney,
  type TldPrice,
  type YearlyPlanPrice,
} from "@/lib/pricing";

const API_BASE = "https://api.domains.co.za/api";
const TLD_CACHE_MS = 60 * 60 * 1000;

export type DomainAvailability = {
  domain: string;
  sld: string;
  tld: string;
  category: string;
  available: boolean;
  premium: boolean;
  message: string;
};

type LoginResponse = {
  intReturnCode?: number;
  token?: string;
  strMessage?: string;
  strReason?: string;
};

type CachedToken = {
  token: string;
  expiresAt: number;
};

type CachedTlds = {
  tlds: { tld: string; category: string }[];
  expiresAt: number;
};

type CachedPrices = {
  prices: Record<string, TldPrice>;
  expiresAt: number;
};

let cachedToken: CachedToken | null = null;
let cachedTlds: CachedTlds | null = null;
let cachedPrices: CachedPrices | null = null;

function hasCredentials(): boolean {
  return Boolean(
    process.env.DOMAINS_CO_ZA_USERNAME?.trim() &&
      process.env.DOMAINS_CO_ZA_PASSWORD?.trim(),
  );
}

export function isMockDomainSearchEnabled(): boolean {
  return !hasCredentials();
}

function isTruthyFlag(value: unknown): boolean {
  return value === true || value === "true" || value === 1 || value === "1";
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error("domains.co.za returned a non-JSON response.");
  }
}

async function login(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  const username = process.env.DOMAINS_CO_ZA_USERNAME?.trim();
  const password = process.env.DOMAINS_CO_ZA_PASSWORD?.trim();
  const code = process.env.DOMAINS_CO_ZA_2FA_CODE?.trim();

  if (!username || !password) {
    throw new Error("Domain search is not configured.");
  }

  const formBody = new URLSearchParams();
  formBody.append("username", username);
  formBody.append("password", password);
  if (code) {
    formBody.append("code", code);
  }

  const response = await fetch(`${API_BASE}/login`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: formBody.toString(),
    cache: "no-store",
  });

  const data = (await readJson(response)) as LoginResponse;

  if (!response.ok || data.intReturnCode !== 1 || !data.token) {
    cachedToken = null;
    throw new Error(
      data.strReason || data.strMessage || "Could not sign in to domains.co.za.",
    );
  }

  cachedToken = {
    token: data.token,
    expiresAt: Date.now() + 50 * 60 * 1000,
  };

  return data.token;
}

async function authorizedGet(
  path: string,
  params?: URLSearchParams,
  retryOnUnauthorized = true,
): Promise<Record<string, unknown>> {
  return authorizedRequest("GET", path, params, retryOnUnauthorized);
}

async function authorizedPost(
  path: string,
  params: URLSearchParams,
  retryOnUnauthorized = true,
): Promise<Record<string, unknown>> {
  return authorizedRequest("POST", path, params, retryOnUnauthorized);
}

async function authorizedRequest(
  method: "GET" | "POST",
  path: string,
  params?: URLSearchParams,
  retryOnUnauthorized = true,
): Promise<Record<string, unknown>> {
  const token = await login();
  const query =
    method === "GET" && params && params.size > 0 ? `?${params.toString()}` : "";
  const response = await fetch(`${API_BASE}/${path}${query}`, {
    method,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...(method === "POST"
        ? { "Content-Type": "application/x-www-form-urlencoded" }
        : {}),
    },
    body: method === "POST" ? (params?.toString() ?? "") : undefined,
    cache: "no-store",
  });

  if (response.status === 401 && retryOnUnauthorized) {
    cachedToken = null;
    return authorizedRequest(method, path, params, false);
  }

  const data = await readJson(response);
  const code = returnCode(data);

  if (!response.ok && code === undefined) {
    throw new Error(apiError(data, "domains.co.za request failed."));
  }

  return data;
}

function returnCode(data: Record<string, unknown>): number | undefined {
  const value = data.intReturnCode;
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function apiError(data: Record<string, unknown>, fallback: string): string {
  if (typeof data.strReason === "string" && data.strReason.trim()) {
    return data.strReason;
  }
  if (typeof data.strEppReason === "string" && data.strEppReason.trim()) {
    return data.strEppReason;
  }
  if (typeof data.strMessage === "string" && data.strMessage.trim()) {
    return data.strMessage;
  }
  return fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getServerIp(): string {
  const ip = process.env.NEXT_PUBLIC_SERVER_IP?.trim();
  if (!ip) {
    throw new Error("NEXT_PUBLIC_SERVER_IP is not configured.");
  }
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip)) {
    throw new Error("NEXT_PUBLIC_SERVER_IP must be an IPv4 address.");
  }
  return ip;
}

export function splitRegisteredDomain(domain: string): { sld: string; tld: string } {
  const parsed = parseDomainQuery(domain);
  if (!parsed.sld || !parsed.preferredTld) {
    throw new Error("A valid domain with an extension is required.");
  }
  return { sld: parsed.sld, tld: parsed.preferredTld };
}

function parseTldGroups(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== "object") {
    return FALLBACK_TLD_GROUPS;
  }

  const groups: Record<string, string[]> = {};
  for (const [category, tlds] of Object.entries(value)) {
    if (!Array.isArray(tlds)) continue;
    groups[category] = tlds.filter(
      (tld): tld is string => typeof tld === "string" && tld.length > 0,
    );
  }

  return Object.keys(groups).length > 0 ? groups : FALLBACK_TLD_GROUPS;
}

export async function listSearchableTlds(): Promise<{ tld: string; category: string }[]> {
  return getSearchableTlds();
}

function parseTldPrice(tld: string, value: unknown): TldPrice | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const row = value as Record<string, unknown>;
  const registration = parseMoney(row.registration);
  if (registration <= 0) {
    return null;
  }

  return {
    tld,
    currency: typeof row.currency === "string" && row.currency.trim() ? row.currency : "ZAR",
    registration,
    renewal: parseMoney(row.renewal) || registration,
    premium: parseMoney(row.premium) || registration,
  };
}

async function getResellerPrices(): Promise<Record<string, TldPrice>> {
  if (isMockDomainSearchEnabled()) {
    return FALLBACK_TLD_PRICES;
  }

  if (cachedPrices && Date.now() < cachedPrices.expiresAt) {
    return cachedPrices.prices;
  }

  try {
    const data = await authorizedGet(
      "reseller/prices",
      new URLSearchParams({ format: "tld" }),
    );
    const arrPrices = data.arrPrices;
    const prices: Record<string, TldPrice> = {};

    if (arrPrices && typeof arrPrices === "object") {
      for (const [tld, value] of Object.entries(arrPrices)) {
        const parsed = parseTldPrice(tld, value);
        if (parsed) {
          prices[tld] = parsed;
        }
      }
    }

    if (Object.keys(prices).length > 0) {
      cachedPrices = {
        prices,
        expiresAt: Date.now() + TLD_CACHE_MS,
      };
      return prices;
    }
  } catch {
    // Fall through to cached or fallback prices.
  }

  return cachedPrices?.prices ?? FALLBACK_TLD_PRICES;
}

export async function getTldPrice(tld: string): Promise<TldPrice> {
  const prices = await getResellerPrices();
  return (
    prices[tld] ?? {
      ...DEFAULT_TLD_PRICE,
      tld,
    }
  );
}

export async function getYearlyPlanPrice(
  tld: string,
  options?: { premium?: boolean },
): Promise<YearlyPlanPrice> {
  const price = await getTldPrice(tld);
  return buildYearlyPlan(price, options);
}

async function getSearchableTlds(): Promise<{ tld: string; category: string }[]> {
  if (isMockDomainSearchEnabled()) {
    return FALLBACK_TLDS;
  }

  if (cachedTlds && Date.now() < cachedTlds.expiresAt) {
    return cachedTlds.tlds;
  }

  try {
    const data = await authorizedGet("domain/tlds");
    const tlds = flattenTldGroups(parseTldGroups(data.arrTLDs));
    cachedTlds = {
      tlds,
      expiresAt: Date.now() + TLD_CACHE_MS,
    };
    return tlds;
  } catch {
    return FALLBACK_TLDS;
  }
}

async function checkLiveDomain(
  sld: string,
  tld: string,
  category: string,
): Promise<DomainAvailability> {
  const data = await authorizedGet(
    "domain/check",
    new URLSearchParams({ sld, tld }),
  );

  return {
    domain: `${sld}.${tld}`,
    sld,
    tld,
    category,
    available: isTruthyFlag(data.isAvailable),
    premium: isTruthyFlag(data.isPremium),
    message:
      (typeof data.strReason === "string" && data.strReason) ||
      (typeof data.strMessage === "string" && data.strMessage) ||
      "",
  };
}

function mockAvailability(
  sld: string,
  tld: string,
  category: string,
): DomainAvailability {
  const taken = tld === "com" || (tld === "co.za" && sld.length < 6);
  return {
    domain: `${sld}.${tld}`,
    sld,
    tld,
    category,
    available: !taken,
    premium: false,
    message: taken ? "Domain Unavailable" : "Domain Available",
  };
}

export async function searchDomainAvailability(
  query: string,
  selectedTld = DEFAULT_TLD,
): Promise<{
  sld: string;
  results: DomainAvailability[];
  mocked: boolean;
  price: YearlyPlanPrice;
}> {
  const searchableTlds = await getSearchableTlds();
  const knownTlds = searchableTlds.map((item) => item.tld);
  const parsed = parseDomainQuery(query, knownTlds);
  const sld = parsed.sld;
  const tld = selectedTld || parsed.preferredTld || DEFAULT_TLD;

  if (!sld || sld.length < 2) {
    throw new Error("Enter at least 2 letters for the domain name.");
  }

  const match =
    searchableTlds.find((item) => item.tld === tld) ?? {
      tld,
      category: "Common",
    };

  if (isMockDomainSearchEnabled()) {
    const result = mockAvailability(sld, match.tld, match.category);
    return {
      sld,
      mocked: true,
      results: [result],
      price: await getYearlyPlanPrice(match.tld, { premium: result.premium }),
    };
  }

  const result = await checkLiveDomain(sld, match.tld, match.category);
  return {
    sld,
    mocked: false,
    results: [result],
    price: await getYearlyPlanPrice(match.tld, { premium: result.premium }),
  };
}

async function getDefaultRegistrantTemplateId(): Promise<string | null> {
  const envTemplate = process.env.DOMAINS_CO_ZA_REGISTRANT_TEMPLATE?.trim();
  if (envTemplate) {
    return envTemplate;
  }

  try {
    const data = await authorizedGet(
      "template/contact",
      new URLSearchParams({
        default: "true",
        type: "registrant",
      }),
    );
    const templates = data.arrTemplates;
    if (!Array.isArray(templates) || templates.length === 0) {
      return null;
    }
    const first = templates[0];
    if (!first || typeof first !== "object") {
      return null;
    }
    const id = (first as { strTemplateId?: unknown }).strTemplateId;
    return typeof id === "string" && id.trim() ? id.trim() : null;
  } catch {
    return null;
  }
}

function appendRegistrantContact(params: URLSearchParams): void {
  const fields: Record<string, string | undefined> = {
    registrantName: process.env.DOMAINS_CO_ZA_REGISTRANT_NAME,
    registrantEmail: process.env.DOMAINS_CO_ZA_REGISTRANT_EMAIL,
    registrantCountry: process.env.DOMAINS_CO_ZA_REGISTRANT_COUNTRY || "ZA",
    registrantProvince: process.env.DOMAINS_CO_ZA_REGISTRANT_PROVINCE,
    registrantContactNumber: process.env.DOMAINS_CO_ZA_REGISTRANT_PHONE,
    registrantPostalCode: process.env.DOMAINS_CO_ZA_REGISTRANT_POSTAL_CODE,
    registrantAddress1: process.env.DOMAINS_CO_ZA_REGISTRANT_ADDRESS,
    registrantCity: process.env.DOMAINS_CO_ZA_REGISTRANT_CITY,
  };

  for (const [key, value] of Object.entries(fields)) {
    if (value?.trim()) {
      params.set(key, value.trim());
    }
  }
}

async function registerDomain(sld: string, tld: string): Promise<void> {
  const params = new URLSearchParams({
    sld,
    tld,
    period: "1",
    dns: "managed",
  });

  const templateId = await getDefaultRegistrantTemplateId();
  if (templateId) {
    params.set("registrantTemplate", templateId);
  } else {
    appendRegistrantContact(params);
    if (!params.get("registrantName") || !params.get("registrantEmail")) {
      throw new Error(
        "No default registrant contact template found. Set DOMAINS_CO_ZA_REGISTRANT_NAME and DOMAINS_CO_ZA_REGISTRANT_EMAIL.",
      );
    }
  }

  const data = await authorizedPost("domain", params);
  const code = returnCode(data);

  if (code === 1 || code === 2 || code === 13) {
    return;
  }

  throw new Error(apiError(data, "Could not register the domain."));
}

function isDomainCreated(data: Record<string, unknown>): boolean {
  const code = returnCode(data);
  if (code !== 1 && code !== 13) {
    return false;
  }

  const status = String(data.strStatus ?? "").toLowerCase();
  if (!status) {
    return true;
  }

  return status.includes("ok") && !status.includes("pending");
}

async function waitForDomain(sld: string, tld: string): Promise<void> {
  const deadline = Date.now() + 90_000;
  let lastError = "Timed out waiting for domain registration.";

  while (Date.now() < deadline) {
    const data = await authorizedGet(
      "domain",
      new URLSearchParams({ sld, tld }),
    );
    const code = returnCode(data);

    if (isDomainCreated(data)) {
      return;
    }

    if (code === 11 || code === 2 || code === 0 || code === 1) {
      lastError = apiError(data, "Domain registration is still pending.");
      await sleep(2000);
      continue;
    }

    throw new Error(apiError(data, "Could not confirm domain registration."));
  }

  throw new Error(lastError);
}

async function enableManagedDns(sld: string, tld: string): Promise<void> {
  const data = await authorizedPost(
    "domain/ns",
    new URLSearchParams({
      sld,
      tld,
      dns: "managed",
    }),
  );
  const code = returnCode(data);
  if (code === 1 || code === 2 || code === 12) {
    return;
  }

  const message = apiError(data, "").toLowerCase();
  if (message.includes("managed") || message.includes("already")) {
    return;
  }

  throw new Error(apiError(data, "Could not enable managed DNS."));
}

async function updateDomainDns(
  sld: string,
  tld: string,
  ip: string,
): Promise<void> {
  const params = new URLSearchParams({
    sld,
    tld,
    type1: "A",
    content1: ip,
    type2: "CNAME",
    name2: "www",
    content2: `${sld}.${tld}`,
  });

  const data = await authorizedPost("domain/dns", params);
  const code = returnCode(data);
  if (code === 1 || code === 2) {
    return;
  }

  throw new Error(apiError(data, "Could not update domain DNS records."));
}

export async function provisionDomain(domain: string): Promise<{
  sld: string;
  tld: string;
  domain: string;
}> {
  if (isMockDomainSearchEnabled()) {
    throw new Error("Domain registration is not configured.");
  }

  const { sld, tld } = splitRegisteredDomain(domain);
  const ip = getServerIp();

  await registerDomain(sld, tld);
  await waitForDomain(sld, tld);
  await enableManagedDns(sld, tld);
  await updateDomainDns(sld, tld, ip);

  return { sld, tld, domain: `${sld}.${tld}` };
}
