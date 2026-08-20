"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import BrandMark from "@/components/BrandMark";
import EditsControls from "@/components/EditsControls";
import { useAuth } from "@/components/AuthProvider";
import { trackStartBuilder } from "@/lib/analytics";

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
      {open ? (
        <path
          d="M6 6l12 12M18 6L6 18"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      ) : (
        <path
          d="M5 7h14M5 12h14M5 17h14"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4 text-stone-500" fill="none" aria-hidden="true">
      <path
        d="M5 7.5l5 5 5-5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function navLinkClass(active: boolean): string {
  return `rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
    active
      ? "bg-teal-800 text-white shadow-sm"
      : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"
  }`;
}

export default function AppHeader() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const onDashboard = pathname === "/dashboard";
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);

  const displayName = user?.displayName || user?.email || "Account";
  const initial = displayName.trim().charAt(0).toUpperCase() || "A";
  const supportHref = onDashboard ? "#support" : "/dashboard#support";

  useEffect(() => {
    setMobileOpen(false);
    setAccountOpen(false);
  }, [pathname]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMobileOpen(false);
        setAccountOpen(false);
      }
    }
    function onPointerDown(event: MouseEvent) {
      if (!accountRef.current?.contains(event.target as Node)) {
        setAccountOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onPointerDown);
    };
  }, []);

  async function handleSignOut() {
    setAccountOpen(false);
    setMobileOpen(false);
    await signOut();
    router.replace("/");
  }

  return (
    <header className="sticky top-0 z-40 border-b border-stone-200/80 bg-[color:var(--background)]/85 backdrop-blur-md">
      <div className="mx-auto flex w-full min-w-0 max-w-[90rem] items-center justify-between gap-2 px-4 py-2.5 sm:gap-3 sm:px-5">
        <Link href="/dashboard" aria-label="Go to dashboard" onClick={() => setMobileOpen(false)}>
          <BrandMark />
        </Link>

        <nav
          aria-label="Primary"
          className="hidden items-center rounded-full bg-white/80 p-1 shadow-sm ring-1 ring-stone-200/80 md:flex"
        >
          <Link href="/dashboard" className={navLinkClass(onDashboard)}>
            Sites
          </Link>
          <Link href={supportHref} className={navLinkClass(false)}>
            Support
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/builder?new=1"
            onClick={() => trackStartBuilder("header")}
            className="hidden rounded-full bg-teal-800 px-3.5 py-1.5 text-sm font-semibold text-white transition hover:bg-teal-700 sm:inline-flex"
          >
            New site
          </Link>
          <EditsControls />

          <div className="relative z-50 hidden md:block" ref={accountRef}>
            <button
              type="button"
              onClick={() => setAccountOpen((current) => !current)}
              className="inline-flex items-center gap-2 rounded-full border border-stone-300 bg-white py-1 pl-1 pr-2.5 text-sm font-medium text-stone-700 transition hover:bg-stone-50"
              aria-expanded={accountOpen}
              aria-haspopup="menu"
              aria-label="Account menu"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-teal-800 text-xs font-semibold text-white">
                {initial}
              </span>
              <span className="hidden max-w-[9rem] truncate lg:inline">{displayName}</span>
              <ChevronIcon />
            </button>
            {accountOpen ? (
              <div
                role="menu"
                className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-2xl border border-stone-200 bg-white py-2 shadow-[0_16px_40px_rgba(28,25,23,0.14)]"
              >
                <div className="border-b border-stone-100 px-3.5 py-2.5">
                  <p className="truncate text-sm font-semibold text-stone-900">
                    {user?.displayName || "Signed in"}
                  </p>
                  {user?.email ? (
                    <p className="mt-0.5 truncate text-xs text-stone-500">{user.email}</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => void handleSignOut()}
                  className="mt-1 flex w-full px-3.5 py-2 text-left text-sm font-medium text-stone-700 transition hover:bg-stone-50"
                >
                  Sign out
                </button>
              </div>
            ) : null}
          </div>

          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-stone-300 bg-white text-stone-800 transition hover:bg-stone-50 md:hidden"
            aria-expanded={mobileOpen}
            aria-controls="app-mobile-nav"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            onClick={() => setMobileOpen((current) => !current)}
          >
            <MenuIcon open={mobileOpen} />
          </button>
        </div>
      </div>

      {mobileOpen ? (
        <div
          id="app-mobile-nav"
          className="border-t border-stone-200/80 bg-[color:var(--background)]/95 px-4 py-4 backdrop-blur-md md:hidden"
        >
          <nav aria-label="Primary" className="flex flex-col gap-1">
            <Link
              href="/dashboard"
              onClick={() => setMobileOpen(false)}
              className={`rounded-2xl px-4 py-3 text-sm font-medium ${
                onDashboard ? "bg-teal-800 text-white" : "text-stone-700 hover:bg-white"
              }`}
            >
              Sites
            </Link>
            <Link
              href={supportHref}
              onClick={() => setMobileOpen(false)}
              className="rounded-2xl px-4 py-3 text-sm font-medium text-stone-700 transition hover:bg-white"
            >
              Support
            </Link>
            <Link
              href="/builder?new=1"
              onClick={() => {
                trackStartBuilder("header");
                setMobileOpen(false);
              }}
              className="mt-2 inline-flex items-center justify-center rounded-full bg-teal-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-700 sm:hidden"
            >
              New site
            </Link>
            <div className="mt-3 rounded-2xl border border-stone-200 bg-white px-4 py-3">
              <p className="truncate text-sm font-semibold text-stone-900">
                {user?.displayName || "Signed in"}
              </p>
              {user?.email ? (
                <p className="mt-0.5 truncate text-xs text-stone-500">{user.email}</p>
              ) : null}
              <button
                type="button"
                onClick={() => void handleSignOut()}
                className="mt-3 w-full rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-50"
              >
                Sign out
              </button>
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
