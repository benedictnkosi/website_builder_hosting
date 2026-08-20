import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { AuthError, isValidUid, requireUser, type AuthUser } from "@/lib/auth-server";
import {
  deleteWebsiteDirectory,
  getWebsiteDirectory,
  listWebsiteIds,
  readWebsiteTitle,
  websiteExists,
} from "@/lib/file-manager";
import {
  deleteSiteRecord,
  isUserMigrated,
  listSiteRecords,
  markUserMigrated,
  readPublicSiteRecord,
  readSiteRecord,
  upsertUserProfile,
  writeSiteRecord,
  type StoredSite,
  type WebsiteMeta,
} from "@/lib/firestore";
import { cancelPayfastSubscription } from "@/lib/payfast";
import type { BillingFrequency } from "@/lib/pricing";
import {
  readSubscription,
  writeSubscription,
  deleteSubscription,
  type SubscriptionStatus,
  type WebsiteSubscription,
} from "@/lib/subscription";
import { isValidWebsiteId } from "@/lib/validation";

export type { WebsiteMeta };

export type ManagedWebsite = {
  websiteId: string;
  businessName: string;
  createdAt: string;
  updatedAt: string;
  previewPath: string;
  domain: string | null;
  subscriptionStatus: SubscriptionStatus | null;
  amountZar: number | null;
  frequency: BillingFrequency | null;
  mocked: boolean;
};

const META_FILE = ".meta.json";

function metaPath(websiteId: string): string {
  return path.join(getWebsiteDirectory(websiteId), META_FILE);
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function readDiskMeta(websiteId: string): Promise<WebsiteMeta | null> {
  if (!isValidWebsiteId(websiteId)) return null;
  try {
    const data = JSON.parse(await readFile(metaPath(websiteId), "utf8")) as WebsiteMeta;
    if (!data || data.websiteId !== websiteId || !isValidUid(data.ownerUid)) {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

async function writeDiskMeta(meta: WebsiteMeta): Promise<void> {
  const websiteDir = getWebsiteDirectory(meta.websiteId);
  await mkdir(websiteDir, { recursive: true });
  await writeFile(metaPath(meta.websiteId), `${JSON.stringify(meta, null, 2)}\n`, "utf8");
}

export async function readWebsiteMeta(
  websiteId: string,
  user?: AuthUser,
): Promise<WebsiteMeta | null> {
  if (user) {
    const stored = await readSiteRecord(websiteId, user);
    if (stored) return stored;
  } else {
    const stored = await readPublicSiteRecord(websiteId);
    if (stored) return stored;
  }
  return readDiskMeta(websiteId);
}

export async function writeWebsiteMeta(
  meta: WebsiteMeta,
  user?: AuthUser,
  subscription?: WebsiteSubscription | null,
): Promise<void> {
  try {
    await writeDiskMeta(meta);
  } catch (error) {
    if (!user) throw error;
    console.warn("Local website meta cache write failed:", error);
  }
  if (user) {
    await writeSiteRecord(user, meta, subscription);
  }
}

export async function createOwnedWebsite(input: {
  websiteId: string;
  user: AuthUser;
  businessName?: string;
  contactEmail?: string;
}): Promise<WebsiteMeta> {
  const now = new Date().toISOString();
  const existing = await readWebsiteMeta(input.websiteId, input.user);
  if (existing && existing.ownerUid !== input.user.uid) {
    throw new AuthError("You do not have access to this website.", 403);
  }
  const title =
    stringField(input.businessName) ||
    (await readWebsiteTitle(input.websiteId, input.user.idToken)) ||
    existing?.businessName ||
    "Untitled site";
  const meta: WebsiteMeta = {
    websiteId: input.websiteId,
    ownerUid: input.user.uid,
    ownerEmail: input.user.email,
    businessName: title,
    contactEmail:
      stringField(input.contactEmail) || existing?.contactEmail || undefined,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    seoOptimizedAt: existing?.seoOptimizedAt,
  };

  await upsertUserProfile(input.user);
  await writeWebsiteMeta(meta, input.user);
  return meta;
}

export async function requireOwnedWebsite(
  websiteId: string,
  user: AuthUser,
): Promise<WebsiteMeta> {
  if (!isValidWebsiteId(websiteId) || !(await websiteExists(websiteId, user.idToken))) {
    throw new AuthError("Website not found.", 404);
  }

  const meta = await readWebsiteMeta(websiteId, user);
  if (!meta || meta.ownerUid !== user.uid) {
    throw new AuthError("You do not have access to this website.", 403);
  }

  return meta;
}

export async function requireOwnedSite(request: Request, websiteId: string) {
  const user = await requireUser(request);
  const meta = await requireOwnedWebsite(websiteId, user);
  return { user, meta };
}

export async function claimWebsiteIfUnowned(input: {
  websiteId: string;
  user: AuthUser;
  businessName?: string;
}): Promise<WebsiteMeta> {
  if (
    !isValidWebsiteId(input.websiteId) ||
    !(await websiteExists(input.websiteId, input.user.idToken))
  ) {
    throw new AuthError("Website not found.", 404);
  }

  const existing = await readWebsiteMeta(input.websiteId, input.user);
  if (existing) {
    if (existing.ownerUid !== input.user.uid) {
      throw new AuthError("You do not have access to this website.", 403);
    }

    const nextName = stringField(input.businessName);
    const updated = {
      ...existing,
      businessName: nextName || existing.businessName,
      updatedAt: nextName && nextName !== existing.businessName
        ? new Date().toISOString()
        : existing.updatedAt,
    };
    const subscription = await readSubscription(input.websiteId);
    await writeWebsiteMeta(updated, input.user, subscription);
    return updated;
  }

  return createOwnedWebsite(input);
}

async function toManagedWebsite(
  websiteId: string,
  meta: WebsiteMeta | null,
  subscription: WebsiteSubscription | null,
  idToken?: string,
): Promise<ManagedWebsite | null> {
  if (!(await websiteExists(websiteId, idToken))) {
    return null;
  }

  const businessName =
    stringField(meta?.businessName) ||
    (await readWebsiteTitle(websiteId, idToken)) ||
    "Untitled site";

  return {
    websiteId,
    businessName,
    createdAt: meta?.createdAt || subscription?.createdAt || new Date().toISOString(),
    updatedAt:
      meta?.updatedAt || subscription?.updatedAt || meta?.createdAt || new Date().toISOString(),
    previewPath: `/api/preview/${websiteId}/index.html`,
    domain: subscription?.domain ?? null,
    subscriptionStatus: subscription?.status ?? null,
    amountZar: subscription?.amountZar ?? null,
    frequency: subscription?.frequency ?? null,
    mocked: Boolean(subscription?.mocked),
  };
}

async function migrateDiskSites(user: AuthUser): Promise<void> {
  if (await isUserMigrated(user)) return;

  for (const websiteId of await listWebsiteIds()) {
    const meta = await readDiskMeta(websiteId);
    if (meta?.ownerUid !== user.uid) continue;
    const subscription = await readSubscription(websiteId);
    await writeWebsiteMeta(meta, user, subscription);
  }

  await markUserMigrated(user);
}

async function listDiskOwnedWebsites(user: AuthUser): Promise<ManagedWebsite[]> {
  const sites: ManagedWebsite[] = [];

  for (const websiteId of await listWebsiteIds()) {
    const meta = await readDiskMeta(websiteId);
    if (meta?.ownerUid !== user.uid) continue;
    let subscription: WebsiteSubscription | null = null;
    try {
      subscription = await readSubscription(websiteId);
    } catch (error) {
      console.warn("Could not read subscription:", error);
    }
    const site = await toManagedWebsite(websiteId, meta, subscription, user.idToken);
    if (site) sites.push(site);
  }

  return sites;
}

export async function listManagedWebsites(user: AuthUser): Promise<ManagedWebsite[]> {
  let firestoreError: unknown;

  try {
    await upsertUserProfile(user);
    await migrateDiskSites(user);
  } catch (error) {
    firestoreError = error;
    console.warn("Firestore profile/migration failed:", error);
  }

  let records: StoredSite[] = [];
  try {
    records = await listSiteRecords(user);
  } catch (error) {
    firestoreError = firestoreError ?? error;
    console.warn("Firestore site list failed:", error);
  }

  const sitesById = new Map<string, ManagedWebsite>();

  for (const record of records) {
    let subscription = record.subscription ?? null;
    try {
      subscription = (await readSubscription(record.websiteId)) ?? subscription;
    } catch (error) {
      console.warn("Could not read subscription:", error);
    }
    if (subscription && subscription.updatedAt !== record.subscription?.updatedAt) {
      try {
        await writeWebsiteMeta(record, user, subscription);
      } catch (error) {
        console.warn("Could not sync subscription into Firestore:", error);
      }
    }
    const site = await toManagedWebsite(
      record.websiteId,
      record,
      subscription,
      user.idToken,
    );
    if (site) sitesById.set(site.websiteId, site);
  }

  for (const site of await listDiskOwnedWebsites(user)) {
    if (!sitesById.has(site.websiteId)) {
      sitesById.set(site.websiteId, site);
    }
  }

  const sites = [...sitesById.values()].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );

  if (sites.length === 0 && firestoreError) {
    throw firestoreError;
  }

  return sites;
}

export async function cancelOwnedSubscription(
  websiteId: string,
  user: AuthUser,
): Promise<{ mocked: boolean; warning?: string }> {
  const meta = await requireOwnedWebsite(websiteId, user);
  const subscription = await readSubscription(websiteId);

  if (!subscription || subscription.status === "cancelled") {
    return { mocked: Boolean(subscription?.mocked) };
  }

  if (subscription.status === "pending") {
    const next = {
      ...subscription,
      status: "cancelled" as const,
      updatedAt: new Date().toISOString(),
    };
    await writeSubscription(next);
    await writeWebsiteMeta({ ...meta, updatedAt: next.updatedAt }, user, next);
    return { mocked: subscription.mocked };
  }

  let warning: string | undefined;

  if (!subscription.mocked) {
    if (subscription.token) {
      await cancelPayfastSubscription(subscription.token);
    } else {
      warning =
        "The site was marked cancelled, but PayFast did not return a subscription token yet. Check PayFast if charges continue.";
    }
  }

  const next = {
    ...subscription,
    status: "cancelled" as const,
    updatedAt: new Date().toISOString(),
  };
  await writeSubscription(next);
  await writeWebsiteMeta({ ...meta, updatedAt: next.updatedAt }, user, next);

  return { mocked: subscription.mocked, warning };
}

export async function deleteOwnedWebsite(
  websiteId: string,
  user: AuthUser,
): Promise<{ warning?: string }> {
  await requireOwnedWebsite(websiteId, user);

  let warning: string | undefined;
  const subscription = await readSubscription(websiteId);
  if (subscription && subscription.status !== "cancelled") {
    const cancelled = await cancelOwnedSubscription(websiteId, user);
    warning = cancelled.warning;
  }

  await deleteSubscription(websiteId);
  await deleteWebsiteDirectory(websiteId, user.idToken);
  await deleteSiteRecord(user, websiteId);
  return { warning };
}
