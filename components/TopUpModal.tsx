"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { getFirebaseAuth } from "@/lib/firebase";
import { trackEditTopupStart, trackEditTopupSuccess } from "@/lib/analytics";
import { submitPayfastForm } from "@/lib/payfast-browser";
import {
  DEFAULT_EDIT_TOPUP_PACKAGE_ID,
  EDIT_TOPUP_PACKAGES,
  editTopupPackage,
  formatEdits,
  formatZar,
  type EditTopupPackageId,
} from "@/lib/pricing";
import { notifyEditsChanged } from "@/lib/edit-events";

type TopUpModalProps = {
  open: boolean;
  onClose: () => void;
  onPurchased?: (editsRemaining: number) => void;
};

export default function TopUpModal({
  open,
  onClose,
  onPurchased,
}: TopUpModalProps) {
  const { user, authFetch, signInWithGoogle } = useAuth();
  const pathname = usePathname();
  const [packageId, setPackageId] = useState<EditTopupPackageId>(
    DEFAULT_EDIT_TOPUP_PACKAGE_ID,
  );
  const [checkingOut, setCheckingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selected = editTopupPackage(packageId);

  if (!open) return null;

  async function handleBuy() {
    if (checkingOut || !selected) return;
    setCheckingOut(true);
    setError(null);
    trackEditTopupStart(selected.amountZar);

    try {
      if (!user) {
        await signInWithGoogle();
      }

      const signedInUser = getFirebaseAuth().currentUser;

      const response = await authFetch("/api/edits/checkout", {
        method: "POST",
        body: JSON.stringify({
          returnPath: pathname || "/dashboard",
          packageId: selected.id,
          email: signedInUser?.email ?? user?.email ?? "",
          name: signedInUser?.displayName ?? user?.displayName ?? "",
        }),
      });
      const data = (await response.json()) as {
        success?: boolean;
        paid?: boolean;
        editsRemaining?: number;
        amountZar?: number;
        processUrl?: string;
        fields?: Record<string, string>;
        error?: string;
      };

      if (!response.ok || !data.success) {
        setError(data.error || "Could not start checkout.");
        return;
      }

      if (data.paid) {
        trackEditTopupSuccess(data.amountZar ?? selected.amountZar);
        notifyEditsChanged();
        onPurchased?.(data.editsRemaining ?? 0);
        onClose();
        return;
      }

      if (!data.processUrl || !data.fields) {
        setError("PayFast did not return checkout details.");
        return;
      }

      submitPayfastForm(data.processUrl, data.fields);
    } catch (err) {
      const code =
        typeof err === "object" && err && "code" in err ? String(err.code) : "";
      if (
        code === "auth/popup-closed-by-user" ||
        code === "auth/cancelled-popup-request"
      ) {
        setError(null);
      } else {
        setError("Could not start PayFast checkout. Please try again.");
      }
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
        aria-labelledby="edit-topup-title"
        className="w-full max-w-xl rounded-[1.4rem] border border-stone-200 bg-white p-5 shadow-[0_24px_80px_rgba(28,25,23,0.2)] sm:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-800">
          Edits
        </p>
        <h2
          id="edit-topup-title"
          className="mt-1 text-2xl font-semibold tracking-tight text-stone-900"
        >
          Buy more Edits
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-stone-600">
          One Edit covers one request, and that request can include several
          changes. A full site generation or rebuild uses 2 Edits.
        </p>
        <div className="mt-5 grid gap-2 sm:grid-cols-3">
          {EDIT_TOPUP_PACKAGES.map((pack) => {
            const selectedPack = pack.id === packageId;
            return (
              <button
                key={pack.id}
                type="button"
                onClick={() => setPackageId(pack.id)}
                disabled={checkingOut}
                className={`rounded-2xl border px-4 py-3 text-left transition ${
                  selectedPack
                    ? "border-teal-800 bg-teal-50"
                    : "border-stone-200 bg-white hover:border-stone-300"
                }`}
              >
                <p
                  className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${
                    pack.id === "five" ? "text-teal-800" : "text-stone-500"
                  }`}
                >
                  {pack.id === "five" ? "Best value pack" : pack.name}
                </p>
                <p className="mt-1 text-lg font-semibold text-stone-900">
                  {formatZar(pack.amountZar)}
                </p>
                <p className="mt-1 text-xs text-stone-500">{formatEdits(pack.edits)}</p>
                <p className="mt-1 text-xs text-stone-500">{pack.usage}</p>
              </button>
            );
          })}
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
            disabled={checkingOut || !selected}
            className="rounded-full bg-teal-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-stone-400"
          >
            {checkingOut
              ? "Redirecting..."
              : `Pay ${formatZar(selected?.amountZar ?? 0)} with card`}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
