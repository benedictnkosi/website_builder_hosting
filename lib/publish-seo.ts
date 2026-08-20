import "server-only";

import type { AuthUser } from "@/lib/auth-server";
import { readEditableWebsiteFiles, updateWebsiteFiles } from "@/lib/file-manager";
import { isMockAiEnabled, mockDelay } from "@/lib/mock-ai";
import { runForegroundStructuredResponse } from "@/lib/openai";
import { readWebsiteMeta, writeWebsiteMeta } from "@/lib/sites";
import { readSubscription } from "@/lib/subscription";
import { GeneratorError } from "@/lib/validation";

const OPENAI_MODEL = "gpt-5.5";

const SEO_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["html"],
  properties: {
    html: {
      type: "string",
      description: "Full updated index.html with production SEO for the live domain.",
    },
  },
} as const;

const SEO_INSTRUCTION = `You are an on-page SEO specialist for a static HTML website that is about to go live.

You will receive the current index.html and the live origin (https://example.co.za). Return the FULL updated index.html.

Required updates:
- <link rel="canonical" href="{origin}/">
- Open Graph og:url set to {origin}/
- Convert relative og:image and twitter:image values to absolute URLs under {origin}/
- Add <link rel="sitemap" type="application/xml" href="{origin}/sitemap.xml">
- In JSON-LD, set url to {origin}/ when JSON-LD is present. Do not add FAQPage.
- Keep <meta name="robots" content="index, follow">.
- Keep existing favicon and apple-touch-icon links.

You may tighten the title (50-60 characters) and meta description (140-160 characters) using only facts already in the HTML. Include the business name, primary service, and location when those are present.

Do not:
- Invent reviews, ratings, prices, licences, credentials, services, or contact details
- Change visible layout, CSS/JS file names, section ids, or form behaviour
- Add hidden text, keyword stuffing, extra pages, or an FAQ section
- Remove existing content the business provided

Return ONLY the structured output.`;

export function siteOrigin(domain: string): string {
  const host = domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
  return `https://${host}`;
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function toAbsoluteUrl(origin: string, value: string): string {
  const trimmed = value.trim();
  if (!trimmed || /^(https?:\/\/|data:|\/\/)/i.test(trimmed)) {
    return trimmed;
  }
  const path = trimmed.replace(/^\.\//, "").replace(/^\/+/, "");
  return `${origin}/${path}`;
}

function upsertHeadTag(html: string, pattern: RegExp, tag: string): string {
  if (pattern.test(html)) {
    return html.replace(pattern, tag);
  }
  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `  ${tag}\n</head>`);
  }
  return `${tag}\n${html}`;
}

function upsertNamedMeta(html: string, name: string, content: string): string {
  const pattern = new RegExp(
    `<meta\\s+[^>]*name=["']${name}["'][^>]*>`,
    "i",
  );
  return upsertHeadTag(
    html,
    pattern,
    `<meta name="${name}" content="${escapeAttr(content)}">`,
  );
}

function upsertPropertyMeta(html: string, property: string, content: string): string {
  const pattern = new RegExp(
    `<meta\\s+[^>]*property=["']${property}["'][^>]*>`,
    "i",
  );
  return upsertHeadTag(
    html,
    pattern,
    `<meta property="${property}" content="${escapeAttr(content)}">`,
  );
}

function absolutizeMetaContent(
  html: string,
  origin: string,
  attribute: "name" | "property",
  key: string,
): string {
  const pattern = new RegExp(
    `(<meta\\s+[^>]*${attribute}=["']${key}["'][^>]*content=["'])([^"']*)(["'][^>]*>)`,
    "i",
  );
  return html.replace(pattern, (_match, prefix: string, value: string, suffix: string) => {
    return `${prefix}${toAbsoluteUrl(origin, value)}${suffix}`;
  });
}

function withJsonLdUrl(html: string, origin: string): string {
  return html.replace(
    /(<script type="application\/ld\+json">)([\s\S]*?)(<\/script>)/i,
    (match, open: string, raw: string, close: string) => {
      try {
        const data = JSON.parse(raw) as Record<string, unknown>;
        if (!data || typeof data !== "object" || Array.isArray(data)) {
          return match;
        }
        if (typeof data.url !== "string" || !data.url.trim()) {
          data.url = `${origin}/`;
        }
        return `${open}${JSON.stringify(data)}${close}`;
      } catch {
        return match;
      }
    },
  );
}

export function applyDomainSeoToHtml(html: string, origin: string): string {
  const home = `${origin}/`;
  let next = html;
  next = upsertHeadTag(
    next,
    /<link\s+[^>]*rel=["']canonical["'][^>]*>/i,
    `<link rel="canonical" href="${escapeAttr(home)}">`,
  );
  next = upsertPropertyMeta(next, "og:url", home);
  next = upsertHeadTag(
    next,
    /<link\s+[^>]*rel=["']sitemap["'][^>]*>/i,
    `<link rel="sitemap" type="application/xml" href="${escapeAttr(`${origin}/sitemap.xml`)}">`,
  );
  next = upsertNamedMeta(next, "robots", "index, follow");
  next = absolutizeMetaContent(next, origin, "property", "og:image");
  next = absolutizeMetaContent(next, origin, "name", "twitter:image");
  next = withJsonLdUrl(next, origin);
  return next;
}

function robotsTxt(origin: string): string {
  return `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`;
}

function sitemapXml(origin: string, lastmod: string): string {
  const day = lastmod.slice(0, 10);
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${origin}/</loc>
    <lastmod>${day}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
`;
}

function looksLikeHtml(value: string): boolean {
  const trimmed = value.trim();
  return (
    trimmed.length > 80 &&
    /<html[\s>]/i.test(trimmed) &&
    /<\/html>/i.test(trimmed)
  );
}

function htmlFromAi(outputText: string): string {
  const parsed = JSON.parse(outputText) as { html?: string };
  if (!parsed || typeof parsed.html !== "string") {
    throw new GeneratorError("AI did not return updated HTML.", 502);
  }
  return parsed.html;
}

async function optimizeHtmlSeo(html: string, origin: string): Promise<string> {
  if (isMockAiEnabled()) {
    await mockDelay(500);
    return applyDomainSeoToHtml(html, origin);
  }

  const outputText = await runForegroundStructuredResponse({
    model: OPENAI_MODEL,
    maxOutputTokens: 16384,
    developer: SEO_INSTRUCTION,
    user: `Live origin: ${origin}\n\nCurrent index.html:\n\n${html}`,
    schemaName: "publish_seo_html",
    schema: SEO_SCHEMA as unknown as Record<string, unknown>,
  });

  const updated = htmlFromAi(outputText);
  if (
    !looksLikeHtml(updated) ||
    !updated.includes(origin) ||
    updated.length < Math.floor(html.length * 0.5)
  ) {
    return applyDomainSeoToHtml(html, origin);
  }

  return applyDomainSeoToHtml(updated, origin);
}

export async function prepareFirstPublishSeo(input: {
  websiteId: string;
  domain: string;
  user: AuthUser;
}): Promise<{ applied: boolean }> {
  const meta = await readWebsiteMeta(input.websiteId, input.user);
  if (!meta) {
    throw new GeneratorError("Website not found.", 404);
  }
  if (meta.seoOptimizedAt) {
    return { applied: false };
  }

  const origin = siteOrigin(input.domain);
  const files = await readEditableWebsiteFiles(input.websiteId, input.user.idToken);
  const index = files.find(
    (file) => file.path === "index.html" || file.path.endsWith("/index.html"),
  );
  if (!index) {
    throw new GeneratorError("index.html is missing.", 404);
  }

  const optimizedHtml = await optimizeHtmlSeo(index.content, origin);
  const now = new Date().toISOString();

  await updateWebsiteFiles(
    input.websiteId,
    [
      { path: "robots.txt", content: robotsTxt(origin) },
      { path: "sitemap.xml", content: sitemapXml(origin, now) },
      { path: "index.html", content: optimizedHtml },
    ],
    input.user.idToken,
  );

  const subscription = await readSubscription(input.websiteId);
  await writeWebsiteMeta(
    {
      ...meta,
      seoOptimizedAt: now,
      updatedAt: now,
    },
    input.user,
    subscription,
  );

  return { applied: true };
}
