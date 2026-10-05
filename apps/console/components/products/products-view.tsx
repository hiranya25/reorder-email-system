"use client";

import { formatNumber, productCheck, type ProductCheckRow, type ProductProblem } from "@reorder/core";
import { Check, Search } from "lucide-react";
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
import { CatalogImport } from "./catalog-import";
import { ProductPicker, ProductThumb } from "./product-picker";

type Filter = "all" | "shown" | ProductProblem;

const PROBLEM: Record<ProductProblem, { label: string; tone: Tone }> = {
  no_name: { label: "No name", tone: "bad" },
  out_of_stock: { label: "Out of stock", tone: "bad" },
  not_in_catalog: { label: "Not in catalog", tone: "warn" },
  no_image: { label: "No image", tone: "warn" },
  replaced: { label: "Replaced", tone: "ok" },
  hidden: { label: "Hidden", tone: "neutral" },
};
const FILTER_ORDER: ProductProblem[] = ["no_name", "out_of_stock", "not_in_catalog", "no_image", "replaced", "hidden"];
const PAGE = 50;

export function ProductsView() {
  const data = useCurrentCampaign();
  const { campaign, importRecord, catalog, catalogUploaded, edits, editScope, productsConfirmed, products } = data;
  const catalogRecord = useConsoleStore((s) => s.catalog);
  const setHidden = useConsoleStore((s) => s.setHidden);
  const setSuccessor = useConsoleStore((s) => s.setSuccessor);
  const setDisplayName = useConsoleStore((s) => s.setDisplayName);
  const confirmProducts = useConsoleStore((s) => s.confirmProducts);
  const confirmedInfo = useConsoleStore((s) => s.productsConfirmed[campaign.id]);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [replacing, setReplacing] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [rename, setRename] = useState<{ row: ProductCheckRow; value: string }>();
  const [replaceFor, setReplaceFor] = useState<ProductCheckRow>();
  const filter = (params.get("filter") as Filter | null) ?? "all";
  const setFilter = (f: Filter) => {
    setPage(0);
    router.replace(f === "all" ? pathname : `${pathname}?filter=${f}`, { scroll: false });
  };

  const rows = useMemo(
    () => (importRecord && catalogUploaded ? productCheck(importRecord.result.customers, catalog, edits, 3) : []),
    [importRecord, catalog, edits, catalogUploaded],
  );
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length, shown: rows.filter((r) => r.shownTo > 0).length };
    for (const p of FILTER_ORDER) c[p] = rows.filter((r) => r.problems.includes(p)).length;
    return c;
  }, [rows]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (filter === "all" || (filter === "shown" ? r.shownTo > 0 : r.problems.includes(filter))) &&
        (!q || r.sku.toLowerCase().includes(q) || r.name.toLowerCase().includes(q) || r.salesName.toLowerCase().includes(q)),
    );
  }, [rows, filter, query]);
  const pageRows = visible.slice(page * PAGE, page * PAGE + PAGE);
  const pages = Math.ceil(visible.length / PAGE);
  const blocking = counts.no_name ?? 0;

  const crumbs = [{ label: campaign.name, href: `/campaigns/${campaign.id}/overview` }, { label: "Step 3" }];
  const header = (
    <PageHeader
      crumbs={crumbs}
      title="Product check"
      subtitle="Stop discontinued or undescribed products from reaching emails."
      actions={
        catalogUploaded &&
        !replacing && (
          <>
            {!campaign.isDemo && (
              <Button variant="secondary" size="lg" onClick={() => setReplacing(true)}>
                Replace catalog
              </Button>
            )}
            {productsConfirmed ? (
              <Button variant="secondary" size="lg" onClick={() => confirmProducts(campaign.id, false)} title="Undo confirmation">
                <Check size={16} className="text-ok-fg" /> Checked
              </Button>
            ) : (
              <Button size="lg" disabled={blocking > 0} title={blocking ? "Name or hide the products with no name first" : undefined} onClick={() => confirmProducts(campaign.id, true)}>
                Confirm product check
              </Button>
            )}
          </>
        )
      }
    />
  );

  if (!importRecord) {
    return (
      <>
        {header}
        <Card className="max-w-xl">
          <p className="font-semibold">Import sales data first</p>
          <ButtonLink href={`/campaigns/${campaign.id}/import`} className="mt-4">
            Import sales data
          </ButtonLink>
        </Card>
      </>
    );
  }

  if (!catalogUploaded || replacing) {
    return (
      <>
        {header}
        <CatalogImport onDone={() => setReplacing(false)} onCancel={replacing ? () => setReplacing(false) : undefined} />
      </>
    );
  }

  const pills: [Filter, string][] = [
    ["all", "All purchased"],
    ["shown", "Shown in emails"],
    ...FILTER_ORDER.filter((p) => counts[p]).map((p) => [p, PROBLEM[p].label] as [Filter, string]),
  ];

  return (
    <>
      {header}

      <Card className="mb-5 flex flex-wrap items-center gap-x-6 gap-y-2 py-4 text-[13px]">
        <span>
          Catalog: <span className="font-mono">{campaign.isDemo ? "sample catalog" : catalogRecord?.fileName}</span> · {formatNumber(products.length)} products
        </span>
        {productsConfirmed && confirmedInfo && (
          <span className="text-ok-fg">
            Checked by {confirmedInfo.by} on {new Date(confirmedInfo.at).toLocaleDateString()}
          </span>
        )}
        {blocking > 0 && <span className="text-bad-fg">{formatNumber(blocking)} product{blocking === 1 ? " has" : "s have"} no name: rename or hide before confirming.</span>}
      </Card>

      <div className="rounded-xl border border-line bg-white">
        <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {pills.map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={filter === key}
                onClick={() => setFilter(key)}
                className={cn("h-9 rounded-lg border px-3 text-[13px] font-semibold", filter === key ? "border-navy bg-navy text-white" : "border-line bg-white hover:bg-canvas")}
              >
                {label} <span className={filter === key ? "text-white/70" : "text-ink-muted"}>{formatNumber(counts[key] ?? 0)}</span>
              </button>
            ))}
          </div>
          <span className="relative">
            <Search size={15} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-muted" />
            <Input className="h-9 w-60 pl-8" placeholder="Search name or SKU" value={query} onChange={(e) => (setQuery(e.target.value), setPage(0))} aria-label="Search products" />
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-[13px]">
            <thead className="border-b border-line bg-canvas/60 text-[11px] font-semibold tracking-wide text-ink-muted uppercase">
              <tr>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Customers</th>
                <th className="px-4 py-3" title="Customers whose top 3 includes this product">Shown to</th>
                <th className="px-4 py-3">Units</th>
                <th className="px-4 py-3">Check</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {pageRows.map((r) => {
                const isHidden = r.problems.includes("hidden");
                const shownProduct = catalog.get(r.replacement ?? r.sku);
                return (
                  <tr key={r.sku} className={cn(isHidden && "text-ink-muted")}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <ProductThumb product={shownProduct} />
                        <div className="min-w-0">
                          <div className="font-semibold">{r.name || <span className="text-bad-fg">No name</span>}</div>
                          <div className="font-mono text-[11px] text-ink-muted">
                            {r.sku}
                            {r.replacement && <> → {r.replacement}</>}
                          </div>
                          {r.salesName && r.product?.name && r.product.name.toUpperCase() !== r.salesName.toUpperCase() && (
                            <div className="text-[11px] text-ink-muted">Sales file: {r.salesName}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 tabular-nums">{formatNumber(r.customers)}</td>
                    <td className="px-4 py-3 tabular-nums">{formatNumber(r.shownTo)}</td>
                    <td className="px-4 py-3 tabular-nums">{formatNumber(r.units)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {r.problems.length === 0 ? (
                          <StatusChip tone="ok">OK</StatusChip>
                        ) : (
                          r.problems.map((p) => (
                            <StatusChip key={p} tone={PROBLEM[p].tone}>
                              {PROBLEM[p].label}
                            </StatusChip>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] font-semibold">
                        <button type="button" className="underline underline-offset-2" onClick={() => setRename({ row: r, value: edits.displayName[r.sku] ?? r.name })}>
                          Rename
                        </button>
                        <button type="button" className="underline underline-offset-2" onClick={() => setReplaceFor(r)}>
                          {edits.successor[r.sku] ? "Change replacement" : "Replace"}
                        </button>
                        <button type="button" className="underline underline-offset-2" onClick={() => setHidden(campaign.id, r.sku, !isHidden)}>
                          {isHidden ? "Unhide" : "Hide"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {pageRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-ink-muted">
                    No products match.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-3 text-[12px] text-ink-muted">
          <span>
            Showing {formatNumber(pageRows.length)} of {formatNumber(visible.length)} products
          </span>
          {pages > 1 && (
            <span className="flex items-center gap-1">
              <Button size="sm" variant="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>
                Previous
              </Button>
              <span className="px-1">
                Page {page + 1} of {pages}
              </span>
              <Button size="sm" variant="secondary" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>
                Next
              </Button>
            </span>
          )}
          <span>Renames and replacements are remembered for next season. Hiding applies to this campaign only.</span>
        </div>
      </div>

      <Modal open={!!rename} onClose={() => setRename(undefined)} title="Name shown in the email">
        {rename && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setDisplayName(editScope, rename.row.sku, rename.value);
              setRename(undefined);
            }}
            className="space-y-4"
          >
            <p className="font-mono text-[12px] text-ink-muted">{rename.row.sku}</p>
            <Input value={rename.value} onChange={(e) => setRename({ ...rename, value: e.target.value })} autoFocus maxLength={120} aria-label="Product name" />
            <p className="text-xs text-ink-muted">Leave empty to use the catalog or sales-file name again.</p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setRename(undefined)}>
                Cancel
              </Button>
              <Button type="submit">Save name</Button>
            </div>
          </form>
        )}
      </Modal>

      <ProductPicker
        key={replaceFor?.sku}
        open={!!replaceFor}
        title={replaceFor ? `Replacement for ${replaceFor.sku}` : ""}
        products={products}
        exclude={replaceFor ? [replaceFor.sku] : []}
        onClose={() => setReplaceFor(undefined)}
        onPick={(p) => {
          if (replaceFor) setSuccessor(editScope, replaceFor.sku, p.sku);
          setReplaceFor(undefined);
        }}
        footer={
          replaceFor &&
          edits.successor[replaceFor.sku] && (
            <Button
              variant="secondary"
              onClick={() => {
                setSuccessor(editScope, replaceFor.sku, undefined);
                setReplaceFor(undefined);
              }}
            >
              Remove replacement ({edits.successor[replaceFor.sku]})
            </Button>
          )
        }
      />
    </>
  );
}
