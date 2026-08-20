"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  ANNUAL_PLAN_MONTHLY_ZAR,
  ANNUAL_PLAN_ZAR,
  formatBilledAmount,
  formatZar,
  MONTHLY_PLAN_ZAR,
  SUBSCRIPTION_TLD,
  subscriptionAmountZar,
  type BillingFrequency,
} from "@/lib/pricing";
import { useAuth } from "@/components/AuthProvider";
import { trackBeginCheckout } from "@/lib/analytics";
import { submitPayfastForm } from "@/lib/payfast-browser";

type DomainResult = {
  domain: string;
  sld: string;
  tld: string;
  available: boolean;
  premium: boolean;
  message: string;
};

function SearchIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
    </svg>
  );
}

function SpinnerIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

type PaywallCardProps = {
  websiteId: string;
  suggestedName: string;
  onClose: () => void;
  onSubscribed: (domain: string, amountZar?: number) => void;
};

export default function PaywallCard({
  websiteId,
  suggestedName,
  onClose,
  onSubscribed,
}: PaywallCardProps) {
  const { user, authFetch } = useAuth();
  const [query, setQuery] = useState(suggestedName);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [result, setResult] = useState<DomainResult | null>(null);
  const [mocked, setMocked] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [frequency, setFrequency] = useState<BillingFrequency>("annual");
  const billedAmount = subscriptionAmountZar(frequency);

  useEffect(() => {
    if (suggestedName) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- seed the domain search from the suggested business name
      setQuery(suggestedName);
      void searchDomains(suggestedName);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestedName]);

  async function searchDomains(name = query) {
    const trimmed = name.trim();
    if (!trimmed) {
      setSearchError("Enter a domain name to search.");
      return;
    }

    setSearching(true);
    setSearchError(null);
    setResult(null);
    setCheckoutError(null);

    try {
      const params = new URLSearchParams({
        q: trimmed,
      });
      const response = await authFetch(`/api/domains/search?${params.toString()}`);
      const data = (await response.json()) as {
        success?: boolean;
        results?: DomainResult[];
        mocked?: boolean;
        error?: string;
      };

      if (!response.ok || !data.success || !data.results?.[0]) {
        setResult(null);
        setSearchError(data.error || "Could not check domain availability.");
        return;
      }

      setResult(data.results[0]);
      setMocked(Boolean(data.mocked));
    } catch {
      setResult(null);
      setSearchError("Could not reach the domain search API.");
    } finally {
      setSearching(false);
    }
  }

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await searchDomains();
  }

  async function handleSubscribe() {
    if (!websiteId || !result?.available || checkingOut) return;

    setCheckingOut(true);
    setCheckoutError(null);
    trackBeginCheckout(result.domain, billedAmount);

    try {
      const response = await authFetch("/api/checkout", {
        method: "POST",
        body: JSON.stringify({
          websiteId,
          domain: result.domain,
          email: user?.email ?? "",
          name: user?.displayName ?? "",
          frequency,
        }),
      });

      const data = (await response.json()) as {
        success?: boolean;
        paid?: boolean;
        mocked?: boolean;
        processUrl?: string;
        fields?: Record<string, string>;
        error?: string;
      };

      if (!response.ok || !data.success) {
        setCheckoutError(data.error || "Could not start checkout.");
        setCheckingOut(false);
        return;
      }

      if (data.paid) {
        setCheckingOut(false);
        onSubscribed(result.domain, billedAmount);
        return;
      }

      if (!data.processUrl || !data.fields) {
        setCheckoutError("PayFast did not return checkout details.");
        setCheckingOut(false);
        return;
      }

      submitPayfastForm(data.processUrl, data.fields);
    } catch {
      setCheckoutError("Could not start PayFast checkout. Please try again.");
      setCheckingOut(false);
    }
  }

  return (
    <div
      className="absolute inset-0 z-20 flex items-end justify-center bg-stone-900/35 p-3 sm:items-center sm:p-6"
      onClick={() => {
        if (!checkingOut) onClose();
      }}
    >
      <section
        role="dialog"
        aria-labelledby="paywall-card-title"
        aria-busy={checkingOut}
        className="relative max-h-full w-full max-w-xl overflow-y-auto rounded-[1.4rem] border border-stone-200 bg-white p-5 shadow-[0_24px_80px_rgba(28,25,23,0.2)] sm:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        {checkingOut ? (
          <div
            className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-[1.4rem] bg-white/90 px-6 text-center"
            role="status"
            aria-live="polite"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-800 text-white">
              <SpinnerIcon className="h-6 w-6" />
            </span>
            <div>
              <p className="text-sm font-semibold text-stone-900">
                Redirecting to PayFast
              </p>
              <p className="mt-1 text-xs text-stone-500">
                Stay on this page. Checkout opens in a moment.
              </p>
            </div>
          </div>
        ) : null}
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-800">
              Subscribe
            </p>
            <h2
              id="paywall-card-title"
              className="mt-1 text-2xl font-semibold tracking-tight text-stone-900"
            >
              Choose a domain to continue
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={checkingOut}
            className="shrink-0 rounded-full px-3 py-1.5 text-sm font-medium text-teal-800 transition hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Back to chat
          </button>
        </div>
        <p className="mt-2 text-sm text-stone-600">
          Generating a website is free. Publishing is{" "}
          {formatZar(ANNUAL_PLAN_MONTHLY_ZAR)} per month billed annually, or{" "}
          {formatZar(MONTHLY_PLAN_ZAR)} billed monthly, through PayFast.
        </p>

        <form onSubmit={handleSearch} className="mt-5">
          <div className="flex overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
            <span className="flex items-center bg-teal-50 px-3 text-sm font-semibold text-teal-800 sm:px-4">
              www
            </span>
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="thandoplumbing"
              disabled={searching || checkingOut}
              aria-label="Domain name"
              className="min-w-0 flex-1 border-0 bg-white px-3 py-3 text-base text-stone-800 outline-none placeholder:text-stone-400 disabled:bg-stone-50 sm:px-4"
            />
            <span className="flex items-center bg-teal-50 px-3 text-sm font-semibold text-teal-800 sm:px-4">
              .{SUBSCRIPTION_TLD}
            </span>
            <button
              type="submit"
              disabled={searching || checkingOut || !query.trim()}
              aria-label={searching ? "Checking domain" : "Search domain"}
              className="flex w-12 items-center justify-center bg-teal-800 text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-stone-400 sm:w-14"
            >
              <SearchIcon />
            </button>
          </div>
        </form>

        {searchError ? (
          <p className="mt-3 text-sm text-red-700">{searchError}</p>
        ) : null}

        {result ? (
          <div className="mt-5 rounded-2xl border border-stone-200 bg-stone-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-lg font-semibold text-stone-900">{result.domain}</p>
                {mocked ? (
                  <p className="mt-1 text-xs text-stone-500">
                    Demo result — add reseller API credentials to check live availability.
                  </p>
                ) : null}
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  result.available
                    ? "bg-teal-100 text-teal-900"
                    : "bg-stone-200 text-stone-600"
                }`}
              >
                {result.available ? "Available" : "Taken"}
              </span>
            </div>

            {result.available ? (
              <>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setFrequency("annual")}
                    disabled={checkingOut}
                    className={`rounded-2xl border px-4 py-3 text-left transition ${
                      frequency === "annual"
                        ? "border-teal-800 bg-teal-50"
                        : "border-stone-200 bg-white hover:border-stone-300"
                    }`}
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-teal-800">
                      Best value
                    </p>
                    <p className="mt-1 text-lg font-semibold text-stone-900">
                      {formatZar(ANNUAL_PLAN_MONTHLY_ZAR)}
                      <span className="ml-1 text-sm font-medium text-stone-500">
                        / month
                      </span>
                    </p>
                    <p className="mt-1 text-xs text-stone-500">
                      Billed annually at {formatZar(ANNUAL_PLAN_ZAR)}
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFrequency("monthly")}
                    disabled={checkingOut}
                    className={`rounded-2xl border px-4 py-3 text-left transition ${
                      frequency === "monthly"
                        ? "border-teal-800 bg-teal-50"
                        : "border-stone-200 bg-white hover:border-stone-300"
                    }`}
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">
                      Monthly
                    </p>
                    <p className="mt-1 text-lg font-semibold text-stone-900">
                      {formatZar(MONTHLY_PLAN_ZAR)}
                      <span className="ml-1 text-sm font-medium text-stone-500">
                        / month
                      </span>
                    </p>
                    <p className="mt-1 text-xs text-stone-500">Billed every month</p>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => void handleSubscribe()}
                  disabled={checkingOut}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-teal-800 px-5 py-3 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-stone-400"
                >
                  {checkingOut ? (
                    <>
                      <SpinnerIcon className="h-4 w-4" />
                      Redirecting to PayFast...
                    </>
                  ) : (
                    `Subscribe · ${formatBilledAmount(billedAmount, frequency)}`
                  )}
                </button>
                <p className="mt-2 text-xs text-stone-500">
                  {frequency === "annual"
                    ? "Annual PayFast subscription. Renews each year at the same amount."
                    : "Monthly PayFast subscription. Renews each month at the same amount."}
                </p>
              </>
            ) : (
              <p className="mt-3 text-sm text-stone-600">
                That name is taken. Try another name.
              </p>
            )}

            {checkoutError ? (
              <p className="mt-3 text-sm text-red-700">{checkoutError}</p>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}
