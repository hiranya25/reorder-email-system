"use client";

import { formatNumber, reportRowsToCsv, type CampaignSummary, type ReportItem, type ValidationReport } from "@reorder/core";
import { Download } from "lucide-react";
import { downloadCsv } from "@/lib/download";
import { StatusChip, type Tone } from "../ui/status-chip";

export function ReportItemRow({ item, tone, label }: { item: ReportItem; tone: Tone; label: string }) {
  return (
    <li className="flex gap-3 py-3">
      <StatusChip tone={tone} className="h-fit w-[92px] shrink-0 justify-center">
        {label}
      </StatusChip>
      <div className="min-w-0 flex-1 text-[13px]">
        <p>{item.message}</p>
        {item.rows && item.rows.length > 0 && (
          <button
            type="button"
            className="mt-1 inline-flex items-center gap-1 font-semibold underline underline-offset-4"
            onClick={() => downloadCsv(`${item.id.replace(/_/g, "-")}-rows.csv`, reportRowsToCsv(item.rows!))}
          >
            <Download size={13} /> Download {item.rows.length === 1 ? "row" : `${formatNumber(item.rows.length)} rows`}
          </button>
        )}
      </div>
    </li>
  );
}

export function ReportPanel({ report, summary }: { report: ValidationReport; summary: CampaignSummary }) {
  const blocked = report.errors.length > 0;
  return (
    <div>
      {!blocked && (
        <dl className="grid grid-cols-2 gap-3 pb-4">
          {[
            ["Sales lines", summary.lines],
            ["Customers", summary.customers],
            ["Ready to email", summary.ready],
            ["Need review / no email", summary.review + summary.noEmail],
          ].map(([label, value]) => (
            <div key={label as string} className="rounded-lg bg-canvas px-3 py-2.5">
              <dt className="text-[12px] text-ink-muted">{label}</dt>
              <dd className="text-[20px] font-bold tracking-tight">{formatNumber(value as number)}</dd>
            </div>
          ))}
        </dl>
      )}
      <ul className="divide-y divide-line border-t border-line">
        {report.errors.map((e) => (
          <ReportItemRow key={e.id} item={e} tone="bad" label="Error" />
        ))}
        {report.warnings.map((w) => (
          <ReportItemRow key={w.id} item={w} tone="warn" label="Warning" />
        ))}
        {report.autoFixes.map((f) => (
          <ReportItemRow key={f.id} item={f} tone="ok" label="Auto-fixed" />
        ))}
        {!blocked && report.warnings.length === 0 && report.autoFixes.length === 0 && (
          <li className="py-3 text-[13px] text-ok-fg">No problems found.</li>
        )}
      </ul>
    </div>
  );
}
