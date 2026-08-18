"use client";

import { FormEvent, useEffect, useState } from "react";
import { DEFAULT_TLD, FALLBACK_TLDS } from "@/lib/domain-name";
import { formatZar, type YearlyPlanPrice } from "@/lib/pricing";
import { useAuth } from "@/components/AuthProvider";

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

function submitPayfastForm(processUrl: string, fields: Record<string, string>) {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = processUrl;

  for (const [name, value] of Object.entries(fields)) {
    if (!value) continue;
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }

  document.body.appendChild(form);
  form.submit();
}

type PaywallCardProps = {
  websiteId: string;
  suggestedName: string;
  onClose: () => void;
  onSubscribed: (domain: string) => void;
};

export default function PaywallCard({
  websiteId,
  suggestedName,
  onClose,
  onSubscribed,
}: PaywallCardProps) {
  const { user } = useAuth();
  const [query, setQuery] = useState(suggestedName);
  const [selectedTld, setSelectedTld] = useState(DEFAULT_TLD);
  const [tlds, setTlds] = useState<string[]>(FALLBACK_TLDS.map((item) => item.tld));
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [result, setResult] = useState<DomainResult | null>(null);
  const [price, setPrice] = useState<YearlyPlanPrice | null>(null);
  const [mocked, setMocked] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadTlds() {
      try {
        const response = await fetch("/api/domains/tlds");
        const data = (await response.json()) as {
          success?: boolean;
          tlds?: string[];
        };
        if (!cancelled && response.ok && data.success && data.tlds?.length) {
          setTlds(data.tlds);
          if (!data.tlds.includes(selectedTld)) {
            setSelectedTld(
              data.tlds.includes(DEFAULT_TLD) ? DEFAULT_TLD : data.tlds[0],
            );
          }
        }
      } catch {
        // Keep the fallback TLD list.
      }
    }

    void loadTlds();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (suggestedName) {
      setQuery(suggestedName);
      void searchDomains(suggestedName, selectedTld);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestedName]);

  async function searchDomains(name = query, tld = selectedTld) {
    const trimmed = name.trim();
    if (!trimmed) {
      setSearchError("Enter a domain name to search.");
      return;
    }

    setSearching(true);
    setSearchError(null);
    setResult(null);
    setPrice(null);
    setCheckoutError(null);

    try {
      const params = new URLSearchParams({
        q: trimmed,
        tld,
      });
      const response = await fetch(`/api/domains/search?${params.toString()}`);
      const data = (await response.json()) as {
        success?: boolean;
        results?: DomainResult[];
        mocked?: boolean;
        price?: YearlyPlanPrice;
        error?: string;
      };

      if (!response.ok || !data.success || !data.results?.[0]) {
        setResult(null);
        setSearchError(data.error || "Could not check domain availability.");
        return;
      }

      setResult(data.results[0]);
      setPrice(data.price ?? null);
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
    if (!websiteId || !result?.available || !price || checkingOut) return;

    setCheckingOut(true);
    setCheckoutError(null);

    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          websiteId,
          domain: result.domain,
          email: user?.email ?? "",
          name: user?.displayName ?? "",
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
        return;
      }

      if (data.paid) {
        onSubscribed(result.domain);
        return;
      }

      if (!data.processUrl || !data.fields) {
        setCheckoutError("PayFast did not return checkout details.");
        return;
      }

      submitPayfastForm(data.processUrl, data.fields);
    } catch {
      setCheckoutError("Could not start PayFast checkout. Please try again.");
    } finally {
      setCheckingOut(false);
    }
  }

  return (
    <div
      className="absolute inset-0 z-20 flex items-end justify-center bg-stone-900/35 p-3 sm:items-center sm:p-6"
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-labelledby="paywall-card-title"
        className="max-h-full w-full max-w-xl overflow-y-auto rounded-[1.4rem] border border-stone-200 bg-white p-5 shadow-[0_24px_80px_rgba(28,25,23,0.2)] sm:p-6"
        onClick={(event) => event.stopPropagation()}
      >
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
            className="shrink-0 rounded-full px-3 py-1.5 text-sm font-medium text-teal-800 transition hover:bg-teal-50"
          >
            Back to chat
          </button>
        </div>
        <p className="mt-2 text-sm text-stone-600">
          Generating a website is free. Editing and deploying is billed yearly:
          domain registration plus R100.
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
            <label className="relative flex items-center bg-teal-50">
              <span className="sr-only">Domain extension</span>
              <select
                value={selectedTld}
                onChange={(event) => {
                  const nextTld = event.target.value;
                  setSelectedTld(nextTld);
                  void searchDomains(query, nextTld);
                }}
                disabled={searching || checkingOut}
                className="appearance-none bg-transparent py-3 pl-3 pr-8 text-sm font-semibold text-teal-800 outline-none"
              >
                {tlds.map((tld) => (
                  <option key={tld} value={tld}>
                    .{tld}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-2 text-teal-800">
                <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
                  <path d="M5.25 7.5L10 12.25 14.75 7.5" />
                </svg>
              </span>
            </label>
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

        {result && price ? (
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
                {result.available
                  ? result.premium
                    ? "Available · Premium"
                    : "Available"
                  : "Taken"}
              </span>
            </div>

            {result.available ? (
              <>
                <dl className="mt-4 space-y-2 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-stone-600">.{price.tld} registration</dt>
                    <dd className="font-medium text-stone-900">
                      {formatZar(price.registration)}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-stone-600">Website edits and hosting</dt>
                    <dd className="font-medium text-stone-900">
                      {formatZar(price.websiteFee)}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3 border-t border-stone-200 pt-2">
                    <dt className="font-semibold text-stone-900">Billed yearly</dt>
                    <dd className="text-base font-semibold text-teal-900">
                      {formatZar(price.yearlyTotal)} / year
                    </dd>
                  </div>
                </dl>

                <button
                  type="button"
                  onClick={() => void handleSubscribe()}
                  disabled={checkingOut}
                  className="mt-4 inline-flex w-full items-center justify-center rounded-full bg-teal-800 px-5 py-3 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-stone-400"
                >
                  {checkingOut
                    ? "Starting PayFast..."
                    : `Subscribe · ${formatZar(price.yearlyTotal)} / year`}
                </button>
                <p className="mt-2 text-xs text-stone-500">
                  Annual PayFast subscription. Renews each year at the same total.
                </p>
              </>
            ) : (
              <p className="mt-3 text-sm text-stone-600">
                That name is taken. Try another name or a different extension.
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
