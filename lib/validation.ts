import path from "node:path";
import type { GeneratedWebsite, WebsiteFile } from "./types";

export const REQUIRED_FILES = ["index.html", "styles.css", "script.js"] as const;

export class GeneratorError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "GeneratorError";
    this.statusCode = statusCode;
  }
}

export function isValidWebsiteId(websiteId: string): boolean {
  return /^[a-zA-Z0-9_-]{1,64}$/.test(websiteId);
}

export function normalizeRelativePath(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/^\/+/, "").replace(/^\.\//, "");
}

export function isSafeRelativePath(filePath: string): boolean {
  if (typeof filePath !== "string" || filePath.trim() === "") {
    return false;
  }

  if (filePath.includes("\0")) {
    return false;
  }

  const trimmed = filePath.trim();

  if (path.isAbsolute(trimmed)) {
    return false;
  }

  if (
    trimmed.startsWith("/") ||
    trimmed.startsWith("\\") ||
    /^[a-zA-Z]:[\\/]/.test(trimmed)
  ) {
    return false;
  }

  const normalized = normalizeRelativePath(trimmed);

  if (!normalized || normalized.endsWith("/")) {
    return false;
  }

  const segments = normalized.split("/");

  if (
    segments.some(
      (segment) => segment === "" || segment === "." || segment === "..",
    )
  ) {
    return false;
  }

  return true;
}

export function assertPathInsideDirectory(
  directory: string,
  candidatePath: string,
): string {
  const resolvedDirectory = path.resolve(directory);
  const resolvedCandidate = path.resolve(candidatePath);
  const relative = path.relative(resolvedDirectory, resolvedCandidate);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new GeneratorError(
      `Unsafe file path: ${candidatePath} is outside the generated website directory.`,
    );
  }

  return resolvedCandidate;
}

export function validateGeneratedWebsite(
  website: GeneratedWebsite,
): WebsiteFile[] {
  if (!website || !Array.isArray(website.files)) {
    throw new GeneratorError("OpenAI did not return a files array.");
  }

  if (website.files.length === 0) {
    throw new GeneratorError("At least one file is required.");
  }

  const normalizedFiles: WebsiteFile[] = website.files.map((file, index) => {
    if (!file || typeof file.path !== "string" || typeof file.content !== "string") {
      throw new GeneratorError(
        `File at index ${index} is missing a valid path or content.`,
      );
    }

    const normalizedPath = normalizeRelativePath(file.path.trim());

    if (!isSafeRelativePath(file.path) || !isSafeRelativePath(normalizedPath)) {
      throw new GeneratorError(
        `Unsafe file path rejected: ${file.path}. Paths must stay inside the generated website directory.`,
      );
    }

    return {
      path: normalizedPath,
      content: file.content,
    };
  });

  const allowedPaths = new Set<string>(REQUIRED_FILES);
  const unexpected = normalizedFiles.filter((file) => !allowedPaths.has(file.path));

  if (unexpected.length > 0) {
    console.warn(
      "Dropping unexpected generated files:",
      unexpected.map((file) => file.path),
    );
  }

  const allowedFiles = normalizedFiles.filter((file) => allowedPaths.has(file.path));
  const seen = new Set<string>();

  for (const file of allowedFiles) {
    const key = file.path.toLowerCase();
    if (seen.has(key)) {
      throw new GeneratorError(`Duplicate file path: ${file.path}`);
    }
    seen.add(key);
  }

  const paths = new Set(allowedFiles.map((file) => file.path));
  const missing = REQUIRED_FILES.filter((required) => !paths.has(required));

  if (missing.length > 0) {
    throw new GeneratorError(
      `Missing required file${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}`,
    );
  }

  return REQUIRED_FILES.map(
    (requiredPath) => allowedFiles.find((file) => file.path === requiredPath)!,
  );
}
