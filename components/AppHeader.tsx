"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import BrandMark from "@/components/BrandMark";
import TokenControls from "@/components/TokenControls";
import { useAuth } from "@/components/AuthProvider";
import { trackStartBuilder } from "@/lib/analytics";

export default function AppHeader() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const onDashboard = pathname === "/dashboard";

  async function handleSignOut() {
    await signOut();
    router.replace("/");
  }

  return (
    <header className="sticky top-0 z-20 border-b border-stone-200/80 bg-[color:var(--background)]/85 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-[90rem] items-center justify-between px-4 py-3 sm:px-5">
        <Link href="/dashboard" aria-label="Go to dashboard">
          <BrandMark />
        </Link>
        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/dashboard"
            className={`hidden rounded-full px-3 py-1.5 text-sm font-medium transition sm:inline ${
              onDashboard
                ? "bg-teal-800 text-white"
                : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"
            }`}
          >
            Sites
          </Link>
          <Link
            href={onDashboard ? "#support" : "/dashboard#support"}
            className="hidden rounded-full px-3 py-1.5 text-sm font-medium text-stone-600 transition hover:bg-stone-100 hover:text-stone-900 sm:inline"
          >
            Support
          </Link>
          <Link
            href="/builder?new=1"
            onClick={() => trackStartBuilder("header")}
            className="rounded-full border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 transition hover:bg-stone-50"
          >
            New site
          </Link>
          <TokenControls />
          <span className="hidden max-w-[16rem] truncate text-sm text-stone-600 lg:inline">
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
