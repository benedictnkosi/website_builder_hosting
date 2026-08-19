import "server-only";

import path from "node:path";
import { GeneratorError } from "./validation";
import { getAdminStorage, isFirebaseAdminConfigured } from "./firebase-admin";

const SITE_PREFIX = "sites";

type StorageObject = {
  name?: string;
};

type StorageListResponse = {
  items?: StorageObject[];
  nextPageToken?: string;
};

export function storageBucket(): string | null {
  return (
    process.env.FIREBASE_STORAGE_BUCKET?.trim() ||
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim() ||
    null
  );
}

export function isObjectStorageEnabled(): boolean {
  return Boolean(storageBucket());
}

export function canUseObjectStorage(idToken?: string): boolean {
  return isObjectStorageEnabled() && (isFirebaseAdminConfigured() || Boolean(idToken));
}

export function siteObjectName(websiteId: string, relativePath: string): string {
  return `${SITE_PREFIX}/${websiteId}/${relativePath}`;
}

export function relativePathFromObjectName(
  websiteId: string,
  objectName: string,
): string | null {
  const prefix = `${SITE_PREFIX}/${websiteId}/`;
  if (!objectName.startsWith(prefix)) return null;
  return objectName.slice(prefix.length);
}

function bucketName(): string {
  const value = storageBucket();
  if (!value) {
    throw new GeneratorError("Firebase Storage is not configured.", 500);
  }
  return value;
}

function objectApiUrl(objectName: string, query?: Record<string, string>): string {
  const encoded = encodeURIComponent(objectName);
  const params = new URLSearchParams(query);
  const qs = params.toString();
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName()}/o/${encoded}${qs ? `?${qs}` : ""}`;
}

function objectsApiUrl(query: Record<string, string>): string {
  const params = new URLSearchParams(query);
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName()}/o?${params.toString()}`;
}

function authHeaders(idToken?: string): HeadersInit {
  if (!idToken) return {};
  return { Authorization: `Bearer ${idToken}` };
}

async function storageRequest(
  url: string,
  init: RequestInit,
): Promise<Response> {
  return fetch(url, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(30_000),
  });
}

function throwStorageError(action: string, status: number, body: string): never {
  console.error(`Firebase Storage ${action} failed (${status}):`, body);
  if (status === 401 || status === 403) {
    throw new GeneratorError(
      isFirebaseAdminConfigured()
        ? "Firebase Storage denied the service account. Grant it Storage Admin on the project bucket."
        : "Firebase Storage denied this request. Add a service account JSON or publish storage.rules.",
      502,
    );
  }
  throw new GeneratorError(`Could not ${action} website files.`, 502);
}

export function contentTypeForPath(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  switch (extension) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "application/javascript; charset=utf-8";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".svg":
      return "image/svg+xml";
    case ".ico":
      return "image/x-icon";
    case ".json":
      return "application/json";
    case ".txt":
    case ".md":
      return "text/plain; charset=utf-8";
    case ".xml":
      return "application/xml";
    default:
      return "application/octet-stream";
  }
}

function asBytes(body: Buffer | Uint8Array | string): Buffer {
  return typeof body === "string" ? Buffer.from(body) : Buffer.from(body);
}

function adminFile(websiteId: string, relativePath: string) {
  return getAdminStorage().bucket(bucketName()).file(siteObjectName(websiteId, relativePath));
}

export async function uploadSiteObject(input: {
  websiteId: string;
  relativePath: string;
  body: Buffer | Uint8Array | string;
  contentType: string;
  idToken?: string;
}): Promise<void> {
  const bytes = asBytes(input.body);

  if (isFirebaseAdminConfigured()) {
    await adminFile(input.websiteId, input.relativePath).save(bytes, {
      resumable: false,
      contentType: input.contentType,
      metadata: {
        cacheControl: "private, max-age=0",
      },
    });
    return;
  }

  if (!input.idToken) {
    throw new GeneratorError(
      "Firebase Admin is not configured. Paste the service account JSON into FIREBASE_SERVICE_ACCOUNT.",
      500,
    );
  }

  const objectName = siteObjectName(input.websiteId, input.relativePath);
  const payload = new Uint8Array(bytes.byteLength);
  payload.set(bytes);
  const response = await storageRequest(objectsApiUrl({ name: objectName }), {
    method: "POST",
    headers: {
      ...authHeaders(input.idToken),
      "Content-Type": input.contentType,
    },
    body: new Blob([payload], { type: input.contentType }),
  });

  if (!response.ok) {
    throwStorageError("upload", response.status, await response.text().catch(() => ""));
  }
}

export async function downloadSiteObject(input: {
  websiteId: string;
  relativePath: string;
  idToken?: string;
}): Promise<Buffer | null> {
  if (isFirebaseAdminConfigured()) {
    const file = adminFile(input.websiteId, input.relativePath);
    const [exists] = await file.exists();
    if (!exists) return null;
    const [contents] = await file.download();
    return Buffer.from(contents);
  }

  const response = await storageRequest(
    objectApiUrl(siteObjectName(input.websiteId, input.relativePath), {
      alt: "media",
    }),
    {
      method: "GET",
      headers: authHeaders(input.idToken),
    },
  );

  if (response.status === 404) return null;
  if (!response.ok) {
    if (!input.idToken && (response.status === 401 || response.status === 403)) {
      return null;
    }
    throwStorageError("download", response.status, await response.text().catch(() => ""));
  }

  return Buffer.from(await response.arrayBuffer());
}

export async function siteObjectExists(input: {
  websiteId: string;
  relativePath: string;
  idToken?: string;
}): Promise<boolean> {
  if (isFirebaseAdminConfigured()) {
    const [exists] = await adminFile(input.websiteId, input.relativePath).exists();
    return exists;
  }

  const response = await storageRequest(
    objectApiUrl(siteObjectName(input.websiteId, input.relativePath)),
    {
      method: "GET",
      headers: authHeaders(input.idToken),
    },
  );

  if (response.status === 404) return false;
  if (response.ok) return true;
  if (!input.idToken && (response.status === 401 || response.status === 403)) {
    return false;
  }
  throwStorageError(
    "look up",
    response.status,
    await response.text().catch(() => ""),
  );
}

export async function listSiteObjectPaths(input: {
  websiteId: string;
  idToken?: string;
}): Promise<string[]> {
  if (isFirebaseAdminConfigured()) {
    const prefix = `${SITE_PREFIX}/${input.websiteId}/`;
    const [files] = await getAdminStorage().bucket(bucketName()).getFiles({ prefix });
    return files
      .map((file) => relativePathFromObjectName(input.websiteId, file.name))
      .filter((relativePath): relativePath is string => Boolean(relativePath));
  }

  const prefix = `${SITE_PREFIX}/${input.websiteId}/`;
  const paths: string[] = [];
  let pageToken: string | undefined;

  do {
    const query: Record<string, string> = { prefix };
    if (pageToken) query.pageToken = pageToken;

    const response = await storageRequest(objectsApiUrl(query), {
      method: "GET",
      headers: authHeaders(input.idToken),
    });

    if (response.status === 404) return paths;
    if (!response.ok) {
      if (!input.idToken && (response.status === 401 || response.status === 403)) {
        return paths;
      }
      throwStorageError("list", response.status, await response.text().catch(() => ""));
    }

    const payload = (await response.json()) as StorageListResponse;
    for (const item of payload.items ?? []) {
      if (!item.name) continue;
      const relativePath = relativePathFromObjectName(input.websiteId, item.name);
      if (relativePath) paths.push(relativePath);
    }
    pageToken = payload.nextPageToken;
  } while (pageToken);

  return paths;
}

export async function deleteSiteObject(input: {
  websiteId: string;
  relativePath: string;
  idToken?: string;
}): Promise<void> {
  if (isFirebaseAdminConfigured()) {
    await adminFile(input.websiteId, input.relativePath).delete({
      ignoreNotFound: true,
    });
    return;
  }

  const response = await storageRequest(
    objectApiUrl(siteObjectName(input.websiteId, input.relativePath)),
    {
      method: "DELETE",
      headers: authHeaders(input.idToken),
    },
  );
  if (response.status === 404 || response.ok) return;
  if (!input.idToken && (response.status === 401 || response.status === 403)) {
    return;
  }
  throwStorageError(
    "delete",
    response.status,
    await response.text().catch(() => ""),
  );
}

export async function deleteSiteObjects(input: {
  websiteId: string;
  idToken?: string;
}): Promise<void> {
  if (isFirebaseAdminConfigured()) {
    await getAdminStorage()
      .bucket(bucketName())
      .deleteFiles({ prefix: `${SITE_PREFIX}/${input.websiteId}/` });
    return;
  }

  const paths = await listSiteObjectPaths(input);
  await Promise.all(
    paths.map(async (relativePath) => {
      const response = await storageRequest(
        objectApiUrl(siteObjectName(input.websiteId, relativePath)),
        {
          method: "DELETE",
          headers: authHeaders(input.idToken),
        },
      );
      if (response.status === 404 || response.ok) return;
      throwStorageError(
        "delete",
        response.status,
        await response.text().catch(() => ""),
      );
    }),
  );
}
