import "server-only";

import { getServerIp } from "@/lib/domains-co-za";

const TYPE_A = 1;
const TYPE_CNAME = 5;
const MAX_CNAME_DEPTH = 4;

type DnsJsonResponse = {
  Status?: number;
  Answer?: Array<{
    name?: string;
    type?: number;
    data?: string;
  }>;
};

export type PublicDnsStatus = {
  ready: boolean;
  expectedIp: string;
  apex: string[];
  www: string[];
};

function normalizeHost(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/\.$/, "");
}

function normalizeIp(ip: string): string {
  return ip.trim().toLowerCase();
}

async function fetchDnsJson(url: string, headers?: HeadersInit): Promise<DnsJsonResponse | null> {
  try {
    const response = await fetch(url, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) return null;
    return (await response.json()) as DnsJsonResponse;
  } catch {
    return null;
  }
}

async function lookupViaGoogle(hostname: string): Promise<DnsJsonResponse | null> {
  const url = `https://dns.google/resolve?name=${encodeURIComponent(hostname)}&type=A`;
  return fetchDnsJson(url);
}

async function lookupViaCloudflare(hostname: string): Promise<DnsJsonResponse | null> {
  const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=A`;
  return fetchDnsJson(url, { Accept: "application/dns-json" });
}

function aRecordsFromAnswer(data: DnsJsonResponse | null): { addresses: string[]; cnames: string[] } {
  const addresses: string[] = [];
  const cnames: string[] = [];
  if (!data || data.Status !== 0 || !Array.isArray(data.Answer)) {
    return { addresses, cnames };
  }

  for (const answer of data.Answer) {
    const value = typeof answer.data === "string" ? answer.data.trim() : "";
    if (!value) continue;
    if (answer.type === TYPE_A) {
      addresses.push(normalizeIp(value));
    } else if (answer.type === TYPE_CNAME) {
      cnames.push(normalizeHost(value));
    }
  }

  return { addresses, cnames };
}

async function lookupARecords(hostname: string, depth = 0): Promise<string[]> {
  const normalized = normalizeHost(hostname);
  if (!normalized || depth > MAX_CNAME_DEPTH) return [];

  for (const lookup of [lookupViaGoogle, lookupViaCloudflare]) {
    const parsed = aRecordsFromAnswer(await lookup(normalized));
    if (parsed.addresses.length > 0) {
      return [...new Set(parsed.addresses)];
    }

    for (const cname of parsed.cnames) {
      if (cname === normalized) continue;
      const nested = await lookupARecords(cname, depth + 1);
      if (nested.length > 0) return nested;
    }
  }

  return [];
}

function pointsAtServer(addresses: string[], expectedIp: string): boolean {
  return addresses.some((address) => address === expectedIp);
}

export async function checkPublicDns(domain: string): Promise<PublicDnsStatus> {
  const expectedIp = normalizeIp(getServerIp());
  const normalizedDomain = normalizeHost(domain);
  const [apex, www] = await Promise.all([
    lookupARecords(normalizedDomain),
    lookupARecords(`www.${normalizedDomain}`),
  ]);

  return {
    ready: pointsAtServer(apex, expectedIp) && pointsAtServer(www, expectedIp),
    expectedIp,
    apex,
    www,
  };
}
