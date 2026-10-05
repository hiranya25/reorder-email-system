"use client";

import {
  checkReason,
  FILTER_LABELS,
  formatNumber,
  mappingCounts,
  matchesFilter,
  type EmailCheck,
  type MappingFilter,
  type MappingRow,
} from "@reorder/core";
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useConsoleStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { useCurrentCampaign } from "../console/campaign-shell";
import { PageHeader } from "../console/page-header";
import { Button, ButtonLink } from "../ui/button";
import { Card } from "../ui/card";
import { Input } from "../ui/field";
import { Modal } from "../ui/modal";
import { StatusChip, type Tone } from "../ui/status-chip";
import { DecisionCell, type DecisionHandlers } from "./decision-cell";
import { EmailModal, type EmailModalTarget } from "./email-modal";

type Tab = "all" | EmailCheck;
type DecidedFilter = "any" | "pending" | "approved" | "excluded";

const CHECK_CHIP: Record<EmailCheck, { tone: Tone; label: string }> = {
  ready: { tone: "ok", label: "Ready" },
  review: { tone: "warn", label: "Review" },
  no_email: { tone: "bad", label: "No email" },
};

const FILTERS = Object.keys(FILTER_LABELS) as MappingFilter[];
const PAGE_SIZE = 50;

export function MappingView() {
  const { campaign, mapping } = useCurrentCampaign();
  const rules = useConsoleStore((s) => s.rules);
  const decide = useConsoleStore((s) => s.decide);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const issueFilter = FILTERS.find((f) => f === params.get("filter"));

  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");
  const [rep, setRep] = useState("");
  const [decided, setDecided] = useState<DecidedFilter>("any");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [selection, setSelection] = useState<RowSelectionState>({});
  const [emailTarget, setEmailTarget] = useState<EmailModalTarget>();
  const [confirmAll, setConfirmAll] = useState(false);

  const counts = useMemo(() => mappingCounts(mapping), [mapping]);
  const reps = useMemo(() => [...new Set(mapping.map((r) => r.customer.rep).filter(Boolean))].sort(), [mapping]);
  const pendingReady = mapping.filter((r) => r.status === "pending" && r.customer.check === "ready");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return mapping.filter((r) => {
      const c = r.customer;
      if (tab !== "all" && c.check !== tab) return false;
      if (issueFilter && !matchesFilter(c, issueFilter)) return false;
      if (rep && c.rep !== rep) return false;
      if (decided !== "any" && r.status !== decided) return false;
      if (q && !(c.name.toLowerCase().includes(q) || c.accountId.toLowerCase().includes(q) || c.emails.some((e) => e.includes(q)) || r.emails.some((e) => e.includes(q)))) return false;
      return true;
    });
  }, [mapping, tab, issueFilter, rep, decided, query]);

  const setStatus = (accountIds: string[], status: "approved" | "excluded" | "undecided", emails?: string[]) => {
    const byId = new Map(mapping.map((r) => [r.customer.accountId, r]));
    decide(campaign.id, accountIds, status, (id) => emails ?? byId.get(id)?.customer.emails ?? []);
  };

  const handlers: DecisionHandlers = {
    approve: (r) => setStatus([r.customer.accountId], "approved"),
    exclude: (r) => setStatus([r.customer.accountId], "excluded"),
    undo: (r) => setStatus([r.customer.accountId], "undecided"),
    editEmails: (r) => {
      const candidates = [...new Set([...r.customer.emails, ...r.emails])];
      setEmailTarget({
        accountId: r.customer.accountId,
        name: r.customer.name,
        candidates,
        selected: r.status === "approved" ? r.emails : r.customer.emails,
      });
    },
  };

  const columns = useMemo<ColumnDef<MappingRow>[]>(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <input
            type="checkbox"
            aria-label="Select all on this page"
            className="size-4 accent-navy"
            checked={table.getIsAllPageRowsSelected()}
            ref={(el) => {
              if (el) el.indeterminate = table.getIsSomePageRowsSelected();
            }}
            onChange={table.getToggleAllPageRowsSelectedHandler()}
          />
        ),
        cell: ({ row }) => (
          <input type="checkbox" aria-label={`Select ${row.original.customer.name}`} className="size-4 accent-navy" checked={row.getIsSelected()} onChange={row.getToggleSelectedHandler()} />
        ),
        enableSorting: false,
      },
      { id: "acct", header: "Acct", accessorFn: (r) => r.customer.accountId, cell: (i) => <span className="font-mono text-[12px] text-ink-muted">{i.getValue<string>()}</span> },
      { id: "customer", header: "Customer", accessorFn: (r) => r.customer.name, cell: (i) => <span className="font-semibold">{i.getValue<string>()}</span> },
      {
        id: "email",
        header: "Email from sales data",
        accessorFn: (r) => r.customer.emails.join("; "),
        cell: (i) => <span className="font-mono text-[12px] break-all">{i.getValue<string>() || "—"}</span>,
        enableSorting: false,
      },
      { id: "products", header: "Products", accessorFn: (r) => r.customer.items.length, cell: (i) => <span className="tabular-nums">{i.getValue<number>()}</span> },
      { id: "rep", header: "Rep", accessorFn: (r) => r.customer.rep, cell: (i) => <span className="text-[12px] text-ink-muted">{i.getValue<string>()}</span> },
      {
        id: "check",
        header: "Check",
        accessorFn: (r) => r.customer.check,
        sortingFn: (a, b) => ["ready", "review", "no_email"].indexOf(a.original.customer.check) - ["ready", "review", "no_email"].indexOf(b.original.customer.check),
        cell: ({ row }) => {
          const chip = CHECK_CHIP[row.original.customer.check];
          return (
            <div>
              <StatusChip tone={chip.tone}>{chip.label}</StatusChip>
              <div className="mt-1 text-[12px] text-ink-muted">{checkReason(row.original.customer, rules.genericLocalParts)}</div>
            </div>
          );
        },
      },
      { id: "decision", header: "Decision", cell: ({ row }) => <DecisionCell row={row.original} on={handlers} />, enableSorting: false },
    ],
    // handlers close over the latest mapping via setStatus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mapping, rules.genericLocalParts],
  );

  // TanStack's table instance is mutable by design; React Compiler skips this component.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, rowSelection: selection },
    onSortingChange: setSorting,
    onRowSelectionChange: setSelection,
    getRowId: (r) => r.customer.accountId,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: PAGE_SIZE } },
    autoResetPageIndex: true,
  });

  const selectedIds = Object.keys(selection).filter((id) => selection[id]);
  const selectedWithEmail = selectedIds.filter((id) => (mapping.find((r) => r.customer.accountId === id)?.customer.emails.length ?? 0) > 0);
  const clearIssueFilter = () => router.replace(pathname);
  const reviewed = counts.approved + counts.excluded;

  if (mapping.length === 0) {
    return (
      <>
        <PageHeader crumbs={[{ label: campaign.name, href: `/campaigns/${campaign.id}/overview` }, { label: "Step 2" }]} title="Customer mapping" />
        <Card className="max-w-xl">
          <p className="font-semibold">Import sales data first</p>
          <p className="mt-1 text-sm text-ink-muted">Customers appear here once last season&apos;s export is imported.</p>
          <ButtonLink href={`/campaigns/${campaign.id}/import`} className="mt-4">
            Import sales data
          </ButtonLink>
        </Card>
      </>
    );
  }

  const tabs: [Tab, string, number][] = [
    ["all", "All", counts.total],
    ["ready", "Ready", counts.byCheck.ready],
    ["review", "Needs review", counts.byCheck.review],
    ["no_email", "No email", counts.byCheck.no_email],
  ];

  return (
    <>
      <PageHeader
        crumbs={[{ label: campaign.name, href: `/campaigns/${campaign.id}/overview` }, { label: "Step 2" }]}
        title="Customer mapping"
        subtitle={<span className="block max-w-xl">Confirm which email receives each customer&apos;s reorder email. Nothing is sent until every account is approved or excluded.</span>}
        actions={
          <Button size="lg" disabled={pendingReady.length === 0} onClick={() => setConfirmAll(true)}>
            Approve all ready
          </Button>
        }
      />

      <Card className="mb-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2 text-[14px]">
          <span className="font-semibold">
            Reviewed {formatNumber(reviewed)} of {formatNumber(counts.total)} accounts
          </span>
          <span className="text-[12px] text-ink-muted">
            {formatNumber(counts.approved)} approved · {formatNumber(counts.excluded)} excluded · {formatNumber(counts.pending)} to go
          </span>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-track" role="progressbar" aria-valuemin={0} aria-valuemax={counts.total} aria-valuenow={reviewed}>
          <div className="h-full rounded-full bg-navy transition-[width]" style={{ width: `${(reviewed / Math.max(1, counts.total)) * 100}%` }} />
        </div>
      </Card>

      <div className="rounded-xl border border-line bg-white">
        <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter by check">
            {tabs.map(([key, label, n]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={cn(
                  "h-9 rounded-lg border px-3 text-[13px] font-semibold",
                  tab === key ? "border-navy bg-navy text-white" : "border-line bg-white hover:bg-canvas",
                )}
              >
                {label} <span className={tab === key ? "text-white/70" : "text-ink-muted"}>{formatNumber(n)}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="block">
              <span className="mb-1 block text-[11px] text-ink-muted">Search</span>
              <span className="relative block">
                <Search size={15} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-muted" />
                <Input className="h-9 w-56 pl-8" placeholder="Customer, account or email" value={query} onChange={(e) => setQuery(e.target.value)} />
              </span>
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] text-ink-muted">Sales rep</span>
              <select className="h-9 rounded-lg border border-line bg-white px-2.5 text-sm" value={rep} onChange={(e) => setRep(e.target.value)}>
                <option value="">All reps</option>
                {reps.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] text-ink-muted">Decision</span>
              <select className="h-9 rounded-lg border border-line bg-white px-2.5 text-sm" value={decided} onChange={(e) => setDecided(e.target.value as DecidedFilter)}>
                <option value="any">Any</option>
                <option value="pending">Not decided</option>
                <option value="approved">Approved</option>
                <option value="excluded">Excluded</option>
              </select>
            </label>
          </div>
        </div>

        {(issueFilter || selectedIds.length > 0) && (
          <div className="flex flex-wrap items-center gap-3 border-b border-line bg-canvas/60 px-4 py-2.5 text-[13px]">
            {issueFilter && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white py-1 pr-1.5 pl-3">
                Showing: {FILTER_LABELS[issueFilter]}
                <button type="button" aria-label="Clear filter" onClick={clearIssueFilter} className="rounded-full p-0.5 hover:bg-canvas">
                  <X size={13} />
                </button>
              </span>
            )}
            {selectedIds.length > 0 && (
              <>
                <span className="font-semibold">{formatNumber(selectedIds.length)} selected</span>
                <Button
                  size="sm"
                  disabled={selectedWithEmail.length === 0}
                  title={selectedWithEmail.length < selectedIds.length ? "Accounts without an email need one added first" : undefined}
                  onClick={() => {
                    setStatus(selectedWithEmail, "approved");
                    setSelection({});
                  }}
                >
                  Approve {selectedWithEmail.length < selectedIds.length ? `${formatNumber(selectedWithEmail.length)} with email` : ""}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setStatus(selectedIds, "excluded");
                    setSelection({});
                  }}
                >
                  Exclude
                </Button>
                <button type="button" className="text-ink-muted underline underline-offset-2" onClick={() => setSelection({})}>
                  Clear selection
                </button>
              </>
            )}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-[13px]">
            <thead className="border-b border-line bg-canvas/60 text-[11px] font-semibold tracking-wide text-ink-muted uppercase">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((h) => {
                    const sorted = h.column.getIsSorted();
                    return (
                      <th key={h.id} className={cn("px-4 py-3", h.id === "select" && "w-10")} aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}>
                        {h.column.getCanSort() ? (
                          <button type="button" className="inline-flex items-center gap-1 uppercase hover:text-ink" onClick={h.column.getToggleSortingHandler()}>
                            {flexRender(h.column.columnDef.header, h.getContext())}
                            {sorted === "asc" ? <ArrowUp size={12} /> : sorted === "desc" ? <ArrowDown size={12} /> : null}
                          </button>
                        ) : (
                          flexRender(h.column.columnDef.header, h.getContext())
                        )}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-line">
              {table.getRowModel().rows.map((row) => (
                <tr key={row.id} className={cn(row.getIsSelected() && "bg-navy/[0.03]", row.original.status === "excluded" && "text-ink-muted")}>
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3 align-middle">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-10 text-center text-ink-muted">
                    No accounts match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-2 border-t border-line px-4 py-3 text-[12px] text-ink-muted sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span>
              Showing {formatNumber(table.getRowModel().rows.length)} of {formatNumber(rows.length)} accounts
              {rows.length !== counts.total && ` (filtered from ${formatNumber(counts.total)})`}
            </span>
            {table.getPageCount() > 1 && (
              <span className="flex items-center gap-1">
                <Button size="sm" variant="secondary" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>
                  Previous
                </Button>
                <span className="px-1">
                  Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
                </span>
                <Button size="sm" variant="secondary" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>
                  Next
                </Button>
              </span>
            )}
          </div>
          <span>Approved emails are saved, so next season these customers match automatically.</span>
        </div>
      </div>

      <EmailModal
        target={emailTarget}
        onClose={() => setEmailTarget(undefined)}
        onSave={(emails) => {
          if (emailTarget) setStatus([emailTarget.accountId], "approved", emails);
          setEmailTarget(undefined);
        }}
      />

      <Modal open={confirmAll} onClose={() => setConfirmAll(false)} title="Approve all ready accounts?">
        <p className="text-[14px]">
          This approves <strong>{formatNumber(pendingReady.length)}</strong> accounts that have one clear email on file. Accounts that need review or have no email stay as they are. You can undo any of them afterwards.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirmAll(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              setStatus(pendingReady.map((r) => r.customer.accountId), "approved");
              setConfirmAll(false);
            }}
          >
            Approve {formatNumber(pendingReady.length)}
          </Button>
        </div>
      </Modal>
    </>
  );
}
