import {
  cellText,
  DEMO_CAMPAIGN,
  demoSheet,
  detectHeaderRow,
  processSales,
  suggestMapping,
  toNamedMapping,
  type ImportRecord,
} from "@reorder/core";

let cached: ImportRecord | undefined;

/** The demo campaign's data, produced by the real import pipeline from the synthetic sheet. */
export function demoImport(): ImportRecord {
  if (cached) return cached;
  const rows = demoSheet();
  const h = detectHeaderRow(rows);
  const headers = (rows[h] ?? []).map(cellText);
  const mapping = suggestMapping(headers);
  cached = {
    fileName: DEMO_CAMPAIGN.fileName!,
    sheetName: "Export",
    importedAt: DEMO_CAMPAIGN.createdAt,
    mapping: toNamedMapping(mapping, headers),
    result: processSales(rows, h, mapping, { seasonStart: DEMO_CAMPAIGN.seasonStart, seasonEnd: DEMO_CAMPAIGN.seasonEnd }),
  };
  return cached;
}
