"use client";

import { currentStepNumber, formatSeasonRange, STEP_LABELS, STEP_KEYS, type Campaign, type ImportRecord } from "@reorder/core";
import { Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { mappingFor, stepsFor } from "@/lib/campaign-data";
import { demoImport } from "@/lib/demo-import";
import { useAllCampaigns, useConsoleStore } from "@/lib/store";
import { Button } from "../ui/button";
import { Field, Input } from "../ui/field";
import { Modal } from "../ui/modal";
import { StatusChip } from "../ui/status-chip";
import { PageHeader } from "./page-header";

function progressFor(c: Campaign, record: ImportRecord | undefined, decided: number, extra: { catalogUploaded: boolean; productsConfirmed: boolean }) {
  const steps = stepsFor(c.isDemo ? demoImport() : record, decided, extra);
  const n = currentStepNumber(steps);
  const blocked = steps.filter((s) => s.state === "blocked").map((s) => s.label);
  return { n, steps, blocked };
}

/** Default season window: Oct 1 of last year to Jan 31 of this year. */
function defaultSeason() {
  const y = new Date().getFullYear();
  return { start: `${y - 1}-10-01`, end: `${y}-01-31`, name: `Holiday ${y} Reorder` };
}

export function CampaignsHome() {
  const campaigns = useAllCampaigns();
  const createCampaign = useConsoleStore((s) => s.createCampaign);
  const deleteCampaign = useConsoleStore((s) => s.deleteCampaign);
  const imports = useConsoleStore((s) => s.imports);
  const decisions = useConsoleStore((s) => s.decisions);
  const remembered = useConsoleStore((s) => s.remembered);
  const hasCatalog = useConsoleStore((s) => !!s.catalog?.products.length);
  const demoCatalogLoaded = useConsoleStore((s) => s.demoCatalogLoaded);
  const productsConfirmed = useConsoleStore((s) => s.productsConfirmed);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(defaultSeason);
  const invalid = !form.name.trim() || !form.start || !form.end || form.start > form.end;

  return (
    <>
      <PageHeader
        title="Campaigns"
        subtitle="Each season's reorder campaign and where it stands. Nothing is sent without approval."
        actions={
          <Button size="lg" onClick={() => { setForm(defaultSeason()); setOpen(true); }}>
            <Plus size={16} /> New campaign
          </Button>
        }
      />

      <div className="overflow-x-auto rounded-xl border border-line bg-white">
        <table className="w-full min-w-[720px] text-left text-[14px]">
          <thead className="border-b border-line bg-canvas/60 text-[11px] font-semibold tracking-wide text-ink-muted uppercase">
            <tr>
              <th className="px-5 py-3">Campaign</th>
              <th className="px-5 py-3">Season</th>
              <th className="px-5 py-3">Progress</th>
              <th className="px-5 py-3">Current step</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {campaigns.map((c) => {
              const record = c.isDemo ? demoImport() : imports[c.id];
              const decided = mappingFor(c, record, decisions[c.id], remembered).filter((r) => r.status !== "pending").length;
              const { n, steps, blocked } = progressFor(c, record, decided, {
                catalogUploaded: c.isDemo ? demoCatalogLoaded : hasCatalog,
                productsConfirmed: !!productsConfirmed[c.id],
              });
              return (
                <tr key={c.id} className="hover:bg-canvas/50">
                  <td className="px-5 py-4">
                    <Link href={`/campaigns/${c.id}/overview`} className="font-semibold hover:underline">
                      {c.name}
                    </Link>
                    {c.isDemo && <StatusChip tone="neutral" className="ml-2">Demo</StatusChip>}
                  </td>
                  <td className="px-5 py-4 text-ink-muted">{formatSeasonRange(c.seasonStart, c.seasonEnd)}</td>
                  <td className="px-5 py-4">
                    <div className="flex gap-1" aria-label={`Step ${n} of ${steps.length}`}>
                      {steps.map((s) => (
                        <span
                          key={s.key}
                          title={`${s.label}: ${s.state.replace("_", " ")}`}
                          className={
                            "h-1.5 w-5 rounded-full " +
                            ({ done: "bg-ok-fg", in_progress: "bg-navy", blocked: "bg-bad-fg", not_started: "bg-track" } as const)[s.state]
                          }
                        />
                      ))}
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    {STEP_LABELS[STEP_KEYS[n - 1]!]}
                    {blocked.length > 0 && <StatusChip tone="bad" className="ml-2">{blocked.length} blocked</StatusChip>}
                  </td>
                  <td className="px-5 py-4 text-right">
                    {!c.isDemo && (
                      <button
                        type="button"
                        aria-label={`Delete ${c.name}`}
                        className="rounded p-1.5 text-ink-muted hover:bg-bad-bg hover:text-bad-fg"
                        onClick={() => confirm(`Delete "${c.name}"? This only removes it from this browser.`) && deleteCampaign(c.id)}
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="New campaign">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (invalid) return;
            const c = createCampaign({ name: form.name.trim(), seasonStart: form.start, seasonEnd: form.end });
            setOpen(false);
            router.push(`/campaigns/${c.id}/import`);
          }}
        >
          <Field label="Campaign name">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Last season starts">
              <Input type="date" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
            </Field>
            <Field label="Last season ends">
              <Input type="date" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} />
            </Field>
          </div>
          <p className="text-xs text-ink-muted">Orders in this window are used to build each customer&apos;s email.</p>
          {form.start > form.end && <p className="text-xs text-bad-fg">The season must end after it starts.</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={invalid}>Create & import data</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
