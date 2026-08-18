"use client";

import type { WebsiteFile } from "@/lib/types";

interface FileExplorerProps {
  files: WebsiteFile[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
}

function fileLabel(path: string): string {
  const name = path.split("/").pop() ?? path;
  return name;
}

export default function FileExplorer({
  files,
  selectedPath,
  onSelect,
}: FileExplorerProps) {
  if (files.length === 0) {
    return (
      <p className="px-4 py-6 text-sm text-stone-500">
        Generated files will appear here.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-1 p-2">
      {files.map((file) => {
        const selected = file.path === selectedPath;

        return (
          <li key={file.path}>
            <button
              type="button"
              onClick={() => onSelect(file.path)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition ${
                selected
                  ? "bg-teal-800 text-white"
                  : "text-stone-700 hover:bg-stone-100"
              }`}
            >
              <span
                className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md font-mono text-[10px] font-semibold ${
                  selected
                    ? "bg-white/15 text-white"
                    : "bg-stone-200 text-stone-600"
                }`}
              >
                {fileLabel(file.path).split(".").pop()?.slice(0, 4)}
              </span>
              <span className="truncate font-medium">{file.path}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
