import { formatNumber } from "./format";
import type { CampaignSummary, StepKey, StepStatus } from "./types";
import { STEP_KEYS } from "./types";

export const STEP_LABELS: Record<StepKey, string> = {
  import: "Import sales",
  mapping: "Map customers",
  products: "Product check",
  recommendations: "Pick 3 new items",
  preview: "Preview & test",
  approve: "Approve",
  sync: "Sync to Mailchimp",
  send: "Send",
};

export interface StepInputs {
  summary?: CampaignSummary;
  /** Accounts approved or excluded so far on the mapping screen. */
  decidedAccounts: number;
  catalogUploaded: boolean;
  approverLabel: string;
}

/**
 * Derives the 8-tile tracker. A step is only in progress once every earlier
 * step is done; a missing prerequisite (e.g. catalog) marks it blocked.
 */
export function deriveSteps(input: StepInputs): StepStatus[] {
  const { summary } = input;
  const states: Partial<Record<StepKey, Omit<StepStatus, "key" | "label">>> = {};

  if (!summary) {
    states.import = { state: "in_progress", detail: "Upload export" };
  } else {
    states.import = { state: "done", detail: `${formatNumber(summary.lines)} lines` };
    const mappingDone = summary.customers > 0 && input.decidedAccounts >= summary.customers;
    states.mapping = mappingDone
      ? { state: "done", detail: `${formatNumber(summary.customers)} decided` }
      : {
          state: "in_progress",
          detail:
            input.decidedAccounts > 0
              ? `${formatNumber(input.decidedAccounts)} of ${formatNumber(summary.customers)} decided`
              : `${formatNumber(summary.ready)} of ${formatNumber(summary.customers)} ready`,
        };
    states.products = input.catalogUploaded
      ? { state: mappingDone ? "in_progress" : "not_started", detail: "Catalog uploaded" }
      : { state: "blocked", detail: "Catalog needed" };
  }
  states.approve = { state: "not_started", detail: input.approverLabel };

  return STEP_KEYS.map((key) => ({
    key,
    label: STEP_LABELS[key],
    ...(states[key] ?? { state: "not_started" as const, detail: "Not started" }),
  }));
}

/** 1-based index of the first step that isn't done. */
export function currentStepNumber(steps: StepStatus[]): number {
  const i = steps.findIndex((s) => s.state !== "done");
  return i === -1 ? steps.length : i + 1;
}
