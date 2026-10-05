"use client";

import type { MappingRow } from "@reorder/core";
import { Button } from "../ui/button";
import { StatusChip } from "../ui/status-chip";

export interface DecisionHandlers {
  approve: (row: MappingRow) => void;
  exclude: (row: MappingRow) => void;
  undo: (row: MappingRow) => void;
  editEmails: (row: MappingRow) => void;
}

function sameEmails(a: string[], b: string[]) {
  return a.length === b.length && a.every((e) => b.includes(e));
}

export function DecisionCell({ row, on }: { row: MappingRow; on: DecisionHandlers }) {
  const c = row.customer;

  if (row.status === "approved") {
    const changed = !sameEmails(row.emails, c.emails);
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <StatusChip tone="ok">Approved</StatusChip>
          <button type="button" className="text-xs font-semibold underline underline-offset-2" onClick={() => on.editEmails(row)}>
            Change
          </button>
          <button type="button" className="text-xs text-ink-muted underline underline-offset-2" onClick={() => on.undo(row)}>
            Undo
          </button>
        </div>
        {(changed || row.source === "remembered") && (
          <div className="text-[11px] text-ink-muted">
            {row.source === "remembered" ? "Approved last season" : "Sending to"}
            {changed && <span className="block font-mono">{row.emails.join(", ")}</span>}
          </div>
        )}
      </div>
    );
  }

  if (row.status === "excluded") {
    return (
      <div className="flex items-center gap-2">
        <StatusChip tone="neutral">Excluded</StatusChip>
        <button type="button" className="text-xs text-ink-muted underline underline-offset-2" onClick={() => on.undo(row)}>
          Undo
        </button>
      </div>
    );
  }

  if (c.check === "no_email") {
    return (
      <div className="flex gap-2">
        <Button size="sm" onClick={() => on.editEmails(row)}>
          Add email
        </Button>
        <Button size="sm" variant="secondary" onClick={() => on.exclude(row)}>
          Exclude
        </Button>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <Button size="sm" onClick={() => (c.emails.length > 1 ? on.editEmails(row) : on.approve(row))}>
        Approve
      </Button>
      {c.check === "review" && (
        <Button size="sm" variant="secondary" onClick={() => on.exclude(row)}>
          Exclude
        </Button>
      )}
    </div>
  );
}
