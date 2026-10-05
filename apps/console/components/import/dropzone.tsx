"use client";

import { FileSpreadsheet, Loader2 } from "lucide-react";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

export function Dropzone({ onFile, busy }: { onFile: (file: File) => void; busy: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => input.current?.click()}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const file = e.dataTransfer.files[0];
        if (file) onFile(file);
      }}
      className={cn(
        "flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed bg-white px-6 py-12 text-center transition-colors",
        over ? "border-navy bg-navy/5" : "border-line hover:border-ink-muted",
      )}
    >
      <span className="flex size-12 items-center justify-center rounded-full bg-cream text-gold">
        {busy ? <Loader2 className="animate-spin" size={22} /> : <FileSpreadsheet size={22} />}
      </span>
      <p className="mt-4 text-[15px] font-semibold">{busy ? "Reading file…" : "Drop last season's sales export here"}</p>
      <p className="mt-1 text-[13px] text-ink-muted">or click to choose a file · Excel (.xlsx) or CSV · read in your browser, nothing is uploaded</p>
      <input
        ref={input}
        type="file"
        accept=".xlsx,.xlsm,.csv,.xls,text/csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
