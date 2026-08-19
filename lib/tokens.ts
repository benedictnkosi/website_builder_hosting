import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import { NextResponse } from "next/server";
import type { AuthUser } from "@/lib/auth-server";
import { getAdminFirestore, isFirebaseAdminConfigured } from "@/lib/firebase-admin";
import { readUserProfile } from "@/lib/firestore";
import {
  CHAT_MIN_TOKENS,
  EDIT_MIN_TOKENS,
  GENERATE_MIN_TOKENS,
  SIGNUP_TOKEN_GRANT,
  SUBSCRIPTION_TOKEN_GRANT,
  TOKEN_TOPUP_TOKENS,
} from "@/lib/pricing";

export class InsufficientTokensError extends Error {
  statusCode = 402;
  tokenBalance: number;

  constructor(tokenBalance: number) {
    super("You don't have enough tokens to continue. Buy more tokens to keep building or make your website live now.");
    this.name = "InsufficientTokensError";
    this.tokenBalance = tokenBalance;
  }
}

export const MOCK_TOKEN_USAGE = {
  generate: 3_500,
  edit: 5_000,
  image: 700,
  chat: 180,
  plan: 80,
} as const;

export const FALLBACK_TOKEN_USAGE = {
  generate: 8_000,
  edit: 4_000,
  image: 1_500,
  chat: 400,
  plan: 200,
} as const;

export type TokenUsageKind = "generate" | "edit" | "chat" | "image" | "plan";

type TokenSpendContext = {
  uid: string;
  kind?: TokenUsageKind;
};

const tokenSpend = new AsyncLocalStorage<TokenSpendContext>();

const USAGE_COLLECTION = "tokenUsages";

function usageDocId(usageId: string): string {
  return usageId.replaceAll("/", "_").slice(0, 700);
}

function asTokenCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function asGrantIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

export function jsonTokenError(error: unknown): NextResponse | null {
  if (error instanceof InsufficientTokensError) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        tokenTopup: true,
        tokenBalance: error.tokenBalance,
      },
      { status: 402 },
    );
  }
  return null;
}

export interface OpenAITokenBreakdown {
  total: number;
  inputTokens: number;
  outputTokens: number;
}

export function tokensFromOpenAIPayload(payload: unknown): number {
  return tokenBreakdownFromOpenAIPayload(payload).total;
}

export function tokenBreakdownFromOpenAIPayload(payload: unknown): OpenAITokenBreakdown {
  if (!payload || typeof payload !== "object") return { total: 0, inputTokens: 0, outputTokens: 0 };
  const usage = (payload as { usage?: unknown }).usage;
  if (!usage || typeof usage !== "object") return { total: 0, inputTokens: 0, outputTokens: 0 };

  const record = usage as Record<string, unknown>;
  const input = typeof record.input_tokens === "number" ? Math.max(0, Math.round(record.input_tokens)) : 0;
  const output = typeof record.output_tokens === "number" ? Math.max(0, Math.round(record.output_tokens)) : 0;

  let total: number;
  if (typeof record.total_tokens === "number" && Number.isFinite(record.total_tokens)) {
    total = Math.max(0, Math.round(record.total_tokens));
  } else {
    total = input + output;
  }

  return { total, inputTokens: input, outputTokens: output };
}

async function applyTokenDelta(
  uid: string,
  delta: number,
  grantId?: string,
  kind?: TokenUsageKind,
  breakdown?: { inputTokens?: number; outputTokens?: number },
): Promise<number> {
  if (!uid) {
    throw new Error("A user id is required to update tokens.");
  }
  if (!isFirebaseAdminConfigured()) {
    throw new Error(
      "Firebase Admin is required to update token balances. Paste the service account JSON into FIREBASE_SERVICE_ACCOUNT.",
    );
  }

  const db = getAdminFirestore();
  const ref = db.collection("users").doc(uid);
  const now = new Date().toISOString();

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = (snap.data() ?? {}) as Record<string, unknown>;
    const grants = asGrantIds(data.processedTokenGrants);

    if (grantId && grants.includes(grantId)) {
      return asTokenCount(data.tokenBalance);
    }

    const current = asTokenCount(data.tokenBalance);
    const next = Math.max(0, current + delta);
    const payload: Record<string, unknown> = {
      uid,
      tokenBalance: next,
      updatedAt: now,
    };

    if (!snap.exists && !data.createdAt) {
      payload.createdAt = now;
    }

    if (grantId) {
      payload.processedTokenGrants = [...grants, grantId].slice(-500);
      if (grantId === "signup") {
        payload.tokensGrantedSignup = true;
      }
    }

    tx.set(ref, payload, { merge: true });

    if (delta < 0) {
      const spent = current - next;
      if (spent > 0) {
        const usageRef = grantId
          ? ref.collection(USAGE_COLLECTION).doc(usageDocId(grantId))
          : ref.collection(USAGE_COLLECTION).doc();
        const usage: Record<string, unknown> = {
          uid,
          tokens: spent,
          createdAt: now,
          balanceAfter: next,
        };
        if (kind) usage.kind = kind;
        if (grantId) usage.usageId = grantId;
        if (breakdown?.inputTokens) usage.inputTokens = breakdown.inputTokens;
        if (breakdown?.outputTokens) usage.outputTokens = breakdown.outputTokens;
        tx.set(usageRef, usage);
      }
    }

    return next;
  });
}

export async function readTokenBalance(user: AuthUser): Promise<number> {
  if (isFirebaseAdminConfigured()) {
    const snap = await getAdminFirestore().collection("users").doc(user.uid).get();
    return asTokenCount(snap.get("tokenBalance"));
  }

  const data = await readUserProfile(user);
  return asTokenCount(data?.tokenBalance);
}

export async function ensureSignupTokens(user: AuthUser): Promise<number> {
  if (!isFirebaseAdminConfigured()) {
    return readTokenBalance(user);
  }
  return applyTokenDelta(user.uid, SIGNUP_TOKEN_GRANT, "signup");
}

export async function grantSubscriptionTokens(uid: string, websiteId: string): Promise<number> {
  return applyTokenDelta(uid, SUBSCRIPTION_TOKEN_GRANT, `subscription:${websiteId}`);
}

export async function grantTopupTokens(uid: string, paymentId: string): Promise<number> {
  return applyTokenDelta(uid, TOKEN_TOPUP_TOKENS, `topup:${paymentId}`);
}

export async function deductUserTokens(uid: string, amount: number): Promise<number> {
  const tokens = Math.max(0, Math.round(amount));
  if (tokens <= 0) {
    if (!isFirebaseAdminConfigured()) return 0;
    const snap = await getAdminFirestore().collection("users").doc(uid).get();
    return asTokenCount(snap.get("tokenBalance"));
  }
  return applyTokenDelta(uid, -tokens);
}

export async function assertHasTokens(user: AuthUser, minimum: number): Promise<number> {
  const balance = await ensureSignupTokens(user);
  if (balance < minimum) {
    throw new InsufficientTokensError(balance);
  }
  return balance;
}

export async function assertGenerateTokens(
  user: AuthUser,
  options?: { allowDepleted?: boolean },
): Promise<number> {
  if (options?.allowDepleted) {
    return ensureSignupTokens(user);
  }
  return assertHasTokens(user, GENERATE_MIN_TOKENS);
}

export async function assertEditTokens(user: AuthUser): Promise<number> {
  return assertHasTokens(user, EDIT_MIN_TOKENS);
}

export async function assertChatTokens(user: AuthUser): Promise<number> {
  return assertHasTokens(user, CHAT_MIN_TOKENS);
}

export function runWithTokenSpend<T>(
  uid: string,
  fn: () => Promise<T>,
  kind?: TokenUsageKind,
): Promise<T> {
  return tokenSpend.run({ uid, kind }, fn);
}

export async function chargeTokens(
  amount: number,
  fallback = 0,
  usageId?: string,
  kind?: TokenUsageKind,
  breakdown?: { inputTokens?: number; outputTokens?: number },
): Promise<void> {
  const ctx = tokenSpend.getStore();
  const tokens = amount > 0 ? Math.round(amount) : fallback;
  if (!ctx || tokens <= 0) return;
  try {
    await applyTokenDelta(ctx.uid, -tokens, usageId, kind ?? ctx.kind, breakdown);
  } catch (error) {
    console.error("Could not deduct tokens:", error);
  }
}

export async function chargeOpenAIUsage(
  payload: unknown,
  fallback: number,
  kind?: TokenUsageKind,
): Promise<void> {
  const id =
    payload && typeof payload === "object" && "id" in payload
      ? String((payload as { id?: unknown }).id ?? "").trim()
      : "";
  const breakdown = tokenBreakdownFromOpenAIPayload(payload);
  await chargeTokens(
    breakdown.total,
    fallback,
    id ? `openai:${id}` : undefined,
    kind,
    { inputTokens: breakdown.inputTokens, outputTokens: breakdown.outputTokens },
  );
}
