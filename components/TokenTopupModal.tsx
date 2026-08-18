"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { trackTokenTopupStart, trackTokenTopupSuccess } from "@/lib/analytics";
import { submitPayfastForm } from "@/lib/payfast-browser";
import {
  formatTokenCount,
  formatZar,
  TOKEN_TOPUP_TOKENS,
  TOKEN_TOPUP_ZAR,
} from "@/lib/pricing";
import { notifyTokensChanged } from "@/lib/token-events";

type TokenTopupModalProps = {
  open: boolean;
  onClose: () => void;
  onPurchased?: (tokenBalance: number) => void;
};

export default function TokenTopupModal({
  open,
  onClose,
  onPurchased,
}: TokenTopupModalProps) {
  const { user, authFetch } = useAuth();
  const pathname = usePathname();
  const [checkingOut, setCheckingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function handleBuy() {
    if (checkingOut) return;
    setCheckingOut(true);
    setError(null);
    trackTokenTopupStart();

    try {
      const response = await authFetch("/api/tokens/checkout", {
        method: "POST",
        body: JSON.stringify({
          returnPath: pathname || "/dashboard",
          email: user?.email ?? "",
          name: user?.displayName ?? "",
        }),
      });
      const data = (await response.json()) as {
        success?: boolean;
        paid?: boolean;
        tokenBalance?: number;
        processUrl?: string;
        fields?: Record<string, string>;
        error?: string;
      };

      if (!response.ok || !data.success) {
        setError(data.error || "Could not start checkout.");
        return;
      }

      if (data.paid) {
        trackTokenTopupSuccess();
        notifyTokensChanged();
        onPurchased?.(data.tokenBalance ?? 0);
        onClose();
        return;
      }

      if (!data.processUrl || !data.fields) {
        setError("PayFast did not return checkout details.");
        return;
      }

      submitPayfastForm(data.processUrl, data.fields);
    } catch {
      setError("Could not start PayFast checkout. Please try again.");
    } finally {
      setCheckingOut(false);
    }
  }

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-stone-900/35 p-3 sm:items-center sm:p-6"
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-labelledby="token-topup-title"
        className="w-full max-w-md rounded-[1.4rem] border border-stone-200 bg-white p-5 shadow-[0_24px_80px_rgba(28,25,23,0.2)] sm:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-800">
          Token top-up
        </p>
        <h2
          id="token-topup-title"
          className="mt-1 text-2xl font-semibold tracking-tight text-stone-900"
        >
          Buy more building tokens
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-stone-600">
          Tokens are used when you chat, generate, and edit websites. Pay with a
          card through PayFast.
        </p>
        <div className="mt-5 rounded-2xl border border-stone-200 bg-[#f7f3ea] px-4 py-4">
          <p className="text-3xl font-semibold tracking-tight text-stone-900">
            {formatZar(TOKEN_TOPUP_ZAR)}
          </p>
          <p className="mt-1 text-sm text-stone-600">
            {formatTokenCount(TOKEN_TOPUP_TOKENS)} tokens · once-off card payment
          </p>
        </div>
        {error ? (
          <p className="mt-4 text-sm text-red-700">{error}</p>
        ) : null}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={checkingOut}
            className="rounded-full px-4 py-2.5 text-sm font-medium text-stone-600 transition hover:bg-stone-100 disabled:opacity-50"
          >
            Not now
          </button>
          <button
            type="button"
            onClick={() => void handleBuy()}
            disabled={checkingOut}
            className="rounded-full bg-teal-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-stone-400"
          >
            {checkingOut ? "Redirecting..." : `Pay ${formatZar(TOKEN_TOPUP_ZAR)} with card`}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
