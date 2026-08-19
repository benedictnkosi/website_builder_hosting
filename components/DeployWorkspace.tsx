"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { SUBSCRIPTION_TLD } from "@/lib/pricing";
import {
  trackDeployFail,
  trackDeployStart,
  trackDeploySuccess,
} from "@/lib/analytics";

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
type PublishStepState = "pending" | "active" | "done" | "error";

const PUBLISH_STEPS = [
  {
    id: "register",
    label: "Registering the domain",
    hint: "Reserving your .co.za name",
  },
  {
    id: "dns",
    label: "Pointing DNS at the server",
    hint: "Waiting for public DNS to update",
  },
  {
    id: "publish",
    label: "Publishing the website",
    hint: "Putting your pages live",
  },
] as const;

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

function StepCheckIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none">
      <path
        d="M5 10.5l3.2 3.2L15 6.8"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StepErrorIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none">
      <path
        d="M6 6l8 8M14 6l-8 8"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function publishStepState(
  index: number,
  publishStep: number,
  deployStatus: DeployStatus,
): PublishStepState {
  if (index < publishStep) return "done";
  if (index === publishStep && deployStatus === "error") return "error";
  if (index === publishStep && deployStatus === "deploying") return "active";
  if (deployStatus === "success") return "done";
  return "pending";
}

function PublishProgress({
  publishStep,
  deployStatus,
  activeHint,
}: {
  publishStep: number;
  deployStatus: DeployStatus;
  activeHint?: string;
}) {
  return (
    <div
      className="mt-4 overflow-hidden rounded-2xl border border-teal-100 bg-gradient-to-b from-teal-50/90 to-white p-4"
      role="status"
      aria-live="polite"
    >
      <ol className="space-y-0">
        {PUBLISH_STEPS.map((step, index) => {
          const state = publishStepState(index, publishStep, deployStatus);
          const isLast = index === PUBLISH_STEPS.length - 1;
          const caption =
            state === "done"
              ? "Done"
              : state === "active"
                ? activeHint || "In progress"
                : state === "error"
                  ? "Could not finish"
                  : "Waiting";

          return (
            <li key={step.id} className="flex gap-3" aria-current={state === "active" ? "step" : undefined}>
              <div className="flex flex-col items-center self-stretch">
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                    state === "done"
                      ? "bg-emerald-500 text-white shadow-sm shadow-emerald-500/25"
                      : state === "active"
                        ? "bg-white text-teal-800 ring-2 ring-teal-200"
                        : state === "error"
                          ? "bg-red-600 text-white"
                          : "bg-white text-stone-300 ring-2 ring-stone-200"
                  }`}
                >
                  {state === "done" ? (
                    <StepCheckIcon />
                  ) : state === "error" ? (
                    <StepErrorIcon />
                  ) : state === "active" ? (
                    <span
                      className="h-4 w-4 animate-spin rounded-full border-2 border-teal-200 border-t-teal-700"
                      aria-hidden="true"
                    />
                  ) : (
                    <span className="h-2 w-2 rounded-full bg-stone-300" />
                  )}
                </span>
                {isLast ? null : (
                  <span
                    className={`my-1 w-0.5 min-h-3 grow rounded-full ${
                      index < publishStep ? "bg-emerald-400" : "bg-stone-200"
                    }`}
                    aria-hidden="true"
                  />
                )}
              </div>
              <div className={isLast ? "min-w-0 pb-0 pt-0.5" : "min-w-0 pb-4 pt-0.5"}>
                <p
                  className={`text-sm font-semibold ${
                    state === "done"
                      ? "text-stone-900"
                      : state === "active"
                        ? "text-teal-900"
                        : state === "error"
                          ? "text-red-800"
                          : "text-stone-500"
                  }`}
                >
                  {step.label}
                </p>
                <p className="mt-0.5 text-xs text-stone-500">
                  {state === "pending" ? step.hint : caption}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
      {deployStatus === "deploying" ? (
        <p className="mt-3 border-t border-teal-100 pt-3 text-xs text-stone-500">
          {publishStep === 1
            ? "New domains can take up to 30 minutes for public DNS to update. You can leave this open — we\u2019ll play a sound when it\u2019s done."
            : publishStep === 2
              ? "Verifying the site is live. You\u2019ll hear a chime when it\u2019s ready."
              : "This can take a minute."}
        </p>
      ) : null}
    </div>
  );
}

type DeployWorkspaceProps = {
  websiteId: string;
  suggestedName: string;
  subscribedDomain?: string;
  autoDeploy?: boolean;
  onClose: () => void;
};

export default function DeployWorkspace({
  websiteId,
  suggestedName,
  subscribedDomain,
  autoDeploy,
  onClose,
}: DeployWorkspaceProps) {
  const { authFetch } = useAuth();
  const [query, setQuery] = useState(suggestedName);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [result, setResult] = useState<DomainResult | null>(null);
  const [mocked, setMocked] = useState(false);
  const [deployStatus, setDeployStatus] = useState<DeployStatus>("idle");
  const [deployError, setDeployError] = useState<string | null>(null);
  const [deployedUrl, setDeployedUrl] = useState<string | null>(null);
  const [httpsReady, setHttpsReady] = useState(false);
  const [publishStep, setPublishStep] = useState(0);
  const [activeHint, setActiveHint] = useState<string | undefined>();
  const autoDeployFired = useRef(false);

  useEffect(() => {
    if (subscribedDomain) {
      const parts = subscribedDomain.split(".");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- bind the subscribed domain into the deploy form
      setQuery(parts[0] ?? subscribedDomain);
      setResult({
        domain: subscribedDomain,
        sld: parts[0] ?? subscribedDomain,
        tld: parts.slice(1).join(".") || SUBSCRIPTION_TLD,
        available: true,
        premium: false,
        message: "Included in your subscription",
      });
      return;
    }

    if (suggestedName) {
      setQuery(suggestedName);
      void searchDomains(suggestedName);
    }
    // Run once for the suggested business name from the builder.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestedName, subscribedDomain]);

  async function searchDomains(name = query) {
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
    setHttpsReady(false);
    setPublishStep(0);
    setActiveHint(undefined);

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

  function formatElapsed(startMs: number): string {
    const seconds = Math.round((Date.now() - startMs) / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return remainder > 0 ? `${minutes}m ${remainder}s` : `${minutes}m`;
  }

  async function waitForPublicDns(siteId: string) {
    const deadline = Date.now() + 30 * 60 * 1000;
    const startedAt = Date.now();
    let attempt = 0;

    while (Date.now() < deadline) {
      const response = await authFetch(
        `/api/deploy/dns?websiteId=${encodeURIComponent(siteId)}`,
      );
      const data = (await response.json()) as {
        success?: boolean;
        ready?: boolean;
        error?: string;
      };

      if (response.status === 429) {
        setActiveHint("Waiting before checking public DNS again");
        await new Promise((resolve) => window.setTimeout(resolve, 5000));
        continue;
      }

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Could not check public DNS.");
      }

      if (data.ready) {
        return;
      }

      attempt += 1;
      const elapsed = formatElapsed(startedAt);
      setActiveHint(
        attempt <= 2
          ? "Waiting for public DNS to update"
          : `Still waiting for public DNS (${elapsed})`,
      );
      const delay = attempt < 20 ? 5000 : 10000;
      await new Promise((resolve) => window.setTimeout(resolve, delay));
    }

    throw new Error(
      "Public DNS has not updated after 30 minutes. Try publishing again later.",
    );
  }

  async function waitForLiveSite(siteId: string) {
    const deadline = Date.now() + 30 * 60 * 1000;
    const startedAt = Date.now();
    let attempt = 0;

    while (Date.now() < deadline) {
      const response = await authFetch(
        `/api/deploy/live?websiteId=${encodeURIComponent(siteId)}`,
      );
      const data = (await response.json()) as {
        success?: boolean;
        ready?: boolean;
        error?: string;
      };

      if (response.status === 429) {
        setActiveHint("Waiting before checking the live site again");
        await new Promise((resolve) => window.setTimeout(resolve, 5000));
        continue;
      }

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Could not reach the published website.");
      }

      if (data.ready) {
        return;
      }

      attempt += 1;
      const elapsed = formatElapsed(startedAt);
      setActiveHint(
        attempt <= 2
          ? "Checking the live site"
          : `Still checking the live site (${elapsed})`,
      );
      const delay = attempt < 20 ? 5000 : 10000;
      await new Promise((resolve) => window.setTimeout(resolve, delay));
    }

    throw new Error(
      "The website was published but is not returning 200 yet. Try again later.",
    );
  }

  function playSuccessChime() {
    try {
      const ctx = new AudioContext();
      const now = ctx.currentTime;

      const notes = [523.25, 659.25, 783.99];
      for (let i = 0; i < notes.length; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = notes[i];
        gain.gain.setValueAtTime(0, now + i * 0.15);
        gain.gain.linearRampToValueAtTime(0.18, now + i * 0.15 + 0.04);
        gain.gain.linearRampToValueAtTime(0, now + i * 0.15 + 0.35);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now + i * 0.15);
        osc.stop(now + i * 0.15 + 0.4);
      }
    } catch {
      // Audio may not be available
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
    setHttpsReady(false);
    setPublishStep(0);
    setActiveHint("Reserving your .co.za name");
    trackDeployStart(result.domain);

    try {
      const provisionResponse = await authFetch("/api/deploy/provision", {
        method: "POST",
        body: JSON.stringify({
          websiteId,
          domain: result.domain,
        }),
      });
      const provisionData = (await provisionResponse.json()) as {
        success?: boolean;
        error?: string;
      };
      if (!provisionResponse.ok || !provisionData.success) {
        setDeployStatus("error");
        setDeployError(provisionData.error || "Could not register the domain.");
        trackDeployFail();
        return;
      }

      setPublishStep(1);
      setActiveHint("Checking public DNS");
      await waitForPublicDns(websiteId);

      setPublishStep(2);
      setActiveHint("Putting your pages live");

      const response = await authFetch("/api/deploy", {
        method: "POST",
        body: JSON.stringify({
          websiteId,
          domain: result.domain,
        }),
      });

      const data = (await response.json()) as {
        success?: boolean;
        url?: string;
        error?: string;
        httpsReady?: boolean;
      };

      if (!response.ok || !data.success) {
        setDeployStatus("error");
        setDeployError(data.error || "Deployment failed.");
        trackDeployFail();
        return;
      }

      setActiveHint("Checking the live site");
      await waitForLiveSite(websiteId);

      setPublishStep(3);
      setActiveHint(undefined);
      setDeployStatus("success");
      setDeployedUrl(data.url || `https://${result.domain}`);
      setHttpsReady(data.httpsReady === true);
      trackDeploySuccess(result.domain);
      playSuccessChime();
    } catch (error) {
      setDeployStatus("error");
      setDeployError(
        error instanceof Error
          ? error.message
          : "Could not reach the deploy API. Please try again.",
      );
      trackDeployFail();
    }
  }

  useEffect(() => {
    if (autoDeploy && !autoDeployFired.current && result?.available && deployStatus === "idle") {
      autoDeployFired.current = true;
      handleDeploy();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoDeploy, result, deployStatus]);

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
              {subscribedDomain ? "Publish your website" : "Find an available domain"}
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
            ? `Your subscription includes ${subscribedDomain}. Publish to make it live.`
            : "Enter a name to check a .co.za domain."}
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
            <span className="flex items-center bg-teal-50 px-3 text-sm font-semibold text-teal-800 sm:px-4">
              .{SUBSCRIPTION_TLD}
            </span>
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
                  ? deployStatus === "success"
                    ? "Live"
                    : result.premium
                    ? "Available · Premium"
                    : "Available"
                  : "Taken"}
              </span>
            </div>

            {result.available && deployStatus !== "success" && deployStatus !== "deploying" ? (
              <button
                type="button"
                onClick={handleDeploy}
                className="mt-4 inline-flex w-full items-center justify-center rounded-full bg-teal-800 px-5 py-3 text-sm font-semibold text-white transition hover:bg-teal-700 sm:w-auto"
              >
                Publish {result.domain}
              </button>
            ) : null}

            {!result.available ? (
              <p className="mt-3 text-sm text-stone-600">
                That name is taken. Try another name.
              </p>
            ) : null}

            {deployStatus === "deploying" ||
            deployStatus === "success" ||
            deployStatus === "error" ? (
              <PublishProgress
                publishStep={publishStep}
                deployStatus={deployStatus}
                activeHint={activeHint}
              />
            ) : null}

            {deployError ? (
              <p className="mt-3 text-sm text-red-700">{deployError}</p>
            ) : null}

            {deployStatus === "success" && deployedUrl ? (
              <div className="mt-4">
                {httpsReady ? (
                  <p className="text-base font-semibold text-teal-900">Website is live</p>
                ) : (
                  <>
                    <p className="text-base font-semibold text-teal-900">
                      Published — HTTPS is still activating
                    </p>
                    <p className="mt-1 text-sm text-stone-600">
                      New .co.za names can take a few minutes to appear in public DNS.
                      Opening the site too early shows a browser security error. Wait,
                      then refresh.
                    </p>
                  </>
                )}
                <a
                  href={deployedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 block break-all text-lg font-semibold text-teal-800 underline decoration-teal-800/40 underline-offset-2 transition hover:text-teal-700"
                >
                  {deployedUrl}
                </a>
                <button
                  type="button"
                  onClick={handleDeploy}
                  className="mt-4 rounded-full border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-600 transition hover:bg-stone-50"
                >
                  Publish again
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}
