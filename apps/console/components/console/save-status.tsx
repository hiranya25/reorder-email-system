"use client";

import { AlertTriangle, Loader2, X } from "lucide-react";
import { useConsoleStore } from "@/lib/store";
import { useSessionUser } from "../session-provider";

/** Bottom-of-screen notices: saving in progress, a refused or failed save, view-only access. */
export function SaveStatus() {
  const error = useConsoleStore((s) => s.saveError);
  const saving = useConsoleStore((s) => s.saving);
  const dismiss = useConsoleStore((s) => s.dismissError);
  const viewer = useSessionUser().role === "viewer";

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex flex-col items-center gap-2 px-4">
      {error && (
        <div role="alert" className="pointer-events-auto flex max-w-xl items-start gap-3 rounded-lg border border-bad-fg/30 bg-white px-4 py-3 text-[14px] shadow-lg">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-bad-fg" />
          <p className="flex-1">{error}</p>
          <button type="button" className="text-[13px] font-semibold underline underline-offset-2" onClick={() => window.location.reload()}>
            Reload
          </button>
          <button type="button" aria-label="Dismiss" onClick={dismiss} className="rounded p-0.5 text-ink-muted hover:bg-canvas">
            <X size={16} />
          </button>
        </div>
      )}
      {saving > 0 && !error && (
        <div className="flex items-center gap-2 rounded-full bg-navy px-3 py-1.5 text-[12px] font-semibold text-white shadow">
          <Loader2 size={13} className="animate-spin" /> Saving…
        </div>
      )}
      {viewer && !error && saving === 0 && (
        <div className="rounded-full bg-sidebar px-3 py-1.5 text-[12px] font-semibold text-white/90 shadow">View-only access</div>
      )}
    </div>
  );
}
