import "server-only";

import { parseDomainQuery } from "@/lib/domain-name";
import { SUBSCRIPTION_TLD } from "@/lib/pricing";

const LIVE_API_BASE = "https://api.domains.co.za/api";
const DEV_API_BASE = "https://lapi-dev.domains.co.za/api";

function getApiBase(): string {
  const configured = process.env.DOMAINS_CO_ZA_API_BASE?.trim().replace(/\/$/, "");
  if (configured) return configured;
  return process.env.NODE_ENV === "development" ? DEV_API_BASE : LIVE_API_BASE;
}

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

let cachedToken: CachedToken | null = null;

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

function redactDomainsPayload(data: Record<string, unknown>): Record<string, unknown> {
  const redacted: Record<string, unknown> = { ...data };
  if (typeof redacted.token === "string") {
    redacted.token = "[redacted]";
  }
  return redacted;
}

function logDomainsResponse(
  method: string,
  path: string,
  httpStatus: number,
  data: Record<string, unknown>,
) {
  console.info("domains.co.za response", {
    method,
    path,
    httpStatus,
    intReturnCode: data.intReturnCode,
    strMessage: data.strMessage,
    strReason: data.strReason,
    strEppMessage: data.strEppMessage,
    strEppReason: data.strEppReason,
    strStatus: data.strStatus,
    strDomainName: data.strDomainName,
    body: redactDomainsPayload(data),
  });
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

  const response = await fetch(`${getApiBase()}/login`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: formBody.toString(),
    cache: "no-store",
  });

  const data = (await readJson(response)) as LoginResponse;
  logDomainsResponse("POST", "login", response.status, data as Record<string, unknown>);

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
  const response = await fetch(`${getApiBase()}/${path}${query}`, {
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
  logDomainsResponse(method, path, response.status, data);
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
  for (const key of ["strReason", "strEppReason", "strMessage"] as const) {
    const value = data[key];
    if (typeof value !== "string" || !value.trim()) continue;
    if (isGenericApiMessage(value)) continue;
    return value.trim();
  }
  return fallback;
}

function isGenericApiMessage(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    normalized === "ok" ||
    normalized === "success" ||
    normalized === "successful" ||
    normalized.startsWith("successful action")
  );
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
  const parsed = parseDomainQuery(domain, [SUBSCRIPTION_TLD]);
  if (!parsed.sld || parsed.preferredTld !== SUBSCRIPTION_TLD) {
    throw new Error("A valid .co.za domain is required.");
  }
  return { sld: parsed.sld, tld: SUBSCRIPTION_TLD };
}

export async function listSearchableTlds(): Promise<{ tld: string; category: string }[]> {
  return [{ tld: SUBSCRIPTION_TLD, category: "Common" }];
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
): Promise<{
  sld: string;
  results: DomainAvailability[];
  mocked: boolean;
}> {
  const parsed = parseDomainQuery(query, [SUBSCRIPTION_TLD]);
  const sld = parsed.sld;
  const tld = SUBSCRIPTION_TLD;

  if (!sld || sld.length < 2) {
    throw new Error("Enter at least 2 letters for the domain name.");
  }

  if (isMockDomainSearchEnabled()) {
    const result = mockAvailability(sld, tld, "Common");
    return {
      sld,
      mocked: true,
      results: [result],
    };
  }

  const result = await checkLiveDomain(sld, tld, "Common");
  return {
    sld,
    mocked: false,
    results: [result],
  };
}

function contactFromTemplateList(templates: unknown): Record<string, string> {
  if (!Array.isArray(templates)) return {};
  const records = templates.filter(
    (item): item is Record<string, unknown> => Boolean(item) && typeof item === "object",
  );
  const match =
    records.find((item) => item.strType === "registrant") ??
    records.find((item) => item.strType === "all") ??
    records[0];
  const contact = match?.arrContact;
  if (!contact || typeof contact !== "object") return {};

  const fields = contact as Record<string, unknown>;
  const mapped: Record<string, string> = {};
  const pairs: Array<[string, string]> = [
    ["registrantName", "name"],
    ["registrantEmail", "email"],
    ["registrantCountry", "country"],
    ["registrantProvince", "province"],
    ["registrantContactNumber", "phone"],
    ["registrantPostalCode", "postal"],
    ["registrantAddress1", "address1"],
    ["registrantCity", "city"],
  ];
  for (const [param, key] of pairs) {
    const value = fields[key];
    if (typeof value === "string" && value.trim()) {
      mapped[param] = value.trim();
    }
  }
  return mapped;
}

function envRegistrantContact(): Record<string, string> {
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
  const mapped: Record<string, string> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value?.trim()) mapped[key] = value.trim();
  }
  return mapped;
}

async function loadRegistrantContact(): Promise<Record<string, string>> {
  const fromEnv = envRegistrantContact();
  if (fromEnv.registrantName && fromEnv.registrantEmail) {
    return fromEnv;
  }

  try {
    const data = await authorizedGet(
      "template/contact",
      new URLSearchParams({
        default: "true",
        type: "registrant",
        list: "full",
      }),
    );
    const fromDefault = contactFromTemplateList(data.arrTemplates);
    const merged = { ...fromDefault, ...fromEnv };
    if (merged.registrantName && merged.registrantEmail) {
      return merged;
    }

    const all = await authorizedGet(
      "template/contact",
      new URLSearchParams({ list: "full" }),
    );
    return { ...contactFromTemplateList(all.arrTemplates), ...fromEnv };
  } catch {
    return fromEnv;
  }
}

function appendRegistrantContact(
  params: URLSearchParams,
  contact: Record<string, string>,
): void {
  for (const [key, value] of Object.entries(contact)) {
    if (value.trim()) params.set(key, value.trim());
  }
}

async function registerDomain(sld: string, tld: string): Promise<void> {
  const params = new URLSearchParams({
    sld,
    tld,
    period: "1",
    dns: "managed",
  });

  const contact = await loadRegistrantContact();
  appendRegistrantContact(params, contact);
  if (!params.get("registrantName") || !params.get("registrantEmail")) {
    throw new Error(
      "No default registrant contact template found. Set DOMAINS_CO_ZA_REGISTRANT_NAME and DOMAINS_CO_ZA_REGISTRANT_EMAIL.",
    );
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

  const name = String(data.strDomainName ?? "").trim();
  if (!name) {
    return false;
  }

  const status = `${data.strStatus ?? ""} ${data.strEppStatus ?? ""}`.toLowerCase();
  return !status.includes("pendingcreate") && !status.includes("pending create");
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
