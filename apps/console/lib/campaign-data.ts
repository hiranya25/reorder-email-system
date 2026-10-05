"use client";

import {
  buildIssues,
  deriveSteps,
  summarize,
  type Campaign,
  type CampaignSummary,
  type ImportRecord,
  type Issue,
  type StepStatus,
} from "@reorder/core";
import { useMemo } from "react";
import { demoImport } from "./demo-import";
import { useCampaign, useConsoleStore } from "./store";

export interface CampaignData {
  campaign: Campaign;
  /** Undefined until a sales export has been imported. */
  importRecord?: ImportRecord;
  summary?: CampaignSummary;
  issues: Issue[];
  steps: StepStatus[];
}

const APPROVER_LABEL = "Shruti / Founder";

export function stepsFor(importRecord: ImportRecord | undefined): StepStatus[] {
  const summary = importRecord ? summarize(importRecord.result) : undefined;
  return deriveSteps({ summary, decidedAccounts: 0, catalogUploaded: false, approverLabel: APPROVER_LABEL });
}

/** Everything a campaign screen needs, derived from the campaign's latest import. */
export function useCampaignData(id: string): CampaignData | undefined {
  const campaign = useCampaign(id);
  const stored = useConsoleStore((s) => s.imports[id]);
  const rules = useConsoleStore((s) => s.rules);
  const importRecord = campaign?.isDemo ? demoImport() : stored;

  return useMemo(() => {
    if (!campaign) return undefined;
    const summary = importRecord ? summarize(importRecord.result) : undefined;
    const issues = importRecord
      ? buildIssues(importRecord.result, { catalogUploaded: false, largeAccountProducts: rules.largeAccountProducts })
      : [];
    const steps = deriveSteps({ summary, decidedAccounts: 0, catalogUploaded: false, approverLabel: APPROVER_LABEL });
    return { campaign, importRecord, summary, issues, steps };
  }, [campaign, importRecord, rules.largeAccountProducts]);
}
