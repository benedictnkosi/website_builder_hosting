"use client";

import { useEffect, useRef, useState } from "react";

const DEFAULT_DURATION_MS = 60_000;

type GenerationProgressBarProps = {
  active: boolean;
  durationMs?: number;
  label?: string;
  completeLabel?: string;
};

export default function GenerationProgressBar({
  active,
  durationMs = DEFAULT_DURATION_MS,
  label = "Working on your website...",
  completeLabel = "Done!",
}: GenerationProgressBarProps) {
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<"idle" | "running" | "complete">("idle");
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }

    if (active) {
      setPhase("running");
      setProgress(0);

      const start = Date.now();
      const interval = setInterval(() => {
        const elapsed = Date.now() - start;
        setProgress(Math.min(95, (elapsed / durationMs) * 95));
      }, 50);

      return () => {
        clearInterval(interval);
        setProgress(100);
        setPhase("complete");
        hideTimerRef.current = setTimeout(() => {
          setPhase("idle");
          setProgress(0);
        }, 1200);
      };
    }

    return undefined;
  }, [active, durationMs]);

  if (phase === "idle") {
    return null;
  }

  const displayLabel = phase === "complete" ? completeLabel : label;

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex items-center justify-between text-sm text-stone-600">
        <span>{displayLabel}</span>
        <span>{Math.round(progress)}%</span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-stone-200"
        role="progressbar"
        aria-valuenow={Math.round(progress)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={displayLabel}
      >
        <div
          className="h-full rounded-full bg-teal-700 transition-[width] duration-150 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
