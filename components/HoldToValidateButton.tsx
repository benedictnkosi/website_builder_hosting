"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const HOLD_DURATION_MS = 2000;

type HoldToValidateButtonProps = {
  disabled?: boolean;
  loading?: boolean;
  loadingLabel?: string;
  label?: string;
  onValidated: () => void;
};

export default function HoldToValidateButton({
  disabled = false,
  loading = false,
  loadingLabel = "Generating website...",
  label = "Hold to launch website",
  onValidated,
}: HoldToValidateButtonProps) {
  const [holding, setHolding] = useState(false);
  const [progress, setProgress] = useState(0);
  const holdStartRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const validatedRef = useRef(false);

  const clearHold = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    holdStartRef.current = null;
    setHolding(false);
    if (!validatedRef.current) {
      setProgress(0);
    }
  }, []);

  const startHold = useCallback(() => {
    if (disabled || loading || holdStartRef.current) return;

    validatedRef.current = false;
    holdStartRef.current = Date.now();
    setHolding(true);
    setProgress(0);

    intervalRef.current = setInterval(() => {
      if (!holdStartRef.current) return;

      const elapsed = Date.now() - holdStartRef.current;
      const nextProgress = Math.min(100, (elapsed / HOLD_DURATION_MS) * 100);
      setProgress(nextProgress);

      if (nextProgress >= 100) {
        validatedRef.current = true;
        clearHold();
        setProgress(100);
        onValidated();
      }
    }, 50);
  }, [clearHold, disabled, loading, onValidated]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const isInactive = disabled || loading;

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={isInactive}
        onPointerDown={startHold}
        onPointerUp={clearHold}
        onPointerLeave={clearHold}
        onPointerCancel={clearHold}
        className="relative inline-flex w-full touch-none items-center justify-center overflow-hidden rounded-full bg-teal-800 px-6 py-3 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-stone-400 sm:w-auto"
        aria-label={loading ? loadingLabel : label}
      >
        <span
          className="absolute inset-0 bg-teal-600 transition-[width] duration-75 ease-out"
          style={{ width: holding || progress === 100 ? `${progress}%` : "0%" }}
        />
        <span className="relative z-10">
          {loading ? loadingLabel : holding ? "Keep holding..." : label}
        </span>
      </button>
      {!loading && !disabled ? (
        <p className="text-sm text-stone-500">
          Hold the button for a few seconds to confirm you&apos;re human.
        </p>
      ) : null}
    </div>
  );
}
