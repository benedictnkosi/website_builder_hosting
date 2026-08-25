"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { formatBilledAmount, formatZar, type BillingFrequency } from "@/lib/pricing";

type AdminPaidSite = {
  websiteId: string;
  businessName: string;
  ownerUid: string;
  ownerEmail?: string;
  contactEmail?: string;
  domain: string;
  sld: string;
  tld: string;
  status: "active";
  amountZar: number;
  domainPriceZar: number;
  websiteFeeZar: number;
  currency: string;
  frequency: BillingFrequency;
  mocked: boolean;
  billingEmail?: string;
  paymentId: string;
  payfastPaymentId?: string;
  paidAt?: string;
  createdAt: string;
  updatedAt: string;
  siteCreatedAt?: string;
  siteUpdatedAt?: string;
  seoOptimizedAt?: string;
};

function formatDateTime(value?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminDashboard() {
  const { authFetch } = useAuth();
  const [sites, setSites] = useState<AdminPaidSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const loadSites = useCallback(async () => {
    try {
      const response = await authFetch("/api/admin/sites");
      const data = (await response.json()) as {
        success?: boolean;
        sites?: AdminPaidSite[];
        error?: string;
      };
      if (!response.ok || !data.success) {
        setError(data.error || "Could not load paid websites.");
        return;
      }
      setError(null);
      setSites(data.sites ?? []);
    } catch {
      setError("Could not load paid websites. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load admin paid sites on mount
    void loadSites();
  }, [loadSites]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sites;
    return sites.filter((site) => {
      const haystack = [
        site.businessName,
        site.domain,
        site.ownerEmail,
        site.contactEmail,
        site.billingEmail,
        site.websiteId,
        site.paymentId,
        site.ownerUid,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [query, sites]);

  const selected = selectedId
    ? sites.find((site) => site.websiteId === selectedId) ?? null
    : null;

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-800">
            Admin
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-stone-900 sm:text-4xl">
            Operations
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-stone-600">
            Review every paid website with billing and owner details.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            void loadSites();
          }}
          className="inline-flex items-center justify-center rounded-full border border-stone-300 bg-white px-5 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-50"
        >
          Refresh
        </button>
      </div>

      {error ? (
        <p className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <section className="mt-10">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-800">
              Paid websites
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-stone-900">
              {loading
                ? "Loading…"
                : `${filtered.length} active subscription${filtered.length === 1 ? "" : "s"}`}
            </h2>
          </div>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter by domain, business, email…"
            className="w-full rounded-full border border-stone-300 bg-white px-4 py-2.5 text-sm text-stone-900 outline-none ring-teal-700/30 placeholder:text-stone-400 focus:ring-2 sm:max-w-xs"
          />
        </div>

        {loading ? (
          <div className="mt-6 space-y-3">
            {[0, 1, 2].map((key) => (
              <div
                key={key}
                className="h-20 animate-pulse rounded-[1.2rem] bg-stone-200/70"
              />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="mt-6 rounded-[1.4rem] border border-stone-200/80 bg-white px-6 py-10 text-center shadow-sm">
            <p className="text-sm text-stone-600">
              {sites.length === 0
                ? "No paid websites yet."
                : "No websites match that filter."}
            </p>
          </div>
        ) : (
          <div className="mt-6 overflow-hidden rounded-[1.4rem] border border-stone-200/80 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-stone-200 bg-[#f7f3ea]/70 text-xs uppercase tracking-wide text-stone-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Domain</th>
                    <th className="px-4 py-3 font-semibold">Business</th>
                    <th className="px-4 py-3 font-semibold">Owner</th>
                    <th className="px-4 py-3 font-semibold">Paid</th>
                    <th className="px-4 py-3 font-semibold">Plan</th>
                    <th className="px-4 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((site) => (
                    <tr
                      key={site.websiteId}
                      className="border-b border-stone-100 last:border-0"
                    >
                      <td className="px-4 py-3 align-top">
                        <p className="font-medium text-stone-900">{site.domain}</p>
                        <p className="mt-0.5 font-mono text-xs text-stone-500">
                          {site.websiteId}
                        </p>
                        {site.mocked ? (
                          <span className="mt-1 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900">
                            Test payment
                          </span>
                        ) : (
                          <span className="mt-1 inline-flex rounded-full bg-teal-100 px-2 py-0.5 text-[11px] font-medium text-teal-900">
                            Active
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top text-stone-700">
                        {site.businessName}
                      </td>
                      <td className="px-4 py-3 align-top text-stone-700">
                        <p>{site.ownerEmail || site.billingEmail || "—"}</p>
                        {site.contactEmail &&
                        site.contactEmail !== site.ownerEmail ? (
                          <p className="mt-0.5 text-xs text-stone-500">
                            Contact: {site.contactEmail}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 align-top text-stone-700">
                        {formatDateTime(site.paidAt)}
                      </td>
                      <td className="px-4 py-3 align-top text-stone-700">
                        {formatBilledAmount(site.amountZar, site.frequency)}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedId(
                              selectedId === site.websiteId
                                ? null
                                : site.websiteId,
                            )
                          }
                          className="rounded-full border border-stone-300 px-3 py-1.5 text-xs font-semibold text-stone-700 transition hover:bg-stone-50"
                        >
                          {selectedId === site.websiteId
                            ? "Hide details"
                            : "Details"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {selected ? (
          <div className="mt-4 rounded-[1.4rem] border border-stone-200/80 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-800">
                  Site details
                </p>
                <h3 className="mt-2 text-lg font-semibold text-stone-900">
                  {selected.businessName}
                </h3>
                <p className="mt-1 text-sm text-stone-600">{selected.domain}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="text-sm font-medium text-stone-500 transition hover:text-stone-800"
              >
                Close
              </button>
            </div>

            <dl className="mt-5 grid gap-4 sm:grid-cols-2">
              <Detail label="Website ID" value={selected.websiteId} mono />
              <Detail label="Owner UID" value={selected.ownerUid || "—"} mono />
              <Detail label="Owner email" value={selected.ownerEmail || "—"} />
              <Detail
                label="Billing email"
                value={selected.billingEmail || "—"}
              />
              <Detail
                label="Contact email"
                value={selected.contactEmail || "—"}
              />
              <Detail
                label="Plan"
                value={formatBilledAmount(
                  selected.amountZar,
                  selected.frequency,
                )}
              />
              <Detail
                label="Website fee"
                value={formatZar(selected.websiteFeeZar)}
              />
              <Detail
                label="Domain price"
                value={formatZar(selected.domainPriceZar)}
              />
              <Detail label="Payment ID" value={selected.paymentId} mono />
              <Detail
                label="PayFast payment ID"
                value={selected.payfastPaymentId || "—"}
                mono
              />
              <Detail label="Paid at" value={formatDateTime(selected.paidAt)} />
              <Detail
                label="Subscription created"
                value={formatDateTime(selected.createdAt)}
              />
              <Detail
                label="Subscription updated"
                value={formatDateTime(selected.updatedAt)}
              />
              <Detail
                label="Site created"
                value={formatDateTime(selected.siteCreatedAt)}
              />
              <Detail
                label="SEO optimized"
                value={
                  selected.seoOptimizedAt
                    ? formatDateTime(selected.seoOptimizedAt)
                    : "Not yet"
                }
              />
              <Detail
                label="Payment type"
                value={selected.mocked ? "Test / mock" : "Live"}
              />
            </dl>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function Detail({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-stone-500">
        {label}
      </dt>
      <dd
        className={`mt-1 break-all text-sm text-stone-900 ${
          mono ? "font-mono text-xs sm:text-sm" : ""
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
