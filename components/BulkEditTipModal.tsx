"use client";

import { useEffect } from "react";

const STORAGE_KEY = "lulaweb-bulk-edit-tip-seen";

export function hasSeenBulkEditTip(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function markBulkEditTipSeen(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // Ignore private-mode storage failures; the tip may show again.
  }
}

type BulkEditTipModalProps = {
  onAddMore: () => void;
  onSend: () => void;
};

export default function BulkEditTipModal({
  onAddMore,
  onSend,
}: BulkEditTipModalProps) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onAddMore();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onAddMore]);

  return (
    <div
      className="absolute inset-0 z-20 flex items-end justify-center bg-stone-900/35 p-3 sm:items-center sm:p-6"
      onClick={onAddMore}
    >
      <section
        role="dialog"
        aria-labelledby="bulk-edit-tip-title"
        aria-describedby="bulk-edit-tip-body"
        className="w-full max-w-md rounded-[1.4rem] border border-stone-200 bg-white p-5 shadow-[0_24px_80px_rgba(28,25,23,0.2)] sm:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-800">
          Save Edits
        </p>
        <h2
          id="bulk-edit-tip-title"
          className="mt-1 text-2xl font-semibold tracking-tight text-stone-900"
        >
          Bundle your changes
        </h2>
        <p
          id="bulk-edit-tip-body"
          className="mt-2 text-sm leading-relaxed text-stone-600"
        >
          Each change uses 1 Edit. Put everything you want in one message
          instead of sending changes one at a time. For example, don&apos;t only
          change the business name — also add trading hours, a phone number, or
          other tweaks in the same request.
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onAddMore}
            className="rounded-full px-4 py-2.5 text-sm font-medium text-stone-600 transition hover:bg-stone-100"
          >
            I&apos;ll add more
          </button>
          <button
            type="button"
            onClick={onSend}
            className="rounded-full bg-teal-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-700"
          >
            Send this change
          </button>
        </div>
      </section>
    </div>
  );
}
