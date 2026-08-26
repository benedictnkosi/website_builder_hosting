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

type WhatsAppChatMessage = {
  role: "user" | "assistant";
  content: string;
  at: string;
  source?: "ai" | "human";
};

type WhatsAppChat = {
  phone: string;
  date: string;
  messages: WhatsAppChatMessage[];
  createdAt: string;
  updatedAt: string;
  contactName?: string;
  humanTakeover?: boolean;
  humanTakeoverAt?: string;
  highIntent?: boolean;
  highIntentAt?: string;
  adminReadAt?: string;
};

type WhatsAppPayment = {
  paymentId: string;
  phone: string;
  amountZar: number;
  date: string;
  summary: string;
  status: "pending" | "complete" | "failed";
  payfastPaymentId?: string;
  contactName?: string;
  email?: string;
  businessName?: string;
  industry?: string;
  paidAt?: string;
  createdAt: string;
};

type AdminTab = "sites" | "whatsapp";

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

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits ? `+${digits}` : "—";
}

function whatsappChatHref(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  return digits ? `https://wa.me/${digits}` : null;
}

function chatHasUnread(chat: WhatsAppChat): boolean {
  const readMs = chat.adminReadAt ? Date.parse(chat.adminReadAt) : NaN;
  const readThreshold = Number.isFinite(readMs) ? readMs : 0;
  return chat.messages.some((message) => {
    if (message.role !== "user") return false;
    const at = Date.parse(message.at);
    return Number.isFinite(at) && at > readThreshold;
  });
}

function WhatsAppOpenLink({
  phone,
  className,
}: {
  phone: string;
  className?: string;
}) {
  const href = whatsappChatHref(phone);
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(event) => event.stopPropagation()}
      className={
        className ||
        "inline-flex shrink-0 items-center justify-center rounded-full border border-teal-700/30 bg-teal-50 px-2.5 py-1 text-[11px] font-semibold text-teal-900 transition hover:bg-teal-100"
      }
    >
      WhatsApp
    </a>
  );
}

export default function AdminDashboard() {
  const { authFetch } = useAuth();
  const [tab, setTab] = useState<AdminTab>("whatsapp");

  const [sites, setSites] = useState<AdminPaidSite[]>([]);
  const [sitesLoading, setSitesLoading] = useState(true);
  const [sitesError, setSitesError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [chats, setChats] = useState<WhatsAppChat[]>([]);
  const [payments, setPayments] = useState<WhatsAppPayment[]>([]);
  const [waLoading, setWaLoading] = useState(true);
  const [waError, setWaError] = useState<string | null>(null);
  const [waQuery, setWaQuery] = useState("");
  const [highIntentOnly, setHighIntentOnly] = useState(false);
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [replySending, setReplySending] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [takeoverSaving, setTakeoverSaving] = useState(false);
  const [highIntentSaving, setHighIntentSaving] = useState(false);
  const [deletingChat, setDeletingChat] = useState(false);

  const loadSites = useCallback(async () => {
    try {
      const response = await authFetch("/api/admin/sites");
      const data = (await response.json()) as {
        success?: boolean;
        sites?: AdminPaidSite[];
        error?: string;
      };
      if (!response.ok || !data.success) {
        setSitesError(data.error || "Could not load paid websites.");
        return;
      }
      setSitesError(null);
      setSites(data.sites ?? []);
    } catch {
      setSitesError("Could not load paid websites. Please try again.");
    } finally {
      setSitesLoading(false);
    }
  }, [authFetch]);

  const loadWhatsApp = useCallback(async () => {
    try {
      const response = await authFetch("/api/admin/whatsapp?days=7");
      const data = (await response.json()) as {
        success?: boolean;
        chats?: WhatsAppChat[];
        payments?: WhatsAppPayment[];
        error?: string;
      };
      if (!response.ok || !data.success) {
        setWaError(data.error || "Could not load WhatsApp data.");
        return;
      }
      setWaError(null);
      setChats(data.chats ?? []);
      setPayments(data.payments ?? []);
    } catch {
      setWaError("Could not load WhatsApp data. Please try again.");
    } finally {
      setWaLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load admin data on mount
    void loadSites();
    void loadWhatsApp();
  }, [loadSites, loadWhatsApp]);

  const exportAllChats = useCallback(async () => {
    setExporting(true);
    setExportError(null);
    try {
      const response = await authFetch("/api/admin/whatsapp/export");
      const contentType = response.headers.get("Content-Type") || "";
      if (!response.ok || !contentType.includes("application/json")) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setExportError(data?.error || "Could not export chats.");
        return;
      }

      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") || "";
      const match = /filename="([^"]+)"/.exec(disposition);
      const filename = match?.[1] || `whatsapp-chats-${new Date().toISOString().slice(0, 10)}.json`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      setExportError("Could not export chats. Please try again.");
    } finally {
      setExporting(false);
    }
  }, [authFetch]);

  const patchChat = useCallback(
    (phone: string, patch: Partial<WhatsAppChat>) => {
      setChats((prev) =>
        prev.map((chat) =>
          chat.phone === phone ? { ...chat, ...patch } : chat,
        ),
      );
    },
    [],
  );

  const sendReply = useCallback(
    async (phone: string, message: string) => {
      const text = message.trim();
      if (!text) return;
      setReplySending(true);
      setReplyError(null);
      try {
        const response = await authFetch("/api/admin/whatsapp/reply", {
          method: "POST",
          body: JSON.stringify({ phone, message: text, pauseAi: true }),
        });
        const data = (await response.json()) as {
          success?: boolean;
          error?: string;
          message?: WhatsAppChatMessage;
          humanTakeover?: boolean;
          at?: string;
        };
        if (!response.ok || !data.success || !data.message) {
          setReplyError(data.error || "Could not send reply.");
          return;
        }
        setChats((prev) =>
          prev.map((chat) => {
            if (chat.phone !== phone) return chat;
            return {
              ...chat,
              messages: [...chat.messages, data.message!],
              date: data.at || chat.date,
              updatedAt: data.at || chat.updatedAt,
              humanTakeover: data.humanTakeover ?? true,
              humanTakeoverAt: data.at || chat.humanTakeoverAt,
            };
          }),
        );
        setReplyDraft("");
      } catch {
        setReplyError("Could not send reply. Please try again.");
      } finally {
        setReplySending(false);
      }
    },
    [authFetch],
  );

  const setHumanTakeover = useCallback(
    async (phone: string, humanTakeover: boolean) => {
      setTakeoverSaving(true);
      setReplyError(null);
      try {
        const response = await authFetch("/api/admin/whatsapp/takeover", {
          method: "POST",
          body: JSON.stringify({ phone, humanTakeover }),
        });
        const data = (await response.json()) as {
          success?: boolean;
          error?: string;
          humanTakeover?: boolean;
          humanTakeoverAt?: string | null;
        };
        if (!response.ok || !data.success) {
          setReplyError(data.error || "Could not update AI pause.");
          return;
        }
        patchChat(phone, {
          humanTakeover: Boolean(data.humanTakeover),
          humanTakeoverAt: data.humanTakeoverAt || undefined,
        });
      } catch {
        setReplyError("Could not update AI pause. Please try again.");
      } finally {
        setTakeoverSaving(false);
      }
    },
    [authFetch, patchChat],
  );

  const setHighIntent = useCallback(
    async (phone: string, highIntent: boolean) => {
      setHighIntentSaving(true);
      setReplyError(null);
      try {
        const response = await authFetch("/api/admin/whatsapp/high-intent", {
          method: "POST",
          body: JSON.stringify({ phone, highIntent }),
        });
        const data = (await response.json()) as {
          success?: boolean;
          error?: string;
          highIntent?: boolean;
          highIntentAt?: string | null;
        };
        if (!response.ok || !data.success) {
          setReplyError(data.error || "Could not update high intent label.");
          return;
        }
        patchChat(phone, {
          highIntent: Boolean(data.highIntent),
          highIntentAt: data.highIntentAt || undefined,
        });
      } catch {
        setReplyError("Could not update high intent label. Please try again.");
      } finally {
        setHighIntentSaving(false);
      }
    },
    [authFetch, patchChat],
  );

  const deleteChat = useCallback(
    async (phone: string) => {
      const label = phone.replace(/\D/g, "") ? `+${phone.replace(/\D/g, "")}` : phone;
      if (
        !window.confirm(
          `Delete chat with ${label}? This removes the conversation and sales-bot history for this number.`,
        )
      ) {
        return;
      }
      setDeletingChat(true);
      setReplyError(null);
      try {
        const response = await authFetch("/api/admin/whatsapp/delete", {
          method: "POST",
          body: JSON.stringify({ phone }),
        });
        const data = (await response.json()) as {
          success?: boolean;
          error?: string;
        };
        if (!response.ok || !data.success) {
          setReplyError(data.error || "Could not delete chat.");
          return;
        }
        setChats((prev) => prev.filter((chat) => chat.phone !== phone));
        setSelectedPhone((current) => (current === phone ? null : current));
        setReplyDraft("");
      } catch {
        setReplyError("Could not delete chat. Please try again.");
      } finally {
        setDeletingChat(false);
      }
    },
    [authFetch],
  );

  const markChatRead = useCallback(async (phone: string) => {
    let shouldPersist = false;
    const readAt = new Date().toISOString();
    setChats((prev) => {
      const chat = prev.find((item) => item.phone === phone);
      if (!chat || !chatHasUnread(chat)) return prev;
      shouldPersist = true;
      return prev.map((item) =>
        item.phone === phone ? { ...item, adminReadAt: readAt } : item,
      );
    });
    if (!shouldPersist) return;
    try {
      const response = await authFetch("/api/admin/whatsapp/read", {
        method: "POST",
        body: JSON.stringify({ phone }),
      });
      const data = (await response.json()) as {
        success?: boolean;
        adminReadAt?: string | null;
      };
      if (response.ok && data.success && data.adminReadAt) {
        setChats((prev) =>
          prev.map((item) =>
            item.phone === phone
              ? { ...item, adminReadAt: data.adminReadAt! }
              : item,
          ),
        );
      }
    } catch {
      // Keep optimistic read state; next refresh will reconcile.
    }
  }, [authFetch]);

  const selectPhone = useCallback(
    (phone: string | null) => {
      setSelectedPhone(phone);
      if (phone) void markChatRead(phone);
    },
    [markChatRead],
  );

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

  const paidPhones = useMemo(() => {
    const set = new Set<string>();
    for (const payment of payments) {
      if (payment.status === "complete") set.add(payment.phone);
    }
    return set;
  }, [payments]);

  const completedPayments = useMemo(
    () => payments.filter((payment) => payment.status === "complete"),
    [payments],
  );

  const highIntentCount = useMemo(
    () => chats.filter((chat) => chat.highIntent).length,
    [chats],
  );

  const filteredChats = useMemo(() => {
    const q = waQuery.trim().toLowerCase();
    return chats.filter((chat) => {
      if (highIntentOnly && !chat.highIntent) return false;
      if (!q) return true;
      const haystack = [
        chat.phone,
        chat.contactName,
        ...chat.messages.map((m) => m.content),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [chats, waQuery, highIntentOnly]);

  const selectedChat = selectedPhone
    ? chats.find((chat) => chat.phone === selectedPhone) ?? null
    : filteredChats[0] ?? null;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset composer when switching chats
    setReplyDraft("");
    setReplyError(null);
  }, [selectedChat?.phone]);

  useEffect(() => {
    if (selectedChat?.phone) {
      void markChatRead(selectedChat.phone);
    }
  }, [selectedChat?.phone, markChatRead]);

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
            Review paid websites, WhatsApp chats from the past 7 days, and deposit
            payments.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (tab === "sites") {
              setSitesLoading(true);
              void loadSites();
            } else {
              setWaLoading(true);
              void loadWhatsApp();
            }
          }}
          className="inline-flex items-center justify-center rounded-full border border-stone-300 bg-white px-5 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-50"
        >
          Refresh
        </button>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <TabButton
          active={tab === "whatsapp"}
          onClick={() => setTab("whatsapp")}
          label="WhatsApp"
        />
        <TabButton
          active={tab === "sites"}
          onClick={() => setTab("sites")}
          label="Paid websites"
        />
      </div>

      {tab === "whatsapp" ? (
        <WhatsAppAdminPanel
          loading={waLoading}
          error={waError}
          exportError={exportError}
          exporting={exporting}
          onExport={exportAllChats}
          onRefreshChats={() => {
            setWaLoading(true);
            void loadWhatsApp();
          }}
          chats={filteredChats}
          allChatCount={chats.length}
          payments={completedPayments}
          allPayments={payments}
          paidPhones={paidPhones}
          query={waQuery}
          onQueryChange={setWaQuery}
          highIntentOnly={highIntentOnly}
          onHighIntentOnlyChange={setHighIntentOnly}
          highIntentCount={highIntentCount}
          selectedChat={selectedChat}
          selectedPhone={selectedChat?.phone ?? null}
          onSelectPhone={selectPhone}
          replyDraft={replyDraft}
          onReplyDraftChange={setReplyDraft}
          replySending={replySending}
          replyError={replyError}
          onSendReply={(phone) => void sendReply(phone, replyDraft)}
          takeoverSaving={takeoverSaving}
          onSetTakeover={(phone, value) => void setHumanTakeover(phone, value)}
          highIntentSaving={highIntentSaving}
          onSetHighIntent={(phone, value) => void setHighIntent(phone, value)}
          deletingChat={deletingChat}
          onDeleteChat={(phone) => void deleteChat(phone)}
        />
      ) : (
        <SitesAdminPanel
          loading={sitesLoading}
          error={sitesError}
          filtered={filtered}
          sites={sites}
          query={query}
          onQueryChange={setQuery}
          selected={selected}
          selectedId={selectedId}
          onSelectId={setSelectedId}
        />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
        active
          ? "bg-teal-800 text-white"
          : "border border-stone-300 bg-white text-stone-700 hover:bg-stone-50"
      }`}
    >
      {label}
    </button>
  );
}

function WhatsAppAdminPanel({
  loading,
  error,
  exportError,
  exporting,
  onExport,
  onRefreshChats,
  chats,
  allChatCount,
  payments,
  allPayments,
  paidPhones,
  query,
  onQueryChange,
  highIntentOnly,
  onHighIntentOnlyChange,
  highIntentCount,
  selectedChat,
  selectedPhone,
  onSelectPhone,
  replyDraft,
  onReplyDraftChange,
  replySending,
  replyError,
  onSendReply,
  takeoverSaving,
  onSetTakeover,
  highIntentSaving,
  onSetHighIntent,
  deletingChat,
  onDeleteChat,
}: {
  loading: boolean;
  error: string | null;
  exportError: string | null;
  exporting: boolean;
  onExport: () => void;
  onRefreshChats: () => void;
  chats: WhatsAppChat[];
  allChatCount: number;
  payments: WhatsAppPayment[];
  allPayments: WhatsAppPayment[];
  paidPhones: Set<string>;
  query: string;
  onQueryChange: (value: string) => void;
  highIntentOnly: boolean;
  onHighIntentOnlyChange: (value: boolean) => void;
  highIntentCount: number;
  selectedChat: WhatsAppChat | null;
  selectedPhone: string | null;
  onSelectPhone: (phone: string | null) => void;
  replyDraft: string;
  onReplyDraftChange: (value: string) => void;
  replySending: boolean;
  replyError: string | null;
  onSendReply: (phone: string) => void;
  takeoverSaving: boolean;
  onSetTakeover: (phone: string, humanTakeover: boolean) => void;
  highIntentSaving: boolean;
  onSetHighIntent: (phone: string, highIntent: boolean) => void;
  deletingChat: boolean;
  onDeleteChat: (phone: string) => void;
}) {
  return (
    <div className="mt-8 space-y-10">
      {error ? (
        <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {exportError ? (
        <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {exportError}
        </p>
      ) : null}

      <section>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-800">
              Deposits
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-stone-900">
              {loading
                ? "Loading…"
                : `${payments.length} completed payment${payments.length === 1 ? "" : "s"} (7 days)`}
            </h2>
          </div>
          <p className="text-xs text-stone-500">
            {allPayments.filter((p) => p.status === "pending").length} pending ·{" "}
            {allPayments.filter((p) => p.status === "failed").length} failed
          </p>
        </div>

        {loading ? (
          <div className="mt-6 space-y-3">
            {[0, 1].map((key) => (
              <div
                key={key}
                className="h-16 animate-pulse rounded-[1.2rem] bg-stone-200/70"
              />
            ))}
          </div>
        ) : payments.length === 0 ? (
          <div className="mt-6 rounded-[1.4rem] border border-stone-200/80 bg-white px-6 py-10 text-center shadow-sm">
            <p className="text-sm text-stone-600">No completed WhatsApp deposits in the past 7 days.</p>
          </div>
        ) : (
          <div className="mt-6 overflow-hidden rounded-[1.4rem] border border-stone-200/80 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-stone-200 bg-[#f7f3ea]/70 text-xs uppercase tracking-wide text-stone-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Phone</th>
                    <th className="px-4 py-3 font-semibold">Amount</th>
                    <th className="px-4 py-3 font-semibold">Paid</th>
                    <th className="px-4 py-3 font-semibold">Summary</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((payment) => (
                    <tr
                      key={payment.paymentId}
                      className="border-b border-stone-100 last:border-0"
                    >
                      <td className="px-4 py-3 align-top">
                        <p className="font-medium text-stone-900">
                          {formatPhone(payment.phone)}
                        </p>
                        <p className="mt-0.5 text-xs text-stone-500">
                          {payment.contactName || payment.businessName || "—"}
                        </p>
                      </td>
                      <td className="px-4 py-3 align-top text-stone-700">
                        {formatZar(payment.amountZar)}
                      </td>
                      <td className="px-4 py-3 align-top text-stone-700">
                        {formatDateTime(payment.paidAt || payment.date)}
                      </td>
                      <td className="px-4 py-3 align-top text-stone-600">
                        <p className="line-clamp-3 max-w-md text-sm leading-relaxed">
                          {payment.summary || "—"}
                        </p>
                        {payment.payfastPaymentId ? (
                          <p className="mt-1 font-mono text-[11px] text-stone-400">
                            {payment.payfastPaymentId}
                          </p>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <section>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-800">
              Chats
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-stone-900">
              {loading
                ? "Loading…"
                : `${chats.length} conversation${chats.length === 1 ? "" : "s"} (past 7 days)`}
            </h2>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={onRefreshChats}
              disabled={loading}
              className="inline-flex items-center justify-center rounded-full border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Refreshing…" : "Refresh chats"}
            </button>
            <button
              type="button"
              onClick={() => onHighIntentOnlyChange(!highIntentOnly)}
              className={`inline-flex items-center justify-center rounded-full px-4 py-2.5 text-sm font-semibold transition ${
                highIntentOnly
                  ? "bg-rose-800 text-white"
                  : "border border-stone-300 bg-white text-stone-700 hover:bg-stone-50"
              }`}
            >
              High intent{highIntentCount > 0 ? ` (${highIntentCount})` : ""}
            </button>
            <button
              type="button"
              onClick={onExport}
              disabled={exporting}
              className="inline-flex items-center justify-center rounded-full border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {exporting ? "Exporting…" : "Export all JSON"}
            </button>
            <input
              type="search"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Filter by phone or message…"
              className="w-full rounded-full border border-stone-300 bg-white px-4 py-2.5 text-sm text-stone-900 outline-none ring-teal-700/30 placeholder:text-stone-400 focus:ring-2 sm:max-w-xs"
            />
          </div>
        </div>

        {loading ? (
          <div className="mt-6 grid gap-4 lg:grid-cols-[18rem_1fr]">
            <div className="h-64 animate-pulse rounded-[1.2rem] bg-stone-200/70" />
            <div className="h-64 animate-pulse rounded-[1.2rem] bg-stone-200/70" />
          </div>
        ) : chats.length === 0 ? (
          <div className="mt-6 rounded-[1.4rem] border border-stone-200/80 bg-white px-6 py-10 text-center shadow-sm">
            <p className="text-sm text-stone-600">
              {allChatCount === 0
                ? "No WhatsApp chats in the past 7 days."
                : highIntentOnly
                  ? "No high-intent chats match that filter."
                  : "No chats match that filter."}
            </p>
          </div>
        ) : (
          <div className="mt-6 grid gap-4 lg:grid-cols-[20rem_1fr]">
            <div className="overflow-hidden rounded-[1.4rem] border border-stone-200/80 bg-white shadow-sm">
              <ul className="max-h-[32rem] overflow-y-auto divide-y divide-stone-100">
                {chats.map((chat) => {
                  const active = chat.phone === selectedPhone;
                  const paid = paidPhones.has(chat.phone);
                  return (
                    <li key={chat.phone}>
                      <button
                        type="button"
                        onClick={() => onSelectPhone(chat.phone)}
                        className={`w-full px-4 py-3 text-left transition ${
                          active ? "bg-teal-50" : "hover:bg-stone-50"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="flex items-center gap-2 font-medium text-stone-900">
                              {chatHasUnread(chat) ? (
                                <span
                                  className="inline-block h-2 w-2 shrink-0 rounded-full bg-red-500"
                                  aria-label="Unread messages"
                                  title="Unread messages"
                                />
                              ) : null}
                              <span className="truncate">{formatPhone(chat.phone)}</span>
                            </p>
                            <p className="mt-0.5 text-xs text-stone-500">
                              {chat.contactName || "Unknown contact"}
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1">
                            {chat.highIntent ? (
                              <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-900">
                                High intent
                              </span>
                            ) : null}
                            {paid ? (
                              <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[11px] font-medium text-teal-900">
                                Paid
                              </span>
                            ) : null}
                            {chat.humanTakeover ? (
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900">
                                AI paused
                              </span>
                            ) : null}
                            <WhatsAppOpenLink phone={chat.phone} />
                          </div>
                        </div>
                        <p className="mt-1 text-[11px] text-stone-400">
                          {formatDateTime(chat.date)} · {chat.messages.length} msg
                          {chat.messages.length === 1 ? "" : "s"}
                        </p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="overflow-hidden rounded-[1.4rem] border border-stone-200/80 bg-white shadow-sm">
              {selectedChat ? (
                <div className="flex h-full max-h-[40rem] flex-col">
                  <div className="border-b border-stone-200 bg-[#f7f3ea]/50 px-4 py-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="font-semibold text-stone-900">
                          {formatPhone(selectedChat.phone)}
                        </p>
                        <p className="mt-0.5 text-xs text-stone-500">
                          {selectedChat.contactName || "WhatsApp conversation"} · last{" "}
                          {formatDateTime(selectedChat.date)}
                          {paidPhones.has(selectedChat.phone) ? " · Paid deposit" : ""}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={highIntentSaving}
                          onClick={() =>
                            onSetHighIntent(
                              selectedChat.phone,
                              !selectedChat.highIntent,
                            )
                          }
                          className={`inline-flex items-center justify-center rounded-full px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                            selectedChat.highIntent
                              ? "border border-rose-300 bg-rose-50 text-rose-950 hover:bg-rose-100"
                              : "border border-stone-300 bg-white text-stone-700 hover:bg-stone-50"
                          }`}
                        >
                          {highIntentSaving
                            ? "Saving…"
                            : selectedChat.highIntent
                              ? "High intent ✓"
                              : "Mark high intent"}
                        </button>
                        <button
                          type="button"
                          disabled={takeoverSaving}
                          onClick={() =>
                            onSetTakeover(
                              selectedChat.phone,
                              !selectedChat.humanTakeover,
                            )
                          }
                          className={`inline-flex items-center justify-center rounded-full px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                            selectedChat.humanTakeover
                              ? "border border-amber-300 bg-amber-50 text-amber-950 hover:bg-amber-100"
                              : "border border-stone-300 bg-white text-stone-700 hover:bg-stone-50"
                          }`}
                        >
                          {takeoverSaving
                            ? "Saving…"
                            : selectedChat.humanTakeover
                              ? "Resume AI"
                              : "Pause AI / take over"}
                        </button>
                        <WhatsAppOpenLink
                          phone={selectedChat.phone}
                          className="inline-flex shrink-0 items-center justify-center rounded-full border border-teal-700/30 bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-900 transition hover:bg-teal-100"
                        />
                        <button
                          type="button"
                          disabled={deletingChat}
                          onClick={() => onDeleteChat(selectedChat.phone)}
                          className="inline-flex items-center justify-center rounded-full border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {deletingChat ? "Deleting…" : "Delete chat"}
                        </button>
                      </div>
                    </div>
                    {selectedChat.humanTakeover ? (
                      <p className="mt-2 text-xs text-amber-800">
                        AI replies are paused
                        {selectedChat.humanTakeoverAt
                          ? ` since ${formatDateTime(selectedChat.humanTakeoverAt)}`
                          : ""}
                        . Customer messages are still logged.
                      </p>
                    ) : (
                      <p className="mt-2 text-xs text-stone-500">
                        Sending a reply from here also pauses the AI for this chat.
                      </p>
                    )}
                  </div>
                  <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
                    {selectedChat.messages.map((message, index) => {
                      const isHuman = message.source === "human";
                      const isCustomer = message.role === "user";
                      // Admin ("You") and Lula stay on the left; customer on the right.
                      const alignLeft = !isCustomer;
                      const label = isCustomer
                        ? "Customer"
                        : isHuman
                          ? "You"
                          : "Lula";
                      return (
                        <div
                          key={`${message.at}-${index}`}
                          className={`flex ${
                            alignLeft ? "justify-start" : "justify-end"
                          }`}
                        >
                          <div
                            className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                              isCustomer
                                ? "rounded-br-md bg-stone-100 text-stone-800"
                                : isHuman
                                  ? "rounded-bl-md bg-teal-800 text-white"
                                  : "rounded-bl-md border border-stone-200 bg-white text-stone-800"
                            }`}
                          >
                            <p className="whitespace-pre-wrap">{message.content}</p>
                            <p
                              className={`mt-1 text-[10px] ${
                                isHuman
                                  ? "text-teal-100/80"
                                  : "text-stone-400"
                              }`}
                            >
                              {label} · {formatDateTime(message.at)}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="border-t border-stone-200 bg-white px-4 py-3">
                    {replyError ? (
                      <p className="mb-2 text-xs text-red-700">{replyError}</p>
                    ) : null}
                    <form
                      className="flex flex-col gap-2 sm:flex-row sm:items-end"
                      onSubmit={(event) => {
                        event.preventDefault();
                        onSendReply(selectedChat.phone);
                      }}
                    >
                      <label className="sr-only" htmlFor="admin-wa-reply">
                        Reply as business WhatsApp number
                      </label>
                      <textarea
                        id="admin-wa-reply"
                        value={replyDraft}
                        onChange={(event) => onReplyDraftChange(event.target.value)}
                        rows={2}
                        placeholder="Reply as the Lulaweb WhatsApp number…"
                        className="min-h-[2.75rem] w-full flex-1 resize-y rounded-2xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm text-stone-900 outline-none ring-teal-700/30 placeholder:text-stone-400 focus:ring-2"
                        disabled={replySending}
                      />
                      <button
                        type="submit"
                        disabled={replySending || !replyDraft.trim()}
                        className="inline-flex shrink-0 items-center justify-center rounded-full bg-teal-800 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-900 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {replySending ? "Sending…" : "Send"}
                      </button>
                    </form>
                  </div>
                </div>
              ) : (
                <div className="flex h-64 items-center justify-center px-6 text-sm text-stone-500">
                  Select a conversation
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function SitesAdminPanel({
  loading,
  error,
  filtered,
  sites,
  query,
  onQueryChange,
  selected,
  selectedId,
  onSelectId,
}: {
  loading: boolean;
  error: string | null;
  filtered: AdminPaidSite[];
  sites: AdminPaidSite[];
  query: string;
  onQueryChange: (value: string) => void;
  selected: AdminPaidSite | null;
  selectedId: string | null;
  onSelectId: (id: string | null) => void;
}) {
  return (
    <div className="mt-8">
      {error ? (
        <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <section className="mt-2">
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
            onChange={(event) => onQueryChange(event.target.value)}
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
                            onSelectId(
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
                onClick={() => onSelectId(null)}
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
