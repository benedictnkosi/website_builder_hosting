"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import TokenTopupModal from "@/components/TokenTopupModal";
import { formatTokenCount } from "@/lib/pricing";
import {
  notifyTokensChanged,
  TOKENS_CHANGED_EVENT,
  TOKENS_TOPUP_EVENT,
} from "@/lib/token-events";

function TokenControlsInner() {
  const { user, authFetch } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [balance, setBalance] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const loadBalance = useCallback(async () => {
    if (!user) {
      setBalance(null);
      return;
    }

    try {
      const response = await authFetch("/api/tokens");
      const data = (await response.json()) as {
        success?: boolean;
        tokenBalance?: number;
      };
      if (response.ok && data.success && typeof data.tokenBalance === "number") {
        setBalance(data.tokenBalance);
      }
    } catch {
      // Keep the last known balance if the refresh fails.
    }
  }, [authFetch, user]);

  useEffect(() => {
    void loadBalance();
  }, [loadBalance]);

  useEffect(() => {
    function onChanged() {
      void loadBalance();
    }
    function onTopup() {
      setOpen(true);
    }

    window.addEventListener(TOKENS_CHANGED_EVENT, onChanged);
    window.addEventListener(TOKENS_TOPUP_EVENT, onTopup);
    return () => {
      window.removeEventListener(TOKENS_CHANGED_EVENT, onChanged);
      window.removeEventListener(TOKENS_TOPUP_EVENT, onTopup);
    };
  }, [loadBalance]);

  useEffect(() => {
    const tokens = searchParams.get("tokens");
    if (tokens !== "return" && tokens !== "cancel") return;

    if (tokens === "cancel") {
      setNotice("Token payment was cancelled.");
      setOpen(true);
    } else {
      setNotice("Confirming your PayFast token payment...");
      void (async () => {
        for (let attempt = 0; attempt < 6; attempt += 1) {
          await loadBalance();
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }
        notifyTokensChanged();
        setNotice("If payment succeeded, your tokens are now available.");
        window.setTimeout(() => setNotice(null), 8000);
      })();
    }

    const params = new URLSearchParams(searchParams.toString());
    params.delete("tokens");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [loadBalance, pathname, router, searchParams]);

  if (!user) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-full border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 transition hover:bg-stone-50"
        title="Buy more tokens"
      >
        <span className="hidden sm:inline">
          {balance == null ? "Tokens" : `${formatTokenCount(balance)} tokens`}
        </span>
        <span className="sm:hidden">
          {balance == null ? "Tokens" : formatTokenCount(balance)}
        </span>
      </button>
      {notice ? (
        <span className="hidden max-w-[16rem] truncate rounded-full bg-teal-50 px-3 py-1.5 text-xs text-teal-900 lg:inline">
          {notice}
        </span>
      ) : null}
      <TokenTopupModal
        open={open}
        onClose={() => {
          setOpen(false);
          setNotice(null);
        }}
        onPurchased={(tokenBalance) => setBalance(tokenBalance)}
      />
    </>
  );
}

export default function TokenControls() {
  return (
    <Suspense fallback={null}>
      <TokenControlsInner />
    </Suspense>
  );
}
