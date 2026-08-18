"use client";

import { useRouter } from "next/navigation";
import BrandMark from "@/components/BrandMark";
import { useAuth } from "@/components/AuthProvider";

export default function AppHeader() {
  const { user, signOut } = useAuth();
  const router = useRouter();

  async function handleSignOut() {
    await signOut();
    router.replace("/");
  }

  return (
    <header className="sticky top-0 z-20 border-b border-stone-200/80 bg-[color:var(--background)]/85 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-[90rem] items-center justify-between px-4 py-3 sm:px-5">
        <BrandMark />
        <div className="flex items-center gap-3">
          <span className="hidden max-w-[16rem] truncate text-sm text-stone-600 sm:inline">
            {user?.displayName || user?.email}
          </span>
          <button
            type="button"
            onClick={handleSignOut}
            className="rounded-full border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 transition hover:bg-stone-50"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
