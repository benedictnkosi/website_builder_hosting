import { NextResponse } from "next/server";
import { readWebsitePreviewFile, websiteExists } from "@/lib/file-manager";
import {
  isSafeRelativePath,
  isValidWebsiteId,
  normalizeRelativePath,
} from "@/lib/validation";

const PREVIEW_HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "same-origin",
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
  if (!isValidWebsiteId(websiteId) || !(await websiteExists(websiteId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const filePath = rest.length === 0 ? "index.html" : rest.join("/");
  const normalized = normalizeRelativePath(filePath);

  if (
    !isSafeRelativePath(filePath) ||
    !isSafeRelativePath(normalized) ||
    normalized.split("/").some((segment) => segment.startsWith("."))
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const file = await readWebsitePreviewFile(websiteId, normalized);
  if (!file) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(file.body), {
    headers: {
      ...PREVIEW_HEADERS,
      "Content-Type": file.contentType,
    },
  });
}
