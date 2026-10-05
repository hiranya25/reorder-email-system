"use client";

import {
  CATALOG_FIELDS,
  catalogTemplateCsv,
  cellText,
  detectHeaderRow,
  formatNumber,
  fromNamedMapping,
  headerSignature,
  missingRequiredFields,
  processCatalog,
  suggestMapping,
  toNamedMapping,
  type CatalogFieldKey,
  type ColumnMapping,
} from "@reorder/core";
import { Download, FileSpreadsheet } from "lucide-react";
import { useMemo, useState } from "react";
import { downloadCsv } from "@/lib/download";
import { FileReadError, readSalesFile, type LoadedSheet } from "@/lib/read-file";
import { useConsoleStore } from "@/lib/store";
import { useCurrentCampaign } from "../console/campaign-shell";
import { ColumnMapper } from "../import/column-mapper";
import { Dropzone } from "../import/dropzone";
import { ReportItemRow } from "../import/report-panel";
import { Button } from "../ui/button";
import { Card, CardHeader } from "../ui/card";

interface Loaded {
  fileName: string;
  sheet: LoadedSheet;
  headerRow: number;
  mapping: ColumnMapping<CatalogFieldKey>;
}

/** Upload, match columns and check the product catalog. Shared by all campaigns. */
export function CatalogImport({ onDone, onCancel }: { onDone: () => void; onCancel?: () => void }) {
  const { campaign, importRecord } = useCurrentCampaign();
  const saveCatalog = useConsoleStore((s) => s.saveCatalog);
  const loadDemoCatalog = useConsoleStore((s) => s.loadDemoCatalog);
  const savedMappings = useConsoleStore((s) => s.savedMappings);
  const [loaded, setLoaded] = useState<Loaded>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const headers = useMemo(() => (loaded ? (loaded.sheet.rows[loaded.headerRow] ?? []).map(cellText) : []), [loaded]);
  const result = useMemo(() => (loaded ? processCatalog(loaded.sheet.rows, loaded.headerRow, loaded.mapping) : undefined), [loaded]);
  const purchasedSkus = useMemo(() => new Set(importRecord?.result.customers.flatMap((c) => c.items.map((i) => i.sku)) ?? []), [importRecord]);
  const matched = result ? result.products.filter((p) => purchasedSkus.has(p.sku)).length : 0;

  const onFile = async (file: File) => {
    setBusy(true);
    setError(undefined);
    try {
      const sheets = await readSalesFile(file);
      const sheet = sheets.reduce((a, b) => (b.rows.length > a.rows.length ? b : a));
      const headerRow = detectHeaderRow(sheet.rows, CATALOG_FIELDS);
      const hdrs = (sheet.rows[headerRow] ?? []).map(cellText);
      const saved = savedMappings[`catalog:${headerSignature(hdrs)}`] as Partial<Record<CatalogFieldKey, string>> | undefined;
      const fromSaved = saved ? fromNamedMapping(saved, hdrs) : undefined;
      const mapping = fromSaved && missingRequiredFields(fromSaved, CATALOG_FIELDS).length === 0 ? fromSaved : suggestMapping(hdrs, CATALOG_FIELDS);
      setLoaded({ fileName: file.name, sheet, headerRow, mapping });
    } catch (e) {
      setError(e instanceof FileReadError ? e.message : "Something went wrong reading this file.");
    } finally {
      setBusy(false);
    }
  };

  const confirm = () => {
    if (!loaded || !result || result.report.errors.length) return;
    const mapping = toNamedMapping(loaded.mapping, headers);
    saveCatalog({ fileName: loaded.fileName, importedAt: new Date().toISOString(), mapping, products: result.products, report: result.report });
    useConsoleStore.setState((s) => ({ savedMappings: { ...s.savedMappings, [`catalog:${headerSignature(headers)}`]: mapping } }));
    onDone();
  };

  if (campaign.isDemo) {
    return (
      <Card className="max-w-2xl">
        <CardHeader title="Product catalog" subtitle="The demo campaign uses a made-up catalog with images, links, stock and new-season items." />
        <Button
          onClick={() => {
            loadDemoCatalog();
            onDone();
          }}
        >
          Use sample catalog
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {!loaded ? (
        <Card>
          <CardHeader
            title="Upload the product catalog"
            subtitle="A list of products with SKU, name, image link, product page link, stock and a new-season flag. Exported from the store or inventory system as .xlsx or .csv."
          />
          <Dropzone onFile={onFile} busy={busy} />
          {error && <p className="mt-3 rounded-lg bg-bad-bg px-4 py-3 text-[14px] text-bad-fg" role="alert">{error}</p>}
          {importRecord && (
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg bg-canvas px-4 py-3 text-[13px]">
              <FileSpreadsheet size={18} className="text-gold" />
              <span className="flex-1">
                No catalog export yet? Download a template listing all {formatNumber(purchasedSkus.size)} purchased SKUs, fill in the links and stock, and upload it here.
              </span>
              <Button variant="secondary" size="sm" onClick={() => downloadCsv("catalog-template.csv", catalogTemplateCsv(importRecord.result.customers))}>
                <Download size={14} /> Download template
              </Button>
            </div>
          )}
          {onCancel && (
            <Button variant="ghost" size="sm" className="mt-3" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </Card>
      ) : (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <Card>
            <CardHeader title="Match columns" subtitle={`${loaded.fileName} · ${formatNumber(Math.max(0, loaded.sheet.rows.length - loaded.headerRow - 1))} rows`} />
            <ColumnMapper
              fields={CATALOG_FIELDS}
              headers={headers}
              rows={loaded.sheet.rows.slice(loaded.headerRow + 1)}
              mapping={loaded.mapping}
              onChange={(mapping) => setLoaded({ ...loaded, mapping })}
            />
          </Card>
          <Card className="xl:sticky xl:top-6">
            <CardHeader title="Check results" />
            {result && (
              <>
                {result.report.errors.length === 0 && (
                  <dl className="grid grid-cols-2 gap-3 pb-4">
                    <div className="rounded-lg bg-canvas px-3 py-2.5">
                      <dt className="text-[12px] text-ink-muted">Products</dt>
                      <dd className="text-[20px] font-bold">{formatNumber(result.products.length)}</dd>
                    </div>
                    <div className="rounded-lg bg-canvas px-3 py-2.5">
                      <dt className="text-[12px] text-ink-muted">Purchased SKUs found</dt>
                      <dd className="text-[20px] font-bold">
                        {formatNumber(matched)} <span className="text-[13px] font-normal text-ink-muted">of {formatNumber(purchasedSkus.size)}</span>
                      </dd>
                    </div>
                  </dl>
                )}
                <ul className="divide-y divide-line border-t border-line">
                  {result.report.errors.map((e) => (
                    <ReportItemRow key={e.id} item={e} tone="bad" label="Error" />
                  ))}
                  {result.report.warnings.map((w) => (
                    <ReportItemRow key={w.id} item={w} tone="warn" label="Warning" />
                  ))}
                  {result.report.errors.length === 0 && result.report.warnings.length === 0 && <li className="py-3 text-[13px] text-ok-fg">No problems found.</li>}
                </ul>
              </>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setLoaded(undefined)}>
                Choose another file
              </Button>
              <Button disabled={!result || result.report.errors.length > 0} onClick={confirm}>
                Use this catalog
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
