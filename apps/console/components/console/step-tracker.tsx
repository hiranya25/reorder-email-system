import { currentStepNumber, type StepState, type StepStatus } from "@reorder/core";
import { cn } from "@/lib/utils";
import { Card, CardHeader } from "../ui/card";

const TILE: Record<StepState, { box: string; tag: string; detail: string; word?: string }> = {
  done: { box: "bg-ok-bg", tag: "text-ok-fg", detail: "text-ink/70", word: "DONE" },
  in_progress: { box: "bg-navy text-white", tag: "text-gold-soft", detail: "text-white/80", word: "IN PROGRESS" },
  blocked: { box: "bg-bad-bg", tag: "text-bad-fg", detail: "text-ink/70", word: "BLOCKED" },
  not_started: { box: "bg-canvas", tag: "text-ink-muted", detail: "text-ink-muted" },
};

export function StepTracker({ steps, sent = false }: { steps: StepStatus[]; sent?: boolean }) {
  const current = currentStepNumber(steps);
  return (
    <Card>
      <CardHeader
        title="Campaign progress"
        aside={`Step ${current} of ${steps.length} · ${sent ? "sent" : "nothing has been sent"}`}
      />
      <ol className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 xl:grid-cols-8">
        {steps.map((step, i) => {
          const t = TILE[step.state];
          return (
            <li key={step.key} className={cn("min-h-[112px] rounded-lg p-3", t.box)}>
              <div className={cn("text-[12px] font-semibold", t.tag)}>
                {i + 1}
                {t.word && ` · ${t.word}`}
              </div>
              <div className="mt-1.5 text-[14px] leading-snug font-semibold">{step.label}</div>
              <div className={cn("mt-1 text-[13px]", t.detail)}>{step.detail}</div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
