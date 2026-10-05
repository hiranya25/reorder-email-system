"use client";

import { cellText, FIELDS, type FieldDef, type Row } from "@reorder/core";
import { StatusChip } from "../ui/status-chip";

const selectClass =
  "h-9 w-full rounded-lg border border-line bg-white px-2.5 text-sm focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/15";

export function ColumnMapper<K extends string>({
  headers,
  rows,
  mapping,
  onChange,
  fields = FIELDS as unknown as FieldDef<K>[],
}: {
  headers: string[];
  /** Data rows (below the header), used for example values. */
  rows: Row[];
  mapping: Partial<Record<K, number>>;
  onChange: (mapping: Partial<Record<K, number>>) => void;
  fields?: FieldDef<K>[];
}) {
  const example = (col: number | undefined) => {
    if (col === undefined) return "";
    for (const r of rows.slice(0, 50)) {
      const t = cellText(r[col]);
      if (t) return t;
    }
    return "";
  };

  const set = (key: K, value: string) => {
    const next: Partial<Record<K, number>> = { ...mapping };
    if (value === "") delete next[key];
    else {
      const col = Number(value);
      // A column can feed only one field.
      for (const k of Object.keys(next) as K[]) if (next[k] === col) delete next[k];
      next[key] = col;
    }
    onChange(next);
  };

  return (
    <div className="divide-y divide-line">
      {fields.map((f) => {
        const col = mapping[f.key];
        const missing = f.required && col === undefined;
        return (
          <div key={f.key} className="grid gap-2 py-3 sm:grid-cols-[1fr_220px] sm:items-center sm:gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[14px] font-medium">
                {f.label}
                {f.required ? <StatusChip tone={missing ? "bad" : "neutral"}>Required</StatusChip> : <span className="text-xs text-ink-muted">Optional</span>}
              </div>
              <div className="mt-0.5 text-[12px] text-ink-muted">{f.help}</div>
            </div>
            <div className="min-w-0">
              <select
                aria-label={`Column for ${f.label}`}
                className={selectClass + (missing ? " border-bad-fg" : "")}
                value={col === undefined ? "" : String(col)}
                onChange={(e) => set(f.key, e.target.value)}
              >
                <option value="">— Not in file —</option>
                {headers.map((h, i) => (
                  <option key={i} value={i}>
                    {h || `Column ${i + 1}`}
                  </option>
                ))}
              </select>
              <div className="mt-1 truncate font-mono text-[11px] text-ink-muted" title={example(col)}>
                {col === undefined ? " " : example(col) ? `e.g. ${example(col)}` : "(empty in first rows)"}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
