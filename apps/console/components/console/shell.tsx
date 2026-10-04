"use client";

import { Menu, X } from "lucide-react";
import { useState } from "react";
import type { StepStatus } from "@reorder/core";
import { Logo } from "./logo";
import { Sidebar } from "./sidebar";

/** Fixed sidebar on laptop screens; collapses to a top bar with a drawer on small screens. */
export function ConsoleShell({
  campaignId,
  steps,
  children,
}: {
  campaignId?: string;
  steps?: StepStatus[];
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-dvh lg:pl-60">
      <aside className="fixed inset-y-0 left-0 hidden w-60 lg:block">
        <Sidebar campaignId={campaignId} steps={steps} />
      </aside>

      <header className="sticky top-0 z-20 flex items-center justify-between bg-sidebar px-4 py-3 lg:hidden">
        <Logo />
        <button type="button" onClick={() => setOpen(true)} aria-label="Open menu" className="rounded p-2 text-white">
          <Menu size={20} />
        </button>
      </header>

      {open && (
        <div className="fixed inset-0 z-30 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-64">
            <Sidebar campaignId={campaignId} steps={steps} onNavigate={() => setOpen(false)} />
            <button type="button" onClick={() => setOpen(false)} aria-label="Close menu" className="absolute top-5 right-3 p-1 text-white/70">
              <X size={18} />
            </button>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-[1280px] px-4 py-6 sm:px-8 sm:py-8">{children}</main>
    </div>
  );
}
