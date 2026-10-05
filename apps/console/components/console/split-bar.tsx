import { cn } from "@/lib/utils";

export interface Segment {
  label: string;
  value: number;
  className: string;
}

/** One stacked bar with inline labels; segment width is its share of the total. */
export function SplitBar({ segments, label }: { segments: Segment[]; label: string }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0) || 1;
  return (
    <div className="flex h-9 overflow-hidden rounded-md text-[12px] font-semibold" role="img" aria-label={label}>
      {segments.map((s) => (
        <div
          key={s.label}
          className={cn("flex min-w-0 items-center px-2.5 whitespace-nowrap", s.className)}
          style={{ width: `${(s.value / total) * 100}%` }}
          title={s.label}
        >
          <span className="truncate">{s.label}</span>
        </div>
      ))}
    </div>
  );
}
