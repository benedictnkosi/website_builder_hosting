export const FALLBACK_TLD_GROUPS: Record<string, string[]> = {
  Common: [
    "co.za",
    "com",
    "org",
    "joburg",
    "net",
    "eu.com",
    "gb.net",
    "uk.com",
    "uk.net",
    "de.com",
    "sa.com",
    "web.za",
    "durban",
    "capetown",
    "org.za",
    "net.za",
    "africa",
  ],
  "New GTLD": [
    "xyz",
    "wiki",
    "rest",
    "ink",
    "college",
    "bar",
    "host",
    "website",
    "site",
    "design",
    "fans",
    "feedback",
    "love",
    "online",
    "rent",
    "space",
    "tech",
    "store",
  ],
  Generic: [
    "biz",
    "info",
    "pw",
    "party",
    "bid",
    "trade",
    "webcam",
    "cricket",
    "science",
    "review",
    "faith",
    "accountant",
    "loan",
    "win",
    "racing",
    "download",
    "stream",
    "date",
  ],
  Country: ["co", "za.com", "us.com", "za.bz", "africa.com"],
  Mobile: ["mobi"],
};

export const DEFAULT_TLD = "co.za";

export const TLD_GROUP_ORDER = [
  "Common",
  "New GTLD",
  "Generic",
  "Country",
  "Mobile",
] as const;

export function flattenTldGroups(
  groups: Record<string, string[]>,
): { tld: string; category: string }[] {
  const seen = new Set<string>();
  const ordered: { tld: string; category: string }[] = [];

  for (const category of TLD_GROUP_ORDER) {
    for (const tld of groups[category] ?? []) {
      if (seen.has(tld)) continue;
      seen.add(tld);
      ordered.push({ tld, category });
    }
  }

  for (const [category, tlds] of Object.entries(groups)) {
    for (const tld of tlds) {
      if (seen.has(tld)) continue;
      seen.add(tld);
      ordered.push({ tld, category });
    }
  }

  return ordered;
}

export const FALLBACK_TLDS = flattenTldGroups(FALLBACK_TLD_GROUPS);

export function slugifyDomainName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

export function extractBusinessName(text: string): string {
  const named = text.match(
    /(?:called|named|business name[:\s]+|company called)\s+([^.\n,]+)/i,
  );
  if (named?.[1]) {
    return named[1].trim();
  }

  const firstLine = text.split("\n")[0]?.trim() ?? "";
  const firstSentence = firstLine.split(/(?<=\.)\s/)[0]?.trim() ?? firstLine;
  if (!firstSentence) {
    return "";
  }

  return firstSentence.replace(/\.$/, "").slice(0, 80).trim();
}

export function parseDomainQuery(
  value: string,
  knownTlds = FALLBACK_TLDS.map((item) => item.tld),
): {
  sld: string;
  preferredTld?: string;
} {
  const cleaned = value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");

  const tlds = [...knownTlds].sort((a, b) => b.length - a.length);
  for (const tld of tlds) {
    const suffix = `.${tld}`;
    if (cleaned.endsWith(suffix)) {
      return {
        sld: slugifyDomainName(cleaned.slice(0, -suffix.length)),
        preferredTld: tld,
      };
    }
  }

  return { sld: slugifyDomainName(cleaned) };
}
