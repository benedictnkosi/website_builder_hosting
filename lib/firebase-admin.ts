import "server-only";

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  cert,
  getApps,
  initializeApp,
  type App,
  type ServiceAccount,
} from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getStorage, type Storage } from "firebase-admin/storage";

type ServiceAccountFile = {
  project_id?: string;
  client_email?: string;
  private_key?: string;
  projectId?: string;
  clientEmail?: string;
  privateKey?: string;
};

function resolveCredentialPath(filePath: string): string {
  if (path.isAbsolute(filePath)) return filePath;
  return path.join(/* turbopackIgnore: true */ process.cwd(), filePath);
}

const DEFAULT_SERVICE_ACCOUNT_FILE = path.join(
  process.cwd(),
  "secrets",
  "firebase-adminsdk.json",
);

function firstEnv(...keys: string[]): string {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return "";
}

function looksLikeJsonObject(raw: string): boolean {
  return raw.trim().replace(/^['"]|['"]$/g, "").startsWith("{");
}

function decodePossiblyBase64(raw: string): string {
  const trimmed = raw.trim().replace(/^['"]|['"]$/g, "");
  if (trimmed.startsWith("{")) return trimmed;
  try {
    const decoded = Buffer.from(trimmed, "base64").toString("utf8").trim();
    if (decoded.startsWith("{")) return decoded;
  } catch {
    // Not base64; parse as JSON below.
  }
  return trimmed;
}

function readServiceAccount(): ServiceAccount | null {
  const inline = firstEnv(
    "FIREBASE_SERVICE_ACCOUNT",
    "FIREBASE_SERVICE_ACCOUNT_JSON",
    "FIREBASE_SERVICE_ACCOUNT_BASE64",
  );
  const pathOrJson = firstEnv(
    "FIREBASE_SERVICE_ACCOUNT_PATH",
    "GOOGLE_APPLICATION_CREDENTIALS",
  );

  if (inline) {
    return parseServiceAccount(decodePossiblyBase64(inline));
  }

  // Vercel: people sometimes paste the JSON into *_PATH. Accept that.
  if (pathOrJson && looksLikeJsonObject(pathOrJson)) {
    return parseServiceAccount(decodePossiblyBase64(pathOrJson));
  }

  // Vercel has no gitignored JSON file. Skipping cwd file reads also
  // stops Turbopack tracing the whole project.
  if (process.env.VERCEL) {
    return null;
  }

  const candidates = [pathOrJson, DEFAULT_SERVICE_ACCOUNT_FILE].filter(
    (value): value is string => Boolean(value),
  );

  for (const candidate of candidates) {
    const resolved = path.isAbsolute(candidate)
      ? candidate
      : resolveCredentialPath(candidate);
    if (!existsSync(resolved)) continue;
    return parseServiceAccount(readFileSync(resolved, "utf8"));
  }

  return null;
}

function parseServiceAccount(raw: string): ServiceAccount {
  const json = decodePossiblyBase64(raw);
  if (!json.startsWith("{")) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT must be the JSON file contents, not a file path. On Vercel, paste the full service account JSON into FIREBASE_SERVICE_ACCOUNT.",
    );
  }

  let parsed: ServiceAccountFile;
  try {
    parsed = JSON.parse(json) as ServiceAccountFile;
  } catch {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT is not valid JSON. Paste the full firebase-adminsdk JSON as a single env value.",
    );
  }

  const projectId = parsed.projectId || parsed.project_id;
  const clientEmail = parsed.clientEmail || parsed.client_email;
  const privateKey = parsed.privateKey || parsed.private_key;

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Firebase service account JSON is missing required fields.");
  }

  return {
    projectId,
    clientEmail,
    privateKey: privateKey.replace(/\\n/g, "\n"),
  };
}

function storageBucketName(): string | undefined {
  return (
    process.env.FIREBASE_STORAGE_BUCKET?.trim() ||
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim() ||
    undefined
  );
}

export function isFirebaseAdminConfigured(): boolean {
  try {
    return Boolean(readServiceAccount());
  } catch {
    return false;
  }
}

export function getFirebaseAdminApp(): App {
  const existing = getApps()[0];
  if (existing) return existing;

  const serviceAccount = readServiceAccount();
  if (!serviceAccount) {
    throw new Error(
      "Firebase Admin is not configured. On Vercel, paste the service account JSON into FIREBASE_SERVICE_ACCOUNT.",
    );
  }

  return initializeApp({
    credential: cert(serviceAccount),
    projectId: serviceAccount.projectId,
    storageBucket: storageBucketName(),
  });
}

export function getAdminStorage(): Storage {
  return getStorage(getFirebaseAdminApp());
}

let adminFirestore: Firestore | null = null;

export function getAdminFirestore(): Firestore {
  if (adminFirestore) return adminFirestore;

  const firestore = getFirestore(getFirebaseAdminApp());
  try {
    firestore.settings({ ignoreUndefinedProperties: true });
  } catch {
    // settings() can only run once per app
  }
  adminFirestore = firestore;
  return firestore;
}
