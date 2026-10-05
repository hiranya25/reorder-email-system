import type { Issue, IssueSeverity } from "@reorder/core";
import Link from "next/link";
import { ButtonLink, Button } from "../ui/button";
import { Card, CardHeader } from "../ui/card";
import { StatusChip, type Tone } from "../ui/status-chip";

const SEVERITY: Record<IssueSeverity, { tone: Tone; label: string; order: number }> = {
  blocker: { tone: "bad", label: "Blocker", order: 0 },
  review: { tone: "warn", label: "Review", order: 1 },
  auto_fixed: { tone: "ok", label: "Auto-fixed", order: 2 },
};

export function IssueList({ issues, basePath }: { issues: Issue[]; basePath: string }) {
  const sorted = [...issues].sort((a, b) => SEVERITY[a.severity].order - SEVERITY[b.severity].order);
  const blockers = issues.filter((i) => i.severity === "blocker").length;
  const reviews = issues.filter((i) => i.severity === "review").length;

  return (
    <Card>
      <CardHeader
        title="Issues to resolve before sending"
        aside={`${blockers} blocker${blockers === 1 ? "" : "s"} · ${reviews} to review`}
      />
      {sorted.length === 0 ? (
        <p className="border-t border-line pt-4 text-sm text-ink-muted">No issues found.</p>
      ) : (
        <ul className="divide-y divide-line border-t border-line">
          {sorted.map((issue) => {
            const sev = SEVERITY[issue.severity];
            const href = issue.action?.href ? `${basePath}/${issue.action.href}` : undefined;
            return (
              <li key={issue.id} className="flex flex-col gap-2 py-3.5 sm:flex-row sm:items-center sm:gap-3">
                <StatusChip tone={sev.tone} className="w-[102px] justify-center py-1.5 text-[12px]">
                  {sev.label}
                </StatusChip>
                <p className="flex-1 text-[14px]">{issue.message}</p>
                {issue.action &&
                  (issue.action.kind === "link" && href ? (
                    <Link href={href} className="text-[14px] font-semibold underline underline-offset-4">
                      {issue.action.label}
                    </Link>
                  ) : href ? (
                    <ButtonLink href={href} variant="secondary">
                      {issue.action.label}
                    </ButtonLink>
                  ) : (
                    <Button variant="secondary" disabled title="Available once the import is wired up (phase F2)">
                      {issue.action.label}
                    </Button>
                  ))}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
