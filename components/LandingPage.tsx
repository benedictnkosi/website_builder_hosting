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

function GoogleButton({
  signingIn,
  onClick,
  className = "",
}: {
  signingIn: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={signingIn}
      className={`inline-flex items-center justify-center gap-3 rounded-full bg-teal-800 px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(17,94,89,0.28)] transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white">
        <GoogleIcon />
      </span>
      {signingIn ? "Signing in..." : "Continue with Google"}
    </button>
  );
}

function ProductPreview() {
  return (
    <div className="overflow-hidden rounded-[1.6rem] border border-stone-200/80 bg-white shadow-[0_24px_80px_rgba(28,25,23,0.12)]">
      <div className="flex items-center gap-2 border-b border-stone-200 bg-stone-50 px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-stone-300" />
        <span className="h-2.5 w-2.5 rounded-full bg-stone-300" />
        <span className="h-2.5 w-2.5 rounded-full bg-stone-300" />
        <div className="ml-3 flex-1 rounded-full bg-white px-3 py-1 text-center text-[11px] text-stone-400 ring-1 ring-stone-200">
          thandoplumbing.co.za
        </div>
      </div>
      <div className="grid min-h-[22rem] lg:grid-cols-[18rem_1fr]">
        <div className="flex flex-col gap-3 border-b border-stone-100 bg-stone-50/80 p-4 lg:border-b-0 lg:border-r">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-teal-800">
            Chat
          </p>
          <div className="max-w-[92%] rounded-2xl rounded-tl-md bg-white px-3 py-2.5 text-xs leading-relaxed text-stone-700 shadow-sm ring-1 ring-stone-200/80">
            Tell me about your business — name, services, and phone number.
          </div>
          <div className="ml-auto max-w-[88%] rounded-2xl rounded-tr-md bg-teal-800 px-3 py-2.5 text-xs leading-relaxed text-white">
            Thando Plumbing in Durban. Geyser repairs, blocked drains, 082 123 4567.
          </div>
          <div className="max-w-[92%] rounded-2xl rounded-tl-md bg-white px-3 py-2.5 text-xs leading-relaxed text-stone-700 shadow-sm ring-1 ring-stone-200/80">
            Got it. Building your website and images...
          </div>
        </div>
        <div className="relative overflow-hidden bg-[#f7f3ea] p-5">
          <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-teal-700/10" />
          <div className="relative rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200/70">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-teal-800">
              Durban
            </p>
            <h3 className="mt-2 text-2xl font-semibold tracking-tight text-stone-900">
              Thando Plumbing
            </h3>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-stone-600">
              Fast geyser repairs, blocked drains, and leak detection. Call or WhatsApp
              today.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="rounded-full bg-teal-800 px-3 py-1.5 text-[11px] font-semibold text-white">
                Call now
              </span>
              <span className="rounded-full border border-stone-300 px-3 py-1.5 text-[11px] font-semibold text-stone-700">
                WhatsApp
              </span>
            </div>
          </div>
          <div className="relative mt-3 grid grid-cols-3 gap-2">
            {["Geyser repairs", "Blocked drains", "Leak detection"].map((item) => (
              <div
                key={item}
                className="rounded-xl bg-white px-3 py-3 text-[11px] font-medium text-stone-700 shadow-sm ring-1 ring-stone-200/70"
              >
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const { user, loading, signInWithGoogle } = useAuth();
  const router = useRouter();
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user) {
      router.replace("/builder");
    }
  }, [loading, user, router]);

  async function handleGoogleSignIn() {
    setSigningIn(true);
    setError(null);

    try {
      await signInWithGoogle();
      router.push("/builder");
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

  if (loading || user) {
    return (
      <main className="relative flex flex-1 items-center justify-center overflow-hidden px-4 py-16">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 top-16 h-64 w-64 -translate-x-1/2 rounded-full bg-teal-700/10 blur-3xl" />
        </div>
        <div className="flex flex-col items-center gap-3">
          <BrandMark compact />
          <p className="text-sm text-stone-500">Loading your workspace...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="relative isolate min-h-full overflow-x-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-[-8rem] h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-teal-700/15 blur-3xl" />
        <div className="absolute right-[-6rem] top-40 h-72 w-72 rounded-full bg-amber-300/30 blur-3xl" />
        <div className="absolute bottom-[-4rem] left-[-5rem] h-80 w-80 rounded-full bg-teal-900/10 blur-3xl" />
      </div>

      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 sm:px-6 lg:px-8">
        <BrandMark />
        <GoogleButton
          signingIn={signingIn}
          onClick={handleGoogleSignIn}
          className="hidden sm:inline-flex"
        />
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-col px-4 pb-16 pt-6 sm:px-6 lg:px-8">
        <section className="mx-auto max-w-3xl text-center">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.24em] text-teal-800">
            Built in one conversation
          </p>
          <h1 className="text-4xl font-semibold tracking-tight text-stone-900 sm:text-6xl sm:leading-[1.05]">
            Describe your business.
            <span className="mt-1 block text-teal-800">Get a website.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-stone-600">
            Chat about your services, contact details, and location. We write the
            copy, design the pages, and give you a live preview you can edit.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3">
            <GoogleButton signingIn={signingIn} onClick={handleGoogleSignIn} />
            <p className="text-sm text-stone-500">
              Sign in to start. No credit card needed.
            </p>
            {error ? <p className="text-sm text-red-700">{error}</p> : null}
          </div>
        </section>

        <section className="mx-auto mt-14 w-full max-w-5xl">
          <ProductPreview />
        </section>

        <section className="mx-auto mt-14 grid w-full max-w-5xl gap-4 sm:grid-cols-3">
          {[
            {
              step: "01",
              title: "Chat to build",
              body: "Tell us what you do in plain language. No templates or long forms.",
            },
            {
              step: "02",
              title: "Preview instantly",
              body: "See a live site, then ask for changes like phone numbers or copy.",
            },
            {
              step: "03",
              title: "Deploy when ready",
              body: "Publish to your domain once the site looks the way you want.",
            },
          ].map((item) => (
            <article
              key={item.step}
              className="rounded-2xl border border-stone-200/80 bg-white/80 p-5 shadow-sm backdrop-blur-sm"
            >
              <p className="text-xs font-semibold tracking-[0.18em] text-teal-800">
                {item.step}
              </p>
              <h2 className="mt-3 text-base font-semibold text-stone-900">
                {item.title}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-stone-600">
                {item.body}
              </p>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
