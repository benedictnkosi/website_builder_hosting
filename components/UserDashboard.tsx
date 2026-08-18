"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { saveBuilderSession } from "@/lib/builder-session";
import {
  trackCancelSubscription,
  trackDeleteWebsite,
  trackOpenSite,
  trackStartBuilder,
} from "@/lib/analytics";
import { openTokenTopup } from "@/lib/token-events";
import {
  formatTokenCount,
  formatZar,
  TOKEN_TOPUP_TOKENS,
  TOKEN_TOPUP_ZAR,
} from "@/lib/pricing";

type SubscriptionStatus = "pending" | "active" | "cancelled";

type DashboardSite = {
  websiteId: string;
  businessName: string;
  createdAt: string;
  updatedAt: string;
  previewPath: string;
  domain: string | null;
  subscriptionStatus: SubscriptionStatus | null;
  amountZar: number | null;
  mocked: boolean;
};

type ConfirmAction = {
  type: "cancel" | "delete";
  site: DashboardSite;
};

function statusLabel(status: SubscriptionStatus | null): string {
  if (status === "active") return "Active";
  if (status === "pending") return "Payment pending";
  if (status === "cancelled") return "Cancelled";
  return "Draft";
}

function statusClass(status: SubscriptionStatus | null): string {
  if (status === "active") return "bg-teal-100 text-teal-900";
  if (status === "pending") return "bg-amber-100 text-amber-900";
  if (status === "cancelled") return "bg-stone-200 text-stone-600";
  return "bg-white text-stone-600 ring-1 ring-stone-200";
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function UserDashboard() {
  const { user, authFetch } = useAuth();
  const router = useRouter();
  const [sites, setSites] = useState<DashboardSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);

  const loadSites = useCallback(async () => {
    try {
      const response = await authFetch("/api/sites");
      const data = (await response.json()) as {
        success?: boolean;
        sites?: DashboardSite[];
        error?: string;
      };

      if (!response.ok || !data.success) {
        setError(data.error || "Could not load your websites.");
        return;
      }

      setError(null);
      setSites(data.sites ?? []);
    } catch {
      setError("Could not load your websites. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch the signed-in user's sites
    void loadSites();
  }, [loadSites]);

  function openSite(site: DashboardSite) {
    trackOpenSite();
    saveBuilderSession({
      websiteId: site.websiteId,
      businessName: site.businessName,
      businessDescription: "",
    });
    router.push(`/builder?websiteId=${encodeURIComponent(site.websiteId)}`);
  }

  async function handleConfirm() {
    if (!confirm || workingId) return;

    const { type, site } = confirm;
    setWorkingId(site.websiteId);
    setError(null);
    setNotice(null);

    try {
      const response = await authFetch(
        type === "cancel"
          ? `/api/sites/${encodeURIComponent(site.websiteId)}/cancel`
          : `/api/sites/${encodeURIComponent(site.websiteId)}`,
        { method: type === "cancel" ? "POST" : "DELETE" },
      );
      const data = (await response.json()) as {
        success?: boolean;
        error?: string;
        warning?: string;
      };

      if (!response.ok || !data.success) {
        setError(data.error || `Could not ${type} this website.`);
        return;
      }

      setConfirm(null);
      if (data.warning) {
        setNotice(data.warning);
      } else if (type === "cancel") {
        trackCancelSubscription();
        setNotice(
          site.domain
            ? `Cancelled the subscription for ${site.domain}.`
            : "Subscription cancelled.",
        );
      } else {
        trackDeleteWebsite();
        setNotice(`Deleted ${site.businessName}.`);
      }
      await loadSites();
    } catch {
      setError(
        type === "cancel"
          ? "Could not cancel this subscription. Please try again."
          : "Could not delete this website. Please try again.",
      );
    } finally {
      setWorkingId(null);
    }
  }

  const firstName = user?.displayName?.split(/\s+/)[0] || "there";

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-800">
            Dashboard
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-stone-900 sm:text-4xl">
            Hi {firstName}
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-stone-600">
            Manage your websites, cancel monthly billing, or delete a site you no
            longer need.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <button
            type="button"
            onClick={() => openTokenTopup()}
            className="inline-flex items-center justify-center rounded-full border border-stone-300 bg-white px-5 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-50"
          >
            Buy {formatTokenCount(TOKEN_TOPUP_TOKENS)} tokens · {formatZar(TOKEN_TOPUP_ZAR)}
          </button>
          <Link
            href="/builder?new=1"
            onClick={() => trackStartBuilder("dashboard")}
            className="inline-flex items-center justify-center rounded-full bg-teal-800 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-700"
          >
            New website
          </Link>
        </div>
      </div>

      {error ? (
        <p className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="mt-5 rounded-2xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-900">
          {notice}
        </p>
      ) : null}

      {loading ? (
        <p className="mt-10 text-sm text-stone-500">Loading your websites...</p>
      ) : sites.length === 0 ? (
        <section className="mt-10 rounded-[1.6rem] border border-stone-200/80 bg-white p-8 text-center shadow-[0_24px_80px_rgba(28,25,23,0.08)] sm:p-12">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-800">
            No sites yet
          </p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-stone-900">
            Create your first website
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-stone-600">
            Chat about your business, preview the site, then subscribe when
            you want to deploy.
          </p>
          <Link
            href="/builder?new=1"
            onClick={() => trackStartBuilder("dashboard_empty")}
            className="mt-6 inline-flex items-center justify-center rounded-full bg-teal-800 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-700"
          >
            Start building
          </Link>
        </section>
      ) : (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {sites.map((site) => (
            <li
              key={site.websiteId}
              className="flex flex-col overflow-hidden rounded-[1.4rem] border border-stone-200/80 bg-white shadow-sm"
            >
              <div className="relative h-36 overflow-hidden bg-[#f7f3ea]">
                <iframe
                  src={site.previewPath}
                  title={`${site.businessName} preview`}
                  className="pointer-events-none h-[220%] w-[220%] origin-top-left scale-50 border-0 bg-white"
                  sandbox="allow-same-origin"
                  tabIndex={-1}
                />
              </div>
              <div className="flex flex-1 flex-col p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-semibold text-stone-900">
                      {site.businessName}
                    </h2>
                    <p className="mt-0.5 truncate text-sm text-stone-500">
                      {site.domain || "No domain yet"}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusClass(site.subscriptionStatus)}`}
                  >
                    {statusLabel(site.subscriptionStatus)}
                  </span>
                </div>
                <p className="mt-3 text-xs text-stone-500">
                  Updated {formatDate(site.updatedAt)}
                  {site.subscriptionStatus === "active" && site.amountZar != null
                    ? ` · ${formatZar(site.amountZar)} / month`
                    : ""}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => openSite(site)}
                    className="inline-flex flex-1 items-center justify-center rounded-full bg-teal-800 px-3 py-2 text-sm font-semibold text-white transition hover:bg-teal-700"
                  >
                    Open
                  </button>
                  <a
                    href={site.previewPath}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center rounded-full border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-700 transition hover:bg-stone-50"
                  >
                    Preview
                  </a>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {site.subscriptionStatus === "active" ||
                  site.subscriptionStatus === "pending" ? (
                    <button
                      type="button"
                      onClick={() => setConfirm({ type: "cancel", site })}
                      disabled={workingId === site.websiteId}
                      className="inline-flex flex-1 items-center justify-center rounded-full px-3 py-2 text-sm font-medium text-stone-600 transition hover:bg-stone-100 disabled:opacity-50"
                    >
                      Cancel billing
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setConfirm({ type: "delete", site })}
                    disabled={workingId === site.websiteId}
                    className="inline-flex flex-1 items-center justify-center rounded-full px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {confirm ? (
        <div
          className="fixed inset-0 z-30 flex items-end justify-center bg-stone-900/35 p-3 sm:items-center sm:p-6"
          onClick={() => (workingId ? null : setConfirm(null))}
        >
          <section
            role="dialog"
            aria-labelledby="dashboard-confirm-title"
            className="w-full max-w-md rounded-[1.4rem] border border-stone-200 bg-white p-5 shadow-[0_24px_80px_rgba(28,25,23,0.2)] sm:p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <h2
              id="dashboard-confirm-title"
              className="text-xl font-semibold tracking-tight text-stone-900"
            >
              {confirm.type === "cancel"
                ? "Cancel this subscription?"
                : "Delete this website?"}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-stone-600">
              {confirm.type === "cancel"
                ? `This stops future PayFast charges${confirm.site.domain ? ` for ${confirm.site.domain}` : ""}. You can still preview and edit the site with tokens. Deploying stays locked until you subscribe again.`
                : `This permanently removes ${confirm.site.businessName} and its files.${
                    confirm.site.subscriptionStatus === "active" ||
                    confirm.site.subscriptionStatus === "pending"
                      ? " It will also cancel the monthly subscription."
                      : ""
                  }`}
            </p>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setConfirm(null)}
                disabled={Boolean(workingId)}
                className="rounded-full px-4 py-2.5 text-sm font-medium text-stone-600 transition hover:bg-stone-100 disabled:opacity-50"
              >
                Keep it
              </button>
              <button
                type="button"
                onClick={() => void handleConfirm()}
                disabled={Boolean(workingId)}
                className={`rounded-full px-4 py-2.5 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:bg-stone-400 ${
                  confirm.type === "delete"
                    ? "bg-red-700 hover:bg-red-600"
                    : "bg-teal-800 hover:bg-teal-700"
                }`}
              >
                {workingId
                  ? confirm.type === "delete"
                    ? "Deleting..."
                    : "Cancelling..."
                  : confirm.type === "delete"
                    ? "Delete website"
                    : "Cancel billing"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
