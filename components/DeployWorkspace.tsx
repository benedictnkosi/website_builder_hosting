"use client";

import { FormEvent, useEffect, useState } from "react";
import { DEFAULT_TLD, FALLBACK_TLDS } from "@/lib/domain-name";

type DomainResult = {
  domain: string;
  sld: string;
  tld: string;
  category?: string;
  available: boolean;
  premium: boolean;
  message: string;
};

type DeployStatus = "idle" | "deploying" | "success" | "error";

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

type DeployWorkspaceProps = {
  websiteId: string;
  suggestedName: string;
  subscribedDomain?: string;
  onClose: () => void;
};

export default function DeployWorkspace({
  websiteId,
  suggestedName,
  subscribedDomain,
  onClose,
}: DeployWorkspaceProps) {
  const [query, setQuery] = useState(suggestedName);
  const [selectedTld, setSelectedTld] = useState(DEFAULT_TLD);
  const [tlds, setTlds] = useState<string[]>(FALLBACK_TLDS.map((item) => item.tld));
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [result, setResult] = useState<DomainResult | null>(null);
  const [mocked, setMocked] = useState(false);
  const [deployStatus, setDeployStatus] = useState<DeployStatus>("idle");
  const [deployError, setDeployError] = useState<string | null>(null);
  const [deployedUrl, setDeployedUrl] = useState<string | null>(null);
  const [skippedDomainProvisioning, setSkippedDomainProvisioning] =
    useState(false);
  const [isLocalhost, setIsLocalhost] = useState(false);

  useEffect(() => {
    setIsLocalhost(
      ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname),
    );
  }, []);

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
    if (subscribedDomain) {
      const parts = subscribedDomain.split(".");
      setQuery(parts[0] ?? subscribedDomain);
      setResult({
        domain: subscribedDomain,
        sld: parts[0] ?? subscribedDomain,
        tld: parts.slice(1).join(".") || DEFAULT_TLD,
        available: true,
        premium: false,
        message: "Included in your subscription",
      });
      return;
    }

    if (suggestedName) {
      setQuery(suggestedName);
      void searchDomains(suggestedName, selectedTld);
    }
    // Run once for the suggested business name from the builder.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestedName, subscribedDomain]);

  async function searchDomains(name = query, tld = selectedTld) {
    const trimmed = name.trim();
    if (!trimmed) {
      setSearchError("Enter a domain name to search.");
      return;
    }

    setSearching(true);
    setSearchError(null);
    setResult(null);
    setDeployStatus("idle");
    setDeployError(null);
    setDeployedUrl(null);
    setSkippedDomainProvisioning(false);

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

  async function handleDeploy() {
    if (!websiteId || !result?.available || deployStatus === "deploying") return;

    setDeployStatus("deploying");
    setDeployError(null);
    setSkippedDomainProvisioning(false);

    try {
      const response = await fetch("/api/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          websiteId,
          domain: result.domain,
        }),
      });

      const data = (await response.json()) as {
        success?: boolean;
        url?: string;
        error?: string;
        skippedDomainProvisioning?: boolean;
      };

      if (!response.ok || !data.success) {
        setDeployStatus("error");
        setDeployError(data.error || "Deployment failed.");
        return;
      }

      setDeployStatus("success");
      setSkippedDomainProvisioning(Boolean(data.skippedDomainProvisioning));
      setDeployedUrl(data.url || `https://${result.domain}`);
    } catch {
      setDeployStatus("error");
      setDeployError("Could not reach the deploy API. Please try again.");
    }
  }

  return (
    <div
      className="absolute inset-0 z-20 flex items-end justify-center bg-stone-900/35 p-3 sm:items-center sm:p-6"
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-labelledby="domain-card-title"
        className="max-h-full w-full max-w-xl overflow-y-auto rounded-[1.4rem] border border-stone-200 bg-white p-5 shadow-[0_24px_80px_rgba(28,25,23,0.2)] sm:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-800">
              Deploy
            </p>
            <h2
              id="domain-card-title"
              className="mt-1 text-2xl font-semibold tracking-tight text-stone-900"
            >
              {subscribedDomain ? "Deploy your website" : "Find an available domain"}
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
          {subscribedDomain
            ? `Your subscription includes ${subscribedDomain}. Deploy to make it live.`
            : "Enter a name and choose the extension you want, starting with .co.za."}
        </p>

        {subscribedDomain ? null : (
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
              disabled={searching}
              aria-label="Domain name"
              className="min-w-0 flex-1 border-0 bg-white px-3 py-3 text-base text-stone-800 outline-none placeholder:text-stone-400 disabled:bg-stone-50 sm:px-4"
            />
            <label className="relative flex items-center bg-teal-50">
              <span className="sr-only">Domain extension</span>
              <select
                value={selectedTld}
                onChange={(event) => setSelectedTld(event.target.value)}
                disabled={searching}
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
              disabled={searching || !query.trim()}
              aria-label={searching ? "Checking domain" : "Search domain"}
              className="flex w-12 items-center justify-center bg-teal-800 text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-stone-400 sm:w-14"
            >
              <SearchIcon />
            </button>
          </div>
        </form>
        )}

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
                {result.available
                  ? result.premium
                    ? "Available · Premium"
                    : "Available"
                  : "Taken"}
              </span>
            </div>

            {result.available ? (
              <button
                type="button"
                onClick={handleDeploy}
                disabled={deployStatus === "deploying"}
                className="mt-4 inline-flex w-full items-center justify-center rounded-full bg-teal-800 px-5 py-3 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-stone-400 sm:w-auto"
              >
                {deployStatus === "deploying"
                  ? isLocalhost
                    ? "Deploying..."
                    : "Registering and deploying..."
                  : `Deploy ${result.domain}`}
              </button>
            ) : (
              <p className="mt-3 text-sm text-stone-600">
                That name is taken. Try another name or a different extension.
              </p>
            )}

            {deployStatus === "deploying" ? (
              <p className="mt-3 text-sm text-stone-600">
                {isLocalhost
                  ? "Deploying files. Domain registration is skipped on localhost."
                  : "Registering the domain, pointing DNS at the server, then deploying. This can take a minute."}
              </p>
            ) : null}

            {deployError ? (
              <p className="mt-3 text-sm text-red-700">{deployError}</p>
            ) : null}
            {deployStatus === "success" && deployedUrl ? (
              <p className="mt-3 text-sm text-teal-800">
                {skippedDomainProvisioning
                  ? "Website deployed. Domain registration was skipped on localhost. Available at "
                  : "Website available at "}
                <a
                  href={deployedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium underline"
                >
                  {deployedUrl}
                </a>
              </p>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}
