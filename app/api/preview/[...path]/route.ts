import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getGeneratedSitesRoot } from "@/lib/file-manager";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const segments = (await params).path;

  if (!segments || segments.length < 2) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [websiteId, ...rest] = segments;
  const filePath = rest.length === 0 ? "index.html" : rest.join("/");

  const resolved = path.resolve(getGeneratedSitesRoot(), websiteId, filePath);
  const root = getGeneratedSitesRoot();

  if (!resolved.startsWith(root)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const content = await readFile(resolved);
    const ext = path.extname(resolved).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    return new NextResponse(content, {
      headers: { "Content-Type": contentType },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
