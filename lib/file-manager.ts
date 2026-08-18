import "server-only";

import { access, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import type { WebsiteFile } from "./types";
import {
  assertPathInsideDirectory,
  GeneratorError,
  isSafeRelativePath,
  isValidWebsiteId,
  normalizeRelativePath,
} from "./validation";
import {
  canUseObjectStorage,
  contentTypeForPath,
  deleteSiteObjects,
  downloadSiteObject,
  isObjectStorageEnabled,
  listSiteObjectPaths,
  siteObjectExists,
  uploadSiteObject,
} from "./site-storage";

const GENERATED_SITES_DIR = "generated-sites";
const EDITABLE_EXTENSIONS = new Set([".html", ".css", ".js"]);
const TEXT_EXTENSIONS = new Set([
  ".html",
  ".css",
  ".js",
  ".svg",
  ".txt",
  ".json",
  ".xml",
  ".map",
  ".md",
]);
const STAMP_EXTENSIONS = new Set([".html", ".css", ".js"]);

export function getGeneratedSitesRoot(): string {
  return path.join(process.cwd(), GENERATED_SITES_DIR);
}

export function getWebsiteDirectory(websiteId: string): string {
  return path.join(getGeneratedSitesRoot(), websiteId);
}

export function createWebsiteId(): string {
  return randomBytes(16).toString("hex");
}

function assertWebsiteId(websiteId: string): void {
  if (!isValidWebsiteId(websiteId)) {
    throw new GeneratorError("A valid websiteId is required.");
  }
}

function resolveSafeFilePath(websiteDir: string, filePath: string): string {
  const normalized = normalizeRelativePath(filePath);

  if (!isSafeRelativePath(filePath) || !isSafeRelativePath(normalized)) {
    throw new GeneratorError(`Unsafe file path rejected: ${filePath}`);
  }

  const destination = path.resolve(websiteDir, normalized);
  return assertPathInsideDirectory(websiteDir, destination);
}

function isPublicSiteFile(relativePath: string): boolean {
  return !relativePath.split("/").some((segment) => segment.startsWith("."));
}

function stampFileContent(file: WebsiteFile, websiteId: string): WebsiteFile {
  if (file.encoding === "base64") return file;
  const extension = path.extname(file.path).toLowerCase();
  if (!STAMP_EXTENSIONS.has(extension) || !file.content.includes("__WEBSITE_ID__")) {
    return file;
  }
  return {
    ...file,
    content: file.content.replaceAll("__WEBSITE_ID__", websiteId),
  };
}

export function stampWebsiteIdInFiles(
  files: WebsiteFile[],
  websiteId: string,
): WebsiteFile[] {
  return files.map((file) => stampFileContent(file, websiteId));
}

async function diskWebsiteExists(websiteId: string): Promise<boolean> {
  try {
    await access(getWebsiteDirectory(websiteId));
    return true;
  } catch {
    return false;
  }
}

async function collectDiskFilePaths(
  directory: string,
  relativeDirectory = "",
): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths: string[] = [];

  for (const entry of entries) {
    const relativePath = relativeDirectory
      ? `${relativeDirectory}/${entry.name}`
      : entry.name;

    if (entry.name.startsWith(".")) continue;

    if (entry.isDirectory()) {
      paths.push(
        ...(await collectDiskFilePaths(path.join(directory, entry.name), relativePath)),
      );
      continue;
    }

    paths.push(relativePath);
  }

  return paths;
}

async function writeDiskWebsiteFile(
  websiteDir: string,
  file: WebsiteFile,
): Promise<void> {
  const destination = resolveSafeFilePath(websiteDir, file.path);
  await mkdir(path.dirname(destination), { recursive: true });

  if (file.encoding === "base64") {
    await writeFile(destination, Buffer.from(file.content, "base64"));
    return;
  }

  await writeFile(destination, file.content, "utf8");
}

async function writeDiskWebsiteFiles(
  websiteId: string,
  files: WebsiteFile[],
): Promise<void> {
  const websiteDir = getWebsiteDirectory(websiteId);
  await mkdir(getGeneratedSitesRoot(), { recursive: true });
  await mkdir(websiteDir, { recursive: true });

  for (const file of files) {
    await writeDiskWebsiteFile(websiteDir, file);
  }
}

function fileBody(file: WebsiteFile): Buffer {
  if (file.encoding === "base64") {
    return Buffer.from(file.content, "base64");
  }
  return Buffer.from(file.content, "utf8");
}

async function uploadWebsiteFiles(
  websiteId: string,
  files: WebsiteFile[],
  idToken?: string,
): Promise<void> {
  for (const file of files) {
    const relativePath = normalizeRelativePath(file.path);
    if (!isSafeRelativePath(file.path) || !isSafeRelativePath(relativePath)) {
      throw new GeneratorError(`Unsafe file path rejected: ${file.path}`);
    }
    await uploadSiteObject({
      websiteId,
      relativePath,
      body: fileBody(file),
      contentType: contentTypeForPath(relativePath),
      idToken,
    });
  }
}

async function readDiskWebsiteFile(
  websiteId: string,
  relativePath: string,
): Promise<Buffer | null> {
  const websiteDir = getWebsiteDirectory(websiteId);
  try {
    const destination = resolveSafeFilePath(websiteDir, relativePath);
    return await readFile(destination);
  } catch {
    return null;
  }
}

async function listDiskWebsiteFiles(websiteId: string): Promise<string[]> {
  if (!(await diskWebsiteExists(websiteId))) return [];
  try {
    return await collectDiskFilePaths(getWebsiteDirectory(websiteId));
  } catch {
    return [];
  }
}

async function persistDiskSiteToStorage(
  websiteId: string,
  idToken?: string,
): Promise<void> {
  if (!canUseObjectStorage(idToken)) return;
  if (await siteObjectExists({ websiteId, relativePath: "index.html", idToken })) {
    return;
  }

  const diskPaths = await listDiskWebsiteFiles(websiteId);
  if (diskPaths.length === 0) return;

  for (const relativePath of diskPaths) {
    const body = await readDiskWebsiteFile(websiteId, relativePath);
    if (!body) continue;
    await uploadSiteObject({
      websiteId,
      relativePath,
      body,
      contentType: contentTypeForPath(relativePath),
      idToken,
    });
  }
}

async function listStoredWebsiteFiles(
  websiteId: string,
  idToken?: string,
): Promise<string[]> {
  if (isObjectStorageEnabled()) {
    const stored = (await listSiteObjectPaths({ websiteId, idToken })).filter(
      isPublicSiteFile,
    );
    if (stored.length > 0) return stored;
    if (canUseObjectStorage(idToken)) {
      await persistDiskSiteToStorage(websiteId, idToken);
      const migrated = (await listSiteObjectPaths({ websiteId, idToken })).filter(
        isPublicSiteFile,
      );
      if (migrated.length > 0) return migrated;
    }
  }

  return listDiskWebsiteFiles(websiteId);
}

async function readStoredWebsiteFile(
  websiteId: string,
  relativePath: string,
  idToken?: string,
): Promise<Buffer | null> {
  if (isObjectStorageEnabled()) {
    const stored = await downloadSiteObject({
      websiteId,
      relativePath,
      idToken,
    });
    if (stored) return stored;
  }

  return readDiskWebsiteFile(websiteId, relativePath);
}

export async function websiteExists(
  websiteId: string,
  idToken?: string,
): Promise<boolean> {
  if (!isValidWebsiteId(websiteId)) return false;

  if (isObjectStorageEnabled()) {
    if (await siteObjectExists({ websiteId, relativePath: "index.html", idToken })) {
      return true;
    }
    if (canUseObjectStorage(idToken)) {
      await persistDiskSiteToStorage(websiteId, idToken);
      if (await siteObjectExists({ websiteId, relativePath: "index.html", idToken })) {
        return true;
      }
    }
  }

  return diskWebsiteExists(websiteId);
}

export async function deleteWebsiteDirectory(
  websiteId: string,
  idToken?: string,
): Promise<void> {
  assertWebsiteId(websiteId);

  if (isObjectStorageEnabled()) {
    await deleteSiteObjects({ websiteId, idToken });
  }

  await rm(getWebsiteDirectory(websiteId), { recursive: true, force: true });
}

export async function listWebsiteIds(): Promise<string[]> {
  try {
    const entries = await readdir(getGeneratedSitesRoot(), { withFileTypes: true });
    return entries
      .filter(
        (entry) =>
          entry.isDirectory() &&
          !entry.name.startsWith(".") &&
          isValidWebsiteId(entry.name),
      )
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

export async function readWebsiteTitle(
  websiteId: string,
  idToken?: string,
): Promise<string | null> {
  try {
    const html = await readStoredWebsiteFile(websiteId, "index.html", idToken);
    if (!html) return null;
    const text = html.toString("utf8");
    const title = text.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim();
    const heading = text.match(/<h1[^>]*>([^<]+)<\/h1>/i)?.[1]?.trim();
    return title || heading || null;
  } catch {
    return null;
  }
}

export async function readWebsitePreviewFile(
  websiteId: string,
  filePath: string,
): Promise<{ body: Buffer; contentType: string } | null> {
  const normalized = normalizeRelativePath(filePath);
  if (!isSafeRelativePath(filePath) || !isSafeRelativePath(normalized)) {
    return null;
  }
  if (normalized.split("/").some((segment) => segment.startsWith("."))) {
    return null;
  }

  const contentType = contentTypeForPath(normalized);
  if (contentType === "application/octet-stream") {
    return null;
  }

  const body = await readStoredWebsiteFile(websiteId, normalized);
  if (!body) return null;
  return { body, contentType };
}

export async function readEditableWebsiteFiles(
  websiteId: string,
  idToken?: string,
): Promise<WebsiteFile[]> {
  const filePaths = await listStoredWebsiteFiles(websiteId, idToken);
  const files: WebsiteFile[] = [];

  for (const filePath of filePaths.sort()) {
    const extension = path.extname(filePath).toLowerCase();
    if (!EDITABLE_EXTENSIONS.has(extension)) continue;
    if (filePath.split("/").includes("images")) continue;

    const body = await readStoredWebsiteFile(websiteId, filePath, idToken);
    if (!body) continue;
    files.push({ path: normalizeRelativePath(filePath), content: body.toString("utf8") });
  }

  if (files.length === 0) {
    throw new GeneratorError("No editable website files found.");
  }

  return files;
}

export async function readDeployableWebsiteFiles(
  websiteId: string,
  idToken?: string,
): Promise<WebsiteFile[]> {
  const filePaths = await listStoredWebsiteFiles(websiteId, idToken);
  const files: WebsiteFile[] = [];

  for (const filePath of filePaths.sort()) {
    const body = await readStoredWebsiteFile(websiteId, filePath, idToken);
    if (!body) continue;
    const extension = path.extname(filePath).toLowerCase();

    if (TEXT_EXTENSIONS.has(extension)) {
      files.push({
        path: normalizeRelativePath(filePath),
        content: body.toString("utf8"),
      });
      continue;
    }

    files.push({
      path: normalizeRelativePath(filePath),
      content: body.toString("base64"),
      encoding: "base64",
    });
  }

  if (files.length === 0) {
    throw new GeneratorError("No website files found to deploy.");
  }

  return files;
}

export async function updateWebsiteFiles(
  websiteId: string,
  files: WebsiteFile[],
  idToken?: string,
): Promise<void> {
  assertWebsiteId(websiteId);
  const stamped = stampWebsiteIdInFiles(files, websiteId);
  const stored = await writeStoredWebsiteFiles(websiteId, stamped, idToken);

  try {
    await writeDiskWebsiteFiles(websiteId, stamped);
  } catch (error) {
    if (!stored) throw error;
    console.warn("Local generated-sites cache write failed:", error);
  }
}

async function writeStoredWebsiteFiles(
  websiteId: string,
  files: WebsiteFile[],
  idToken?: string,
): Promise<boolean> {
  if (!isObjectStorageEnabled()) return false;
  if (!canUseObjectStorage(idToken)) {
    throw new GeneratorError(
      "Firebase Admin is not configured. Add FIREBASE_SERVICE_ACCOUNT_PATH to save website files.",
      500,
    );
  }

  try {
    await uploadWebsiteFiles(websiteId, files, idToken);
    return true;
  } catch (error) {
    if (process.env.NODE_ENV === "production") throw error;
    console.warn("Firebase Storage write failed; using local disk:", error);
    return false;
  }
}

export async function writeWebsiteFiles(
  files: WebsiteFile[],
  idToken?: string,
): Promise<string> {
  const websiteId = createWebsiteId();
  const stamped = stampWebsiteIdInFiles(files, websiteId);

  try {
    const stored = await writeStoredWebsiteFiles(websiteId, stamped, idToken);

    try {
      await writeDiskWebsiteFiles(websiteId, stamped);
    } catch (error) {
      if (!stored) throw error;
      console.warn("Local generated-sites cache write failed:", error);
    }
  } catch (error) {
    await deleteWebsiteDirectory(websiteId, idToken).catch(() => undefined);
    throw error;
  }

  return websiteId;
}
