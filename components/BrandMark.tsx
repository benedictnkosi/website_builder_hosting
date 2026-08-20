import Image from "next/image";

export default function BrandMark({
  compact = false,
}: {
  compact?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-2.5" aria-label="Lulaweb">
      <Image
        src="/logo.png"
        alt=""
        width={32}
        height={32}
        className="h-8 w-8"
        priority
      />
      {compact ? null : (
        <span className="text-sm font-semibold tracking-tight text-stone-900">
          Lulaweb
        </span>
      )}
    </span>
  );
}
