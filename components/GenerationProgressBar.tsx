"use client";

import { useEffect, useRef, useState } from "react";

type GenerationProgressBarProps = {
  active: boolean;
  progress?: number | null;
  label?: string;
  completeLabel?: string;
};

export default function GenerationProgressBar({
  active,
  progress = null,
  label = "Working on your website...",
  completeLabel = "Done!",
}: GenerationProgressBarProps) {
  const [displayProgress, setDisplayProgress] = useState(0);
  const [phase, setPhase] = useState<"idle" | "running" | "complete">("idle");
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasActiveRef = useRef(false);

  useEffect(() => {
    if (active) {
      wasActiveRef.current = true;
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
      // eslint-disable-next-line react-hooks/set-state-in-effect -- progress is driven by the active job
      setPhase("running");
      setDisplayProgress(
        typeof progress === "number" ? Math.max(0, Math.min(99, progress)) : 0,
      );
      return undefined;
    }

    if (!wasActiveRef.current) {
      return undefined;
    }

    wasActiveRef.current = false;
    setDisplayProgress(100);
    setPhase("complete");
    hideTimerRef.current = setTimeout(() => {
      setPhase("idle");
      setDisplayProgress(0);
    }, 1200);

    return undefined;
  }, [active, progress]);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }
    };
  }, []);

  if (phase === "idle") {
    return null;
  }

  const value = phase === "complete" ? 100 : displayProgress;
  const displayLabel = phase === "complete" ? completeLabel : label;

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex items-center justify-between text-sm text-stone-600">
        <span>{displayLabel}</span>
        <span>{Math.round(value)}%</span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-stone-200"
        role="progressbar"
        aria-valuenow={Math.round(value)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={displayLabel}
      >
        <div
          className="h-full rounded-full bg-teal-700 transition-[width] duration-150 ease-out"
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}
