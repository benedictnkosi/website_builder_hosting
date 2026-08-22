import "server-only";

import { NextResponse } from "next/server";
import type { AuthUser } from "@/lib/auth-server";
import { getAdminFirestore, isFirebaseAdminConfigured } from "@/lib/firebase-admin";
import { readUserProfile } from "@/lib/firestore";
import {
  EDIT_EDITS_COST,
  EDIT_TOPUP_ZAR,
  GENERATE_EDITS_COST,
  SIGNUP_EDITS_GRANT,
  SUBSCRIPTION_EDITS_GRANT,
  formatZar,
} from "@/lib/pricing";

export class InsufficientEditsError extends Error {
  statusCode = 402;
  editsRemaining: number;
  required: number;

  constructor(editsRemaining: number, required: number, message: string) {
    super(message);
    this.name = "InsufficientEditsError";
    this.editsRemaining = editsRemaining;
    this.required = required;
  }
}

export function generateRequiresEditsError(editsRemaining: number): InsufficientEditsError {
  return new InsufficientEditsError(
    editsRemaining,
    GENERATE_EDITS_COST,
    `Generating a new site requires 2 Edits. You currently have ${editsRemaining}. Please top up.`,
  );
}

export function editRequiresEditsError(editsRemaining: number): InsufficientEditsError {
  return new InsufficientEditsError(
    editsRemaining,
    EDIT_EDITS_COST,
    `Updating your site requires 1 Edit. Please top up for ${formatZar(EDIT_TOPUP_ZAR)}.`,
  );
}

function asEditCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function asGrantIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

export function jsonEditError(error: unknown): NextResponse | null {
  if (error instanceof InsufficientEditsError) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        editTopup: true,
        editsRemaining: error.editsRemaining,
        requiredEdits: error.required,
      },
      { status: 402 },
    );
  }
  return null;
}

async function applyEditDelta(
  uid: string,
  delta: number,
  grantId?: string,
): Promise<number> {
  if (!uid) {
    throw new Error("A user id is required to update edits.");
  }
  if (!isFirebaseAdminConfigured()) {
    throw new Error(
      "Firebase Admin is required to update edit balances. Paste the service account JSON into FIREBASE_SERVICE_ACCOUNT.",
    );
  }

  const db = getAdminFirestore();
  const ref = db.collection("users").doc(uid);
  const now = new Date().toISOString();

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = (snap.data() ?? {}) as Record<string, unknown>;
    const grants = asGrantIds(data.processedEditGrants);

    if (grantId && grants.includes(grantId)) {
      return asEditCount(data.editsRemaining);
    }

    const current = asEditCount(data.editsRemaining);
    const next = Math.max(0, current + delta);
    const payload: Record<string, unknown> = {
      uid,
      editsRemaining: next,
      updatedAt: now,
    };

    if (!snap.exists && !data.createdAt) {
      payload.createdAt = now;
    }

    if (grantId) {
      payload.processedEditGrants = [...grants, grantId].slice(-500);
      if (grantId === "signup") {
        payload.editsGrantedSignup = true;
      }
    }

    tx.set(ref, payload, { merge: true });
    return next;
  });
}

export async function readEditsRemaining(user: AuthUser): Promise<number> {
  if (isFirebaseAdminConfigured()) {
    const snap = await getAdminFirestore().collection("users").doc(user.uid).get();
    return asEditCount(snap.get("editsRemaining"));
  }

  const data = await readUserProfile(user);
  return asEditCount(data?.editsRemaining);
}

export async function ensureSignupEdits(user: AuthUser): Promise<number> {
  if (!isFirebaseAdminConfigured()) {
    return readEditsRemaining(user);
  }
  return applyEditDelta(user.uid, SIGNUP_EDITS_GRANT, "signup");
}

export async function adoptGuestEdits(
  user: AuthUser,
  remaining: number,
): Promise<number> {
  if (!isFirebaseAdminConfigured()) {
    return readEditsRemaining(user);
  }

  const next = Math.max(0, Math.round(remaining));
  const db = getAdminFirestore();
  const ref = db.collection("users").doc(user.uid);
  const now = new Date().toISOString();

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = (snap.data() ?? {}) as Record<string, unknown>;
    const grants = asGrantIds(data.processedEditGrants);

    if (grants.includes("signup") || grants.includes("guest-sync") || data.editsGrantedSignup === true) {
      return asEditCount(data.editsRemaining);
    }

    tx.set(
      ref,
      {
        uid: user.uid,
        editsRemaining: next,
        updatedAt: now,
        createdAt: typeof data.createdAt === "string" ? data.createdAt : now,
        editsGrantedSignup: true,
        processedEditGrants: [...grants, "signup", "guest-sync"].slice(-500),
      },
      { merge: true },
    );
    return next;
  });
}

export async function grantSubscriptionEdits(uid: string, websiteId: string): Promise<number> {
  return applyEditDelta(uid, SUBSCRIPTION_EDITS_GRANT, `subscription:${websiteId}`);
}

export async function grantTopupEdits(
  uid: string,
  paymentId: string,
  edits: number,
): Promise<number> {
  return applyEditDelta(uid, edits, `topup:${paymentId}`);
}

export async function consumeEdits(
  uid: string,
  amount: number,
  usageId?: string,
): Promise<number> {
  const edits = Math.max(0, Math.round(amount));
  if (edits <= 0) {
    if (!isFirebaseAdminConfigured()) return 0;
    const snap = await getAdminFirestore().collection("users").doc(uid).get();
    return asEditCount(snap.get("editsRemaining"));
  }
  return applyEditDelta(uid, -edits, usageId);
}

export async function assertHasEdits(user: AuthUser, minimum: number): Promise<number> {
  const remaining = await ensureSignupEdits(user);
  if (remaining < minimum) {
    if (minimum >= GENERATE_EDITS_COST) {
      throw generateRequiresEditsError(remaining);
    }
    throw editRequiresEditsError(remaining);
  }
  return remaining;
}

export async function assertGenerateEdits(user: AuthUser): Promise<number> {
  return assertHasEdits(user, GENERATE_EDITS_COST);
}

export async function assertEditEdits(user: AuthUser): Promise<number> {
  return assertHasEdits(user, EDIT_EDITS_COST);
}

export async function consumeGenerateEdits(uid: string, jobId: string): Promise<number> {
  return consumeEdits(uid, GENERATE_EDITS_COST, `generate:${jobId}`);
}

export async function consumeEditEdits(uid: string, jobId: string): Promise<number> {
  return consumeEdits(uid, EDIT_EDITS_COST, `edit:${jobId}`);
}
