"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import BrandMark from "@/components/BrandMark";
import { useAuth } from "@/components/AuthProvider";

function GoogleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

function postAuthPath(isNewUser: boolean): string {
  return isNewUser ? "/builder?new=1" : "/dashboard";
}

function useLandingAuth() {
  const { signInWithGoogle } = useAuth();
  const router = useRouter();
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGoogleSignIn() {
    setSigningIn(true);
    setError(null);

    try {
      const isNewUser = await signInWithGoogle();
      router.push(postAuthPath(isNewUser));
    } catch (err) {
      const code =
        typeof err === "object" && err && "code" in err ? String(err.code) : "";

      if (
        code === "auth/popup-closed-by-user" ||
        code === "auth/cancelled-popup-request"
      ) {
        setError(null);
      } else {
        setError("Could not sign in with Google. Please try again.");
      }
    } finally {
      setSigningIn(false);
    }
  }

  return { signingIn, error, handleGoogleSignIn };
}

export function LandingSignedInRedirect() {
  const { user, loading, authFetch } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading || !user) return;

    let cancelled = false;

    void (async () => {
      try {
        const response = await authFetch("/api/sites");
        const data = (await response.json()) as { sites?: unknown[] };
        if (cancelled) return;
        const hasSites = Array.isArray(data.sites) && data.sites.length > 0;
        router.replace(hasSites ? "/dashboard" : "/builder?new=1");
      } catch {
        if (!cancelled) router.replace("/dashboard");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authFetch, loading, router, user]);

  if (loading || !user) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--background)]">
      <div className="flex flex-col items-center gap-3">
        <BrandMark compact />
        <p className="text-sm text-stone-500">Loading your workspace...</p>
      </div>
    </div>
  );
}

export function LandingHeaderSignIn({
  className = "",
}: {
  className?: string;
}) {
  const { signingIn, handleGoogleSignIn } = useLandingAuth();

  return (
    <button
      type="button"
      onClick={handleGoogleSignIn}
      disabled={signingIn}
      className={`inline-flex items-center justify-center gap-2 rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      <GoogleIcon />
      {signingIn ? "Signing in..." : "Sign in"}
    </button>
  );
}

function PreviewStartButton({
  signingIn,
  onClick,
}: {
  signingIn: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={signingIn}
      className="inline-flex items-center justify-center rounded-full bg-teal-800 px-6 py-3 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(17,94,89,0.28)] transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {signingIn ? "Signing in..." : "Start a free preview"}
    </button>
  );
}

export function LandingHeroSignIn() {
  const { signingIn, error, handleGoogleSignIn } = useLandingAuth();

  return (
    <div className="mt-8 flex flex-col items-center gap-3">
      <PreviewStartButton signingIn={signingIn} onClick={handleGoogleSignIn} />
      <p className="text-sm text-stone-500">
        You&apos;ll continue with Google. Free to preview. No payment to start.
      </p>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </div>
  );
}

export function LandingCtaSignIn() {
  const { signingIn, error, handleGoogleSignIn } = useLandingAuth();

  return (
    <div className="flex flex-col items-start gap-2">
      <PreviewStartButton signingIn={signingIn} onClick={handleGoogleSignIn} />
      <p className="text-sm text-stone-500">
        You&apos;ll continue with Google. Free to preview.
      </p>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
