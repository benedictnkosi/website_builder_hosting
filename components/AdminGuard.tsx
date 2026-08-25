"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import BrandMark from "@/components/BrandMark";
import { useAuth } from "@/components/AuthProvider";

export default function AdminGuard({ children }: { children: ReactNode }) {
  const { user, loading, authFetch } = useAuth();
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    if (loading) return;

    if (!user) {
      router.replace("/");
      setChecking(false);
      setAllowed(false);
      return;
    }

    let cancelled = false;

    async function verify() {
      try {
        const response = await authFetch("/api/admin/me");
        const data = (await response.json()) as {
          success?: boolean;
          admin?: boolean;
        };
        if (cancelled) return;
        if (response.ok && data.success && data.admin) {
          setAllowed(true);
        } else {
          setAllowed(false);
          router.replace("/dashboard");
        }
      } catch {
        if (!cancelled) {
          setAllowed(false);
          router.replace("/dashboard");
        }
      } finally {
        if (!cancelled) setChecking(false);
      }
    }

    void verify();
    return () => {
      cancelled = true;
    };
  }, [authFetch, loading, router, user]);

  if (loading || checking) {
    return (
      <main className="flex min-h-0 flex-1 items-center justify-center px-4 py-16">
        <div className="flex flex-col items-center gap-4">
          <span className="relative">
            <span className="absolute -inset-2 animate-ping rounded-2xl bg-teal-800/15" />
            <BrandMark compact />
          </span>
          <div className="h-1.5 w-40 overflow-hidden rounded-full bg-stone-200">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-teal-700" />
          </div>
          <p className="text-sm text-stone-500">Checking admin access</p>
        </div>
      </main>
    );
  }

  if (!allowed) {
    return (
      <main className="flex min-h-0 flex-1 items-center justify-center px-4 py-16">
        <div className="max-w-md text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-800">
            Admin
          </p>
          <h1 className="mt-3 text-2xl font-semibold text-stone-900">
            Access denied
          </h1>
          <p className="mt-2 text-sm text-stone-600">
            Your account is not on the admin allowlist.
          </p>
          <Link
            href="/dashboard"
            className="mt-6 inline-flex rounded-full bg-teal-800 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-700"
          >
            Back to dashboard
          </Link>
        </div>
      </main>
    );
  }

  return children;
}
