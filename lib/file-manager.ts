import { access, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import type { WebsiteFile } from "./types";
import {
  assertPathInsideDirectory,
  GeneratorError,
  isSafeRelativePath,
  normalizeRelativePath,
} from "./validation";

const GENERATED_SITES_DIR = "generated-sites";

export function getGeneratedSitesRoot(): string {
  return path.join(process.cwd(), GENERATED_SITES_DIR);
}

export function getWebsiteDirectory(websiteId: string): string {
  return path.join(getGeneratedSitesRoot(), websiteId);
}

export async function websiteExists(websiteId: string): Promise<boolean> {
  try {
    await access(getWebsiteDirectory(websiteId));
    return true;
  } catch {
    return false;
  }
}

export function createWebsiteId(): string {
  return randomBytes(3).toString("hex");
}

function resolveSafeFilePath(websiteDir: string, filePath: string): string {
  const normalized = normalizeRelativePath(filePath);

  if (!isSafeRelativePath(filePath) || !isSafeRelativePath(normalized)) {
    throw new GeneratorError(`Unsafe file path rejected: ${filePath}`);
  }

  const destination = path.resolve(websiteDir, normalized);
  return assertPathInsideDirectory(websiteDir, destination);
}

const EDITABLE_EXTENSIONS = new Set([".html", ".css", ".js"]);

async function collectEditableFilePaths(
  directory: string,
  relativeDirectory = "",
): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths: string[] = [];

  for (const entry of entries) {
    const relativePath = relativeDirectory
      ? `${relativeDirectory}/${entry.name}`
      : entry.name;

    if (entry.isDirectory()) {
      if (entry.name.toLowerCase() === "images") {
        continue;
      }
      paths.push(
        ...(await collectEditableFilePaths(
          path.join(directory, entry.name),
          relativePath,
        )),
      );
      continue;
    }

    const extension = path.extname(entry.name).toLowerCase();
    if (EDITABLE_EXTENSIONS.has(extension)) {
      paths.push(relativePath);
    }
  }

  return paths;
}

export async function readEditableWebsiteFiles(
  websiteId: string,
): Promise<WebsiteFile[]> {
  const websiteDir = getWebsiteDirectory(websiteId);
  const filePaths = await collectEditableFilePaths(websiteDir);
  const files: WebsiteFile[] = [];

  for (const filePath of filePaths.sort()) {
    const destination = resolveSafeFilePath(websiteDir, filePath);
    const content = await readFile(destination, "utf8");
    files.push({ path: normalizeRelativePath(filePath), content });
  }

  if (files.length === 0) {
    throw new GeneratorError("No editable website files found.");
  }

  return files;
}

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

async function collectAllFilePaths(
  directory: string,
  relativeDirectory = "",
): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths: string[] = [];

  for (const entry of entries) {
    const relativePath = relativeDirectory
      ? `${relativeDirectory}/${entry.name}`
      : entry.name;

    if (entry.name.startsWith(".")) {
      continue;
    }

    if (entry.isDirectory()) {
      paths.push(
        ...(await collectAllFilePaths(path.join(directory, entry.name), relativePath)),
      );
      continue;
    }

    paths.push(relativePath);
  }

  return paths;
}

export async function readDeployableWebsiteFiles(
  websiteId: string,
): Promise<WebsiteFile[]> {
  const websiteDir = getWebsiteDirectory(websiteId);
  const filePaths = await collectAllFilePaths(websiteDir);
  const files: WebsiteFile[] = [];

  for (const filePath of filePaths.sort()) {
    const destination = resolveSafeFilePath(websiteDir, filePath);
    const extension = path.extname(filePath).toLowerCase();

    if (TEXT_EXTENSIONS.has(extension)) {
      files.push({
        path: normalizeRelativePath(filePath),
        content: await readFile(destination, "utf8"),
      });
      continue;
    }

    files.push({
      path: normalizeRelativePath(filePath),
      content: (await readFile(destination)).toString("base64"),
      encoding: "base64",
    });
  }

  if (files.length === 0) {
    throw new GeneratorError("No website files found to deploy.");
  }

  return files;
}

async function writeWebsiteFile(
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

export async function writeWebsiteFiles(
  files: WebsiteFile[],
): Promise<string> {
  const websiteId = createWebsiteId();
  const websiteDir = getWebsiteDirectory(websiteId);

  await mkdir(getGeneratedSitesRoot(), { recursive: true });
  await mkdir(websiteDir, { recursive: true });

  try {
    for (const file of files) {
      await writeWebsiteFile(websiteDir, file);
    }
  } catch (error) {
    await rm(websiteDir, { recursive: true, force: true });
    throw error;
  }

  return websiteId;
}
