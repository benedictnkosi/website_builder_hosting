"use client";

import type { WebsiteFile } from "@/lib/types";

interface CodeViewerProps {
  file: WebsiteFile | null;
}

export default function CodeViewer({ file }: CodeViewerProps) {
  if (!file) {
    return (
      <div className="flex h-full min-h-[280px] items-center justify-center bg-[#1c1917] px-6 text-center text-sm text-stone-400">
        Select a file to view its contents.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-[280px] flex-col bg-[#1c1917]">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
        <p className="truncate font-mono text-xs text-stone-300">{file.path}</p>
        <p className="shrink-0 pl-4 text-[11px] uppercase tracking-wide text-stone-500">
          {file.content.length.toLocaleString()} characters
        </p>
      </div>
      <pre className="flex-1 overflow-auto p-4 text-[13px] leading-6 text-stone-100">
        <code className="font-mono whitespace-pre">{file.content}</code>
      </pre>
    </div>
  );
}
