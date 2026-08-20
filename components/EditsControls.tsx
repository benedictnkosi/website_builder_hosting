"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import TopUpModal from "@/components/TopUpModal";
import { formatEditsRemaining } from "@/lib/pricing";
import {
  EDITS_CHANGED_EVENT,
  EDITS_TOPUP_EVENT,
  notifyEditsChanged,
} from "@/lib/edit-events";

function EditsControlsInner() {
  const { user, authFetch } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [remaining, setRemaining] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const loadBalance = useCallback(async () => {
    if (!user) {
      setRemaining(null);
      return;
    }

    try {
      const response = await authFetch("/api/edits");
      const data = (await response.json()) as {
        success?: boolean;
        editsRemaining?: number;
      };
      if (response.ok && data.success && typeof data.editsRemaining === "number") {
        setRemaining(data.editsRemaining);
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

    window.addEventListener(EDITS_CHANGED_EVENT, onChanged);
    window.addEventListener(EDITS_TOPUP_EVENT, onTopup);
    return () => {
      window.removeEventListener(EDITS_CHANGED_EVENT, onChanged);
      window.removeEventListener(EDITS_TOPUP_EVENT, onTopup);
    };
  }, [loadBalance]);

  useEffect(() => {
    const edits = searchParams.get("edits") || searchParams.get("tokens");
    if (edits !== "return" && edits !== "cancel") return;

    if (edits === "cancel") {
      setNotice("Edit payment was cancelled.");
      setOpen(true);
    } else {
      setNotice("Confirming your PayFast Edit payment...");
      void (async () => {
        for (let attempt = 0; attempt < 6; attempt += 1) {
          await loadBalance();
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }
        notifyEditsChanged();
        setNotice("If payment succeeded, your Edits are now available.");
        window.setTimeout(() => setNotice(null), 8000);
      })();
    }

    const params = new URLSearchParams(searchParams.toString());
    params.delete("edits");
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
        title="Buy more Edits"
      >
        <span aria-hidden="true">✏️</span>
        <span className="hidden sm:inline">
          {remaining == null ? "Edits Remaining" : formatEditsRemaining(remaining)}
        </span>
        <span className="sm:hidden">
          {remaining == null ? "Edits" : remaining}
        </span>
      </button>
      {notice ? (
        <span className="hidden max-w-[16rem] truncate rounded-full bg-teal-50 px-3 py-1.5 text-xs text-teal-900 lg:inline">
          {notice}
        </span>
      ) : null}
      <TopUpModal
        open={open}
        onClose={() => {
          setOpen(false);
          setNotice(null);
        }}
        onPurchased={(editsRemaining) => setRemaining(editsRemaining)}
      />
    </>
  );
}

export default function EditsControls() {
  return (
    <Suspense fallback={null}>
      <EditsControlsInner />
    </Suspense>
  );
}
