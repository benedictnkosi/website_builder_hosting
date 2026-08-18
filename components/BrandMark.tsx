export default function BrandMark({
  compact = false,
}: {
  compact?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-2.5" aria-label="Lulaweb">
      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-teal-800 text-white shadow-sm">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <rect x="4" y="5" width="16" height="14" rx="2.5" />
          <path d="M4 9h16" />
          <path d="M8 13h4" />
        </svg>
      </span>
      {compact ? null : (
        <span className="text-sm font-semibold tracking-tight text-stone-900">
          Lulaweb
        </span>
      )}
    </span>
  );
}
