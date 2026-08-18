import "server-only";

import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/session-cookie";

export type AuthUser = {
  uid: string;
  email?: string;
  displayName?: string;
  idToken: string;
};

export class AuthError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 401) {
    super(message);
    this.name = "AuthError";
    this.statusCode = statusCode;
  }
}

export function isValidUid(uid: string): boolean {
  return /^[a-zA-Z0-9_-]{1,128}$/.test(uid);
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

function bearerToken(request: Request): string {
  const header = request.headers.get("authorization")?.trim() ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1]?.trim() ?? "";
}

function cookieToken(request: Request): string {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE) {
      try {
        return decodeURIComponent(rest.join("="));
      } catch {
        return rest.join("=");
      }
    }
  }
  return "";
}

export function jsonAuthError(error: unknown): NextResponse | null {
  if (error instanceof AuthError) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: error.statusCode },
    );
  }
  return null;
}

export async function verifyIdToken(idToken: string): Promise<AuthUser> {
  const trimmed = idToken.trim();
  if (!trimmed) {
    throw new AuthError("Sign in to continue.");
  }

  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim();
  if (!apiKey) {
    throw new AuthError("Firebase Auth is not configured.", 500);
  }

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: trimmed }),
      signal: AbortSignal.timeout(10_000),
    },
  );

  const data = (await response.json().catch(() => null)) as {
    users?: Array<{
      localId?: string;
      email?: string;
      displayName?: string;
    }>;
  } | null;

  const uid = data?.users?.[0]?.localId?.trim() ?? "";
  if (!response.ok || !isValidUid(uid)) {
    throw new AuthError("Your session expired. Sign in again.");
  }

  return {
    uid,
    email: data?.users?.[0]?.email?.trim() || undefined,
    displayName: data?.users?.[0]?.displayName?.trim() || undefined,
    idToken: trimmed,
  };
}

export async function requireUser(request: Request): Promise<AuthUser> {
  const idToken = bearerToken(request) || cookieToken(request);
  return verifyIdToken(idToken);
}

export function readSessionToken(request: Request): string {
  return bearerToken(request) || cookieToken(request);
}
