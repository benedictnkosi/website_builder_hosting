import { NextResponse } from "next/server";

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

export class RateLimitError extends Error {
  statusCode = 429;
  retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super("Too many requests. Please wait and try again.");
    this.name = "RateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function clientKey(request: Request, uid?: string): string {
  if (uid) return `uid:${uid}`;
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
  return `ip:${ip}`;
}

export function consumeRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): void {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }

  if (existing.count >= limit) {
    throw new RateLimitError(Math.max(1, Math.ceil((existing.resetAt - now) / 1000)));
  }

  existing.count += 1;
}

export function jsonRateLimitError(error: unknown): NextResponse | null {
  if (!(error instanceof RateLimitError)) {
    return null;
  }

  return NextResponse.json(
    { success: false, error: error.message },
    {
      status: 429,
      headers: { "Retry-After": String(error.retryAfterSeconds) },
    },
  );
}
