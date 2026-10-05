"use client";

import {
  cellText,
  demoSheet,
  detectHeaderRow,
  formatNumber,
  fromNamedMapping,
  headerSignature,
  missingRequiredFields,
  processSales,
  suggestMapping,
  summarize,
  toCsv,
  toNamedMapping,
  type ColumnMapping,
} from "@reorder/core";
import { Download, FileSpreadsheet, Info } from "lucide-react";
import { useRouter } from "next/navigation";
import { useDeferredValue, useMemo, useState } from "react";
import { downloadCsv } from "@/lib/download";
import { FileReadError, readSalesFile, type LoadedSheet } from "@/lib/read-file";
import { useConsoleStore } from "@/lib/store";
import { useCurrentCampaign } from "../console/campaign-shell";
import { PageHeader } from "../console/page-header";
import { Button, ButtonLink } from "../ui/button";
import { Card, CardHeader } from "../ui/card";
import { Field, Input } from "../ui/field";
import { Modal } from "../ui/modal";
import { ColumnMapper } from "./column-mapper";
import { Dropzone } from "./dropzone";
import { ReportPanel } from "./report-panel";

interface Loaded {
  fileName: string;
  sheets: LoadedSheet[];
  sheetIndex: number;
  headerRow: number;
  mapping: ColumnMapping;
  usedSavedMapping: boolean;
}

function downloadSample() {
  const rows = demoSheet().map((r) => r.map(cellText));
  downloadCsv("sample_sales_export.csv", toCsv(rows));
}

export function ImportView() {
  const { campaign, importRecord } = useCurrentCampaign();
  const savedMappings = useConsoleStore((s) => s.savedMappings);
  const rules = useConsoleStore((s) => s.rules);
  const saveImport = useConsoleStore((s) => s.saveImport);
  const router = useRouter();

  const [loaded, setLoaded] = useState<Loaded>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [season, setSeason] = useState({ start: campaign.seasonStart, end: campaign.seasonEnd });
  const [confirmReplace, setConfirmReplace] = useState(false);

  const sheet = loaded?.sheets[loaded.sheetIndex];
  const headers = useMemo(() => (sheet && loaded ? (sheet.rows[loaded.headerRow] ?? []).map(cellText) : []), [sheet, loaded]);

  const prepareSheet = (sheets: LoadedSheet[], sheetIndex: number, fileName: string): Loaded => {
    const rows = sheets[sheetIndex]?.rows ?? [];
    const headerRow = detectHeaderRow(rows);
    const hdrs = (rows[headerRow] ?? []).map(cellText);
    const saved = savedMappings[headerSignature(hdrs)];
    const fromSaved = saved ? fromNamedMapping(saved, hdrs) : undefined;
    const usable = fromSaved && missingRequiredFields(fromSaved).length === 0;
    return { fileName, sheets, sheetIndex, headerRow, mapping: usable ? fromSaved : suggestMapping(hdrs), usedSavedMapping: !!usable };
  };

  const onFile = async (file: File) => {
    setBusy(true);
    setError(undefined);
    try {
      const sheets = await readSalesFile(file);
      if (sheets.length === 0) throw new FileReadError("This file has no sheets.");
      // Start on the sheet with the most rows; exports often have a cover sheet.
      const biggest = sheets.reduce((best, s, i) => (s.rows.length > (sheets[best]?.rows.length ?? 0) ? i : best), 0);
      setLoaded(prepareSheet(sheets, biggest, file.name));
    } catch (e) {
      setLoaded(undefined);
      setError(e instanceof FileReadError ? e.message : "Something went wrong reading this file. Try saving it again as .xlsx or .csv.");
    } finally {
      setBusy(false);
    }
  };

  // Re-run the checks as the mapping or season changes; deferred so typing stays responsive.
  const rawInput = useMemo(
    () => (loaded && sheet ? { rows: sheet.rows, headerRow: loaded.headerRow, mapping: loaded.mapping, season } : undefined),
    [loaded, sheet, season],
  );
  const input = useDeferredValue(rawInput);
  const result = useMemo(
    () => (input ? processSales(input.rows, input.headerRow, input.mapping, { seasonStart: input.season.start, seasonEnd: input.season.end, rules }) : undefined),
    [input, rules],
  );
  const summary = useMemo(() => (result ? summarize(result) : undefined), [result]);
  const seasonInvalid = !season.start || !season.end || season.start > season.end;
  const canImport = !!result && result.report.errors.length === 0 && !seasonInvalid && !busy;

  const doImport = () => {
    if (!loaded || !sheet || !result) return;
    saveImport(
      campaign.id,
      { fileName: loaded.fileName, sheetName: sheet.name, importedAt: new Date().toISOString(), mapping: toNamedMapping(loaded.mapping, headers), result },
      headerSignature(headers),
      season,
    );
    router.push(`/campaigns/${campaign.id}/overview`);
  };

  const crumbs = [{ label: campaign.name, href: `/campaigns/${campaign.id}/overview` }, { label: "Step 1" }];

  if (campaign.isDemo) {
    return (
      <>
        <PageHeader crumbs={crumbs} title="Import data" subtitle="Bring in last season's sales export." />
        <Card className="max-w-2xl">
          <div className="flex gap-3">
            <Info className="mt-0.5 shrink-0 text-gold" size={20} />
            <div className="text-[14px]">
              <p className="font-semibold">This is the demo campaign</p>
              <p className="mt-1 text-ink-muted">
                It uses a made-up sample export. Create a campaign to import your own file. You can also download the sample to try the import.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <ButtonLink href="/campaigns">Create a campaign</ButtonLink>
                <Button variant="secondary" onClick={downloadSample}>
                  <Download size={15} /> Download sample file
                </Button>
              </div>
            </div>
          </div>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        crumbs={crumbs}
        title="Import data"
        subtitle="Bring in last season's sales export. The file is read in your browser; nothing is uploaded or sent."
        actions={
          loaded && (
            <Button size="lg" disabled={!canImport} onClick={() => (importRecord ? setConfirmReplace(true) : doImport())}>
              Confirm import →
            </Button>
          )
        }
      />

      {importRecord && !loaded && (
        <Card className="mb-5 flex items-center gap-3 py-4 text-[14px]">
          <FileSpreadsheet className="shrink-0 text-gold" size={20} />
          <p className="flex-1">
            Currently using <span className="font-mono text-[13px]">{importRecord.fileName}</span>, imported {new Date(importRecord.importedAt).toLocaleDateString()}. Importing a new file replaces it.
          </p>
        </Card>
      )}

      {!loaded ? (
        <div className="max-w-3xl space-y-3">
          <Dropzone onFile={onFile} busy={busy} />
          {error && <p className="rounded-lg bg-bad-bg px-4 py-3 text-[14px] text-bad-fg" role="alert">{error}</p>}
          <p className="text-[13px] text-ink-muted">
            Need a file to try?{" "}
            <button type="button" onClick={downloadSample} className="font-semibold text-ink underline underline-offset-4">
              Download a sample export
            </button>
          </p>
        </div>
      ) : (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="space-y-5">
            <Card>
              <div className="flex flex-wrap items-center gap-3">
                <FileSpreadsheet className="text-gold" size={20} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-mono text-[13px]">{loaded.fileName}</div>
                  <div className="text-[12px] text-ink-muted">
                    {formatNumber(Math.max(0, (sheet?.rows.length ?? 0) - loaded.headerRow - 1))} rows under the header (row {loaded.headerRow + 1})
                  </div>
                </div>
                {loaded.sheets.length > 1 && (
                  <select
                    aria-label="Sheet"
                    className="h-9 rounded-lg border border-line bg-white px-2.5 text-sm"
                    value={loaded.sheetIndex}
                    onChange={(e) => setLoaded(prepareSheet(loaded.sheets, Number(e.target.value), loaded.fileName))}
                  >
                    {loaded.sheets.map((s, i) => (
                      <option key={i} value={i}>
                        Sheet: {s.name}
                      </option>
                    ))}
                  </select>
                )}
                <Button variant="secondary" size="sm" onClick={() => setLoaded(undefined)}>
                  Choose another file
                </Button>
              </div>
            </Card>

            <Card>
              <CardHeader
                title="Match columns"
                subtitle={
                  loaded.usedSavedMapping
                    ? "Using the column choices saved from the last import with this layout."
                    : "We matched what we could from the header names. Check each one; your choices are remembered for next season."
                }
              />
              <ColumnMapper
                headers={headers}
                rows={sheet?.rows.slice(loaded.headerRow + 1) ?? []}
                mapping={loaded.mapping}
                onChange={(mapping) => setLoaded({ ...loaded, mapping, usedSavedMapping: false })}
              />
            </Card>
          </div>

          <div className="space-y-5 xl:sticky xl:top-6">
            <Card>
              <CardHeader title="Season window" subtitle="Only orders between these dates are used. A month without a year is placed inside this window." />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Season starts">
                  <Input type="date" value={season.start} onChange={(e) => setSeason({ ...season, start: e.target.value })} />
                </Field>
                <Field label="Season ends">
                  <Input type="date" value={season.end} onChange={(e) => setSeason({ ...season, end: e.target.value })} />
                </Field>
              </div>
              {seasonInvalid && <p className="mt-2 text-xs text-bad-fg">The season must end after it starts.</p>}
            </Card>

            <Card>
              <CardHeader title="Check results" subtitle="Updates as you change the columns or dates." />
              {result && summary && <ReportPanel report={result.report} summary={summary} />}
            </Card>
          </div>
        </div>
      )}

      <Modal open={confirmReplace} onClose={() => setConfirmReplace(false)} title="Replace the current import?">
        <p className="text-[14px]">
          This campaign already uses <span className="font-mono text-[13px]">{importRecord?.fileName}</span>. The new file replaces it, and the Overview and later steps will use the new numbers.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirmReplace(false)}>
            Cancel
          </Button>
          <Button onClick={doImport}>Replace and import</Button>
        </div>
      </Modal>
    </>
  );
}
