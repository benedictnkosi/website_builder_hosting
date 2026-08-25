import "server-only";

import {
  AuthError,
  isGuestUser,
  requireUser,
  type AuthUser,
} from "@/lib/auth-server";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function getAdminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS?.trim() ?? "";
  if (!raw) return [];
  return raw
    .split(",")
    .map((part) => normalizeEmail(part))
    .filter(Boolean);
}

export function isAdminEmail(email: string | undefined | null): boolean {
  if (!email) return false;
  const allowed = getAdminEmails();
  if (allowed.length === 0) return false;
  return allowed.includes(normalizeEmail(email));
}

export function isAdminUser(user: AuthUser): boolean {
  if (isGuestUser(user)) return false;
  return isAdminEmail(user.email);
}

export async function requireAdmin(request: Request): Promise<AuthUser> {
  const user = await requireUser(request);
  if (!isAdminUser(user)) {
    throw new AuthError("Admin access required.", 403);
  }
  return user;
}
