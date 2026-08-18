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
  return path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
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
  const inline =
    process.env.FIREBASE_SERVICE_ACCOUNT?.trim() ||
    process.env.FIREBASE_SERVICE_ACCOUNT_BASE64?.trim();
  if (inline) {
    return parseServiceAccount(decodePossiblyBase64(inline));
  }

  const configured =
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim() ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  const candidates = [
    configured,
    "secrets/firebase-adminsdk.json",
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    const resolved = resolveCredentialPath(candidate);
    if (!existsSync(resolved)) continue;
    return parseServiceAccount(readFileSync(resolved, "utf8"));
  }

  return null;
}

function parseServiceAccount(raw: string): ServiceAccount {
  const parsed = JSON.parse(raw) as ServiceAccountFile;
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
      "Firebase Admin is not configured. Set FIREBASE_SERVICE_ACCOUNT_PATH or FIREBASE_SERVICE_ACCOUNT.",
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
