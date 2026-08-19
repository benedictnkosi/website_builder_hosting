"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import BrandMark from "@/components/BrandMark";
import { useAuth } from "@/components/AuthProvider";

export default function AuthGuard({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/");
    }
  }, [loading, user, router]);

  if (loading) {
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
          <p className="text-sm text-stone-500">Loading your workspace</p>
        </div>
      </main>
    );
  }

  if (!user) {
    return null;
  }

  return children;
}
