import "server-only";

import { readFileSync } from "node:fs";
import path from "node:path";
import type { WebsiteFile } from "./types";
import { normalizeRelativePath } from "./validation";

export const DEFAULT_FAVICON_PATH = "favicon.png";

const FAVICON_LINKS = `  <link rel="icon" href="${DEFAULT_FAVICON_PATH}" type="image/png">
  <link rel="apple-touch-icon" href="${DEFAULT_FAVICON_PATH}">`;

const ICON_REL_RE = /rel\s*=\s*["'](?:shortcut\s+)?(?:apple-touch-)?icon["']/i;

const FALLBACK_FAVICON_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAADr0lEQVR4AbxXX2hOYRx+3kMLRUz+pxAzQi6Ekgs17pQ/d0okV6K4cKFcql24mNralUTKHVbuWO1iKbQLIRvTrMSaZYmytfhez/M7fz7f6bzfNmvf1/t7z+/9/Xme55z3Pae+CLlf/erGQ0tWNrQuWbm5lzZG8zM0YRCroVXYOTpkAhYt27KpfsXmFl/yjwB3HkAjbR5tpkMYxHLnhS0OcaWgJkCBaE6p2TtcBFBHm61RJw5xiVMkJmBuVDrngOMK1MLEJU5xRdoXqjqnRS1NnOKOfKl0mMSz+dgJXzjqxM0tcE2F6VBw/wb4C/vhW47A3zkRm3zGwFyorTjumigA6zCVH8GN9OxeYNdaoH5BuUs+Y5451UxDyDoJ0GtSBivw/MldELiR9o/A3X4RV/V9BWQD3+IYc6pRrXrioqrzPAmoWmFATQ1WI2J37QmweH687huGe/ga2LAUGPoJ5VRjSfZYry3CU3UBfOwgkNrd9S6g64PcsomcIhTwR7frYjVWq5V6hSE/YFUF+GM7rM3u6s2Q+Zr8ke1wHbxzLWTaBl1TY631cJ1i0C0cYQFSrsOlfc3feQ7KtqFxeWVUPeoVhrAqs9kqKMDvXGNF7ulHu2ZT44rY7eUBjL3ynOaSSNqbYiXhiktQgB0slb4d1vx/lvbqkAYQwgL06Njkz+yBv9JUtuSw6dBl8aKYethLCOjVtGvBFBZQUDwbobCA0V/G5249h2vuLJtePWZ08LJ4UUw97GUpkGCZn5vCAvh1s9qtyaGzxTSntDfFKmgPCnAvP1u537fertmUfHiytZwtySuYy6W9KZZK8xYUgO6B+NFtWgYc2FjZxw+PDmFlMLdSj3r1+IWVS6fLsABWuAevOAP+9G5g2yrzs+mfD4/PfxlZaz0sTjHoFo6qAuwpdL63Rn/5QPYkdAAtqA9P8graWhPv3Grlq7fK3aukugBWuLs9gIDo66781YPAqoUAD5a2wUsEc/g+BuVUo6V6rNcW4UkCxsPpOCMgd/NZdiaMRF83bYOMZRZL9ly16mF4sjEuAYOTVVmej9Jd6oDA0fMpFmMJTjpojCmnGts6hqcwBinAd06hsFwiIa3dEJE7dQ9mEsbYNIgTPN8ZuSjiPyFMJJFaXibEHY1+6XvsPNprySwucYqbWwD8LkXtHrivRC1MXOIUlwn4MdLbX/oTXaGqGwzO5nZMiENc4iQXTIAcBUaH311ykeM/Jd/GWB9t0leUNVUHk8Iglm8TtjjExbiNvwAAAP//fxyF2wAAAAZJREFUAwCS938Uo92WUAAAAABJRU5ErkJggg==";

let cachedBytes: Buffer | undefined;

function loadDefaultFaviconBytes(): Buffer {
  if (cachedBytes) return cachedBytes;

  try {
    cachedBytes = readFileSync(
      path.join(process.cwd(), "assets", "default-favicon.png"),
    );
  } catch {
    cachedBytes = Buffer.from(FALLBACK_FAVICON_PNG_BASE64, "base64");
  }

  return cachedBytes;
}

export function getDefaultFaviconFile(): WebsiteFile {
  return {
    path: DEFAULT_FAVICON_PATH,
    content: loadDefaultFaviconBytes().toString("base64"),
    encoding: "base64",
  };
}

export function isDefaultFaviconRequest(filePath: string): boolean {
  const normalized = normalizeRelativePath(filePath).toLowerCase();
  return normalized === DEFAULT_FAVICON_PATH || normalized === "favicon.ico";
}

export function getDefaultFaviconPreview(): {
  body: Buffer;
  contentType: string;
} {
  return {
    body: loadDefaultFaviconBytes(),
    contentType: "image/png",
  };
}

export function htmlHasFaviconLink(html: string): boolean {
  return ICON_REL_RE.test(html);
}

export function injectDefaultFaviconLinks(html: string): string {
  if (htmlHasFaviconLink(html)) return html;
  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `${FAVICON_LINKS}\n</head>`);
  }
  return html;
}

function hasFaviconPng(files: WebsiteFile[]): boolean {
  return files.some(
    (file) =>
      normalizeRelativePath(file.path).toLowerCase() === DEFAULT_FAVICON_PATH,
  );
}

export function withDefaultFavicon(files: WebsiteFile[]): WebsiteFile[] {
  const result = files.map((file) => {
    if (file.encoding === "base64") return file;
    if (!file.path.toLowerCase().endsWith(".html")) return file;
    const content = injectDefaultFaviconLinks(file.content);
    if (content === file.content) return file;
    return { ...file, content };
  });

  if (!hasFaviconPng(result)) {
    result.push(getDefaultFaviconFile());
  }

  return result;
}
