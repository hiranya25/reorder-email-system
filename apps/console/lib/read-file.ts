"use client";

import type { Row } from "@reorder/core";

export interface LoadedSheet {
  name: string;
  rows: Row[];
}

export class FileReadError extends Error {}

const MAX_BYTES = 25 * 1024 * 1024;

/** Reads an uploaded export into rows of cells, entirely in the browser. */
export async function readSalesFile(file: File): Promise<LoadedSheet[]> {
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  if (file.size > MAX_BYTES) throw new FileReadError("This file is larger than 25 MB. Export only last season's sales lines and try again.");

  if (ext === "csv" || ext === "txt" || file.type === "text/csv") {
    const Papa = (await import("papaparse")).default;
    const text = await file.text();
    const parsed = Papa.parse<string[]>(text.replace(/^﻿/, ""), { skipEmptyLines: "greedy" });
    if (parsed.errors.length && parsed.data.length === 0) throw new FileReadError("We couldn't read this CSV file. Check it opens in Excel and try again.");
    return [{ name: file.name.replace(/\.[^.]+$/, ""), rows: parsed.data }];
  }
  if (ext === "xlsx" || ext === "xlsm") {
    const readXlsxFile = (await import("read-excel-file/browser")).default;
    try {
      const sheets = await readXlsxFile(file);
      return sheets.map((s) => ({ name: s.sheet, rows: s.data as Row[] }));
    } catch {
      throw new FileReadError("We couldn't read this Excel file. It may be password-protected or damaged. Try saving it again as .xlsx.");
    }
  }
  if (ext === "xls") throw new FileReadError("Older .xls files aren't supported. Open it in Excel and save as .xlsx or .csv.");
  throw new FileReadError("Upload an Excel (.xlsx) or CSV (.csv) file.");
}
