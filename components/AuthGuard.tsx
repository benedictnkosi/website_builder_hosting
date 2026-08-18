"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
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
        <p className="text-sm text-stone-500">Loading your workspace...</p>
      </main>
    );
  }

  if (!user) {
    return null;
  }

  return children;
}
