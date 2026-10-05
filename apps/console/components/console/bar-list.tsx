import { formatNumber } from "@reorder/core";

/** Horizontal bars scaled to the largest value, label left and count right. */
export function BarList({ items }: { items: { label: string; value: number }[] }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.label} className="grid grid-cols-[100px_1fr_40px] items-center gap-3 text-[14px]">
          <span className="truncate">{item.label}</span>
          <span className="h-2 rounded-full bg-track" aria-hidden>
            <span className="block h-2 rounded-full bg-navy" style={{ width: `${(item.value / max) * 100}%` }} />
          </span>
          <span className="text-right font-semibold tabular-nums">{formatNumber(item.value)}</span>
        </li>
      ))}
    </ul>
  );
}
