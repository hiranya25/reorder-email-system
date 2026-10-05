import { formatNumber } from "@reorder/core";
import { cn } from "@/lib/utils";
import type { Tone } from "../ui/status-chip";

const LABEL_TONE: Record<Tone, string> = {
  neutral: "text-ink-muted",
  ok: "text-ok-fg font-medium",
  warn: "text-warn-fg font-medium",
  bad: "text-bad-fg font-medium",
};

export function StatCard({ label, value, caption, tone = "neutral" }: { label: string; value: number; caption: string; tone?: Tone }) {
  return (
    <div className="rounded-xl border border-line bg-white p-5">
      <div className={cn("text-[13px]", LABEL_TONE[tone])}>{label}</div>
      <div className="mt-1.5 text-[32px] leading-none font-bold tracking-tight">{formatNumber(value)}</div>
      <div className="mt-2.5 text-[13px] text-ink-muted">{caption}</div>
    </div>
  );
}
