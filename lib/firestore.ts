import "server-only";

import type { AuthUser } from "@/lib/auth-server";
import { getAdminFirestore, isFirebaseAdminConfigured } from "@/lib/firebase-admin";
import type { WebsiteSubscription } from "@/lib/subscription";

export class FirestoreError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 502) {
    super(message);
    this.name = "FirestoreError";
    this.statusCode = statusCode;
  }
}

export function isFirestorePermissionError(error: unknown): boolean {
  return error instanceof FirestoreError && error.statusCode === 403;
}

export type WebsiteMeta = {
  websiteId: string;
  ownerUid: string;
  ownerEmail?: string;
  businessName: string;
  contactEmail?: string;
  createdAt: string;
  updatedAt: string;
  seoOptimizedAt?: string;
};

type FirestoreValue =
  | { nullValue: null }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { stringValue: string }
  | { arrayValue: { values?: FirestoreValue[] } }
  | { mapValue: { fields?: Record<string, FirestoreValue> } };

type FirestoreDocument = {
  name?: string;
  fields?: Record<string, FirestoreValue>;
};

function projectId(): string {
  const id = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim();
  if (!id) {
    throw new Error("NEXT_PUBLIC_FIREBASE_PROJECT_ID is not configured.");
  }
  return id;
}

function documentUrl(path: string): string {
  return `https://firestore.googleapis.com/v1/projects/${projectId()}/databases/(default)/documents/${path}`;
}

function encodeValue(value: unknown): FirestoreValue | null {
  if (value === undefined) return null;
  if (value === null) return { nullValue: null };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: value };
  }
  if (typeof value === "string") return { stringValue: value };
  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value
          .map((item) => encodeValue(item))
          .filter((item): item is FirestoreValue => item !== null),
      },
    };
  }
  if (typeof value === "object") {
    return { mapValue: { fields: encodeFields(value as Record<string, unknown>) } };
  }
  return null;
}

function encodeFields(data: Record<string, unknown>): Record<string, FirestoreValue> {
  const fields: Record<string, FirestoreValue> = {};
  for (const [key, value] of Object.entries(data)) {
    const encoded = encodeValue(value);
    if (encoded) fields[key] = encoded;
  }
  return fields;
}

function decodeValue(value: FirestoreValue): unknown {
  if ("nullValue" in value) return null;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("stringValue" in value) return value.stringValue;
  if ("arrayValue" in value) {
    return (value.arrayValue.values ?? []).map((item) => decodeValue(item));
  }
  if ("mapValue" in value) {
    return decodeFields(value.mapValue.fields ?? {});
  }
  return null;
}

function decodeFields(fields: Record<string, FirestoreValue>): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    data[key] = decodeValue(value);
  }
  return data;
}

async function throwFirestoreError(
  action: string,
  response: Response,
): Promise<never> {
  const body = await response.text().catch(() => "");
  console.error(`Firestore ${action} failed (${response.status}):`, body);
  if (response.status === 401 || response.status === 403) {
    throw new FirestoreError(
      "Firestore denied this request. In the Firebase console open Firestore → Rules and publish the contents of firestore.rules.",
      403,
    );
  }
  throw new FirestoreError(`Could not ${action} Firestore data.`, response.status);
}

async function firestoreRequest(
  url: string,
  idToken: string,
  init: RequestInit,
): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
    signal: AbortSignal.timeout(12_000),
  });
}

function definedFields(data: Record<string, unknown>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) payload[key] = value;
  }
  return payload;
}

async function getDocument(
  path: string,
  idToken: string,
): Promise<Record<string, unknown> | null> {
  if (isFirebaseAdminConfigured()) {
    const snap = await getAdminFirestore().doc(path).get();
    if (!snap.exists) return null;
    return (snap.data() ?? {}) as Record<string, unknown>;
  }

  const response = await firestoreRequest(documentUrl(path), idToken, {
    method: "GET",
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    await throwFirestoreError("read", response);
  }
  const document = (await response.json()) as FirestoreDocument;
  return decodeFields(document.fields ?? {});
}

async function setDocument(
  path: string,
  idToken: string,
  data: Record<string, unknown>,
): Promise<void> {
  if (isFirebaseAdminConfigured()) {
    await getAdminFirestore().doc(path).set(definedFields(data), { merge: true });
    return;
  }

  const fieldPaths = Object.keys(data).filter((key) => data[key] !== undefined);
  const params = new URLSearchParams();
  for (const field of fieldPaths) {
    params.append("updateMask.fieldPaths", field);
  }

  const response = await firestoreRequest(
    `${documentUrl(path)}?${params.toString()}`,
    idToken,
    {
      method: "PATCH",
      body: JSON.stringify({ fields: encodeFields(data) }),
    },
  );

  if (!response.ok) {
    await throwFirestoreError("write", response);
  }
}

async function deleteDocument(path: string, idToken: string): Promise<void> {
  if (isFirebaseAdminConfigured()) {
    await getAdminFirestore().doc(path).delete();
    return;
  }

  const response = await firestoreRequest(documentUrl(path), idToken, {
    method: "DELETE",
  });
  if (response.status === 404 || response.ok) return;
  await throwFirestoreError("delete", response);
}

async function listDocuments(
  path: string,
  idToken: string,
): Promise<Record<string, unknown>[]> {
  if (isFirebaseAdminConfigured()) {
    const snap = await getAdminFirestore().collection(path).get();
    return snap.docs.map((document) => (document.data() ?? {}) as Record<string, unknown>);
  }

  const response = await firestoreRequest(documentUrl(path), idToken, {
    method: "GET",
  });
  if (response.status === 404) return [];
  if (!response.ok) {
    await throwFirestoreError("list", response);
  }
  const payload = (await response.json()) as { documents?: FirestoreDocument[] };
  return (payload.documents ?? []).map((document) => decodeFields(document.fields ?? {}));
}

function sitePaths(uid: string, websiteId: string) {
  return {
    userSite: `users/${uid}/sites/${websiteId}`,
    site: `sites/${websiteId}`,
  };
}

export type StoredSite = WebsiteMeta & {
  subscription?: WebsiteSubscription | null;
};

function asMeta(data: Record<string, unknown>): WebsiteMeta | null {
  const websiteId = typeof data.websiteId === "string" ? data.websiteId : "";
  const ownerUid = typeof data.ownerUid === "string" ? data.ownerUid : "";
  if (!websiteId || !ownerUid) return null;
  return {
    websiteId,
    ownerUid,
    ownerEmail: typeof data.ownerEmail === "string" ? data.ownerEmail.trim() || undefined : undefined,
    businessName: typeof data.businessName === "string" ? data.businessName : "Untitled site",
    contactEmail:
      typeof data.contactEmail === "string" ? data.contactEmail.trim() || undefined : undefined,
    createdAt: typeof data.createdAt === "string" ? data.createdAt : new Date().toISOString(),
    updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : new Date().toISOString(),
    seoOptimizedAt:
      typeof data.seoOptimizedAt === "string" && data.seoOptimizedAt.trim()
        ? data.seoOptimizedAt
        : undefined,
  };
}

function asStoredSite(data: Record<string, unknown>): StoredSite | null {
  const meta = asMeta(data);
  if (!meta) return null;
  const subscription =
    data.subscription && typeof data.subscription === "object"
      ? (data.subscription as WebsiteSubscription)
      : null;
  return { ...meta, subscription };
}

export async function readSiteOwnerUid(websiteId: string): Promise<string | null> {
  if (!websiteId || !isFirebaseAdminConfigured()) return null;
  const snap = await getAdminFirestore().collection("sites").doc(websiteId).get();
  const uid = snap.get("ownerUid");
  return typeof uid === "string" && uid ? uid : null;
}

export async function readPublicSiteRecord(
  websiteId: string,
): Promise<StoredSite | null> {
  if (!websiteId || !isFirebaseAdminConfigured()) return null;
  const snap = await getAdminFirestore().collection("sites").doc(websiteId).get();
  if (!snap.exists) return null;
  return asStoredSite((snap.data() ?? {}) as Record<string, unknown>);
}

export async function readUserProfile(
  user: AuthUser,
): Promise<Record<string, unknown> | null> {
  try {
    return await getDocument(`users/${user.uid}`, user.idToken);
  } catch (error) {
    if (isFirestorePermissionError(error)) return null;
    throw error;
  }
}

export async function upsertUserProfile(user: AuthUser): Promise<void> {
  const now = new Date().toISOString();
  let existing: Record<string, unknown> | null = null;
  try {
    existing = await getDocument(`users/${user.uid}`, user.idToken);
  } catch (error) {
    if (!isFirestorePermissionError(error)) throw error;
  }
  await setDocument(`users/${user.uid}`, user.idToken, {
    uid: user.uid,
    email: user.email ?? "",
    displayName: user.displayName ?? "",
    createdAt: typeof existing?.createdAt === "string" ? existing.createdAt : now,
    updatedAt: now,
    lastSeenAt: now,
  });
}

export async function writeSiteRecord(
  user: AuthUser,
  meta: WebsiteMeta,
  subscription?: WebsiteSubscription | null,
): Promise<void> {
  const payload: Record<string, unknown> = {
    ...meta,
    ownerEmail: meta.ownerEmail ?? user.email ?? "",
    contactEmail: meta.contactEmail ?? "",
  };
  if (subscription) {
    payload.subscription = subscription;
  }

  const paths = sitePaths(user.uid, meta.websiteId);
  await setDocument(paths.userSite, user.idToken, payload);
  await setDocument(paths.site, user.idToken, payload);
}

export async function readSiteRecord(
  websiteId: string,
  user: AuthUser,
): Promise<StoredSite | null> {
  const owned = await getDocument(sitePaths(user.uid, websiteId).userSite, user.idToken);
  if (owned) return asStoredSite(owned);

  const shared = await getDocument(`sites/${websiteId}`, user.idToken);
  if (!shared) return null;
  const site = asStoredSite(shared);
  if (!site || site.ownerUid !== user.uid) return null;
  return site;
}

export async function listSiteRecords(user: AuthUser): Promise<StoredSite[]> {
  const documents = await listDocuments(`users/${user.uid}/sites`, user.idToken);
  return documents
    .map((data) => asStoredSite(data))
    .filter((site): site is StoredSite => Boolean(site));
}

export async function deleteSiteRecord(user: AuthUser, websiteId: string): Promise<void> {
  const paths = sitePaths(user.uid, websiteId);
  await deleteDocument(paths.userSite, user.idToken);
  await deleteDocument(paths.site, user.idToken);
}

export async function markUserMigrated(user: AuthUser): Promise<void> {
  await setDocument(`users/${user.uid}`, user.idToken, {
    diskMigrated: true,
    updatedAt: new Date().toISOString(),
  });
}

export async function isUserMigrated(user: AuthUser): Promise<boolean> {
  try {
    const data = await getDocument(`users/${user.uid}`, user.idToken);
    return data?.diskMigrated === true;
  } catch (error) {
    if (isFirestorePermissionError(error)) return false;
    throw error;
  }
}

function userJobPath(uid: string, jobId: string): string {
  return `users/${uid}/jobs/${jobId}`;
}

export async function readUserJobDocument(
  user: AuthUser,
  jobId: string,
): Promise<Record<string, unknown> | null> {
  return getDocument(userJobPath(user.uid, jobId), user.idToken);
}

export async function writeUserJobDocument(
  user: AuthUser,
  jobId: string,
  data: Record<string, unknown>,
): Promise<void> {
  await setDocument(userJobPath(user.uid, jobId), user.idToken, data);
}

export async function listUserJobDocuments(
  user: AuthUser,
): Promise<Record<string, unknown>[]> {
  return listDocuments(`users/${user.uid}/jobs`, user.idToken);
}
