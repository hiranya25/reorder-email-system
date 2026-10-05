"use client";

import {
  buildIssues,
  deriveSteps,
  resolveMapping,
  summarize,
  type Campaign,
  type CampaignSummary,
  type Decision,
  type RememberedContact,
  type ImportRecord,
  type Issue,
  type MappingRow,
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
  mapping: MappingRow[];
  issues: Issue[];
  steps: StepStatus[];
}

const APPROVER_LABEL = "Shruti / Founder";

const EMPTY = {};

export function stepsFor(importRecord: ImportRecord | undefined, decidedAccounts: number): StepStatus[] {
  const summary = importRecord ? summarize(importRecord.result) : undefined;
  return deriveSteps({ summary, decidedAccounts, catalogUploaded: false, approverLabel: APPROVER_LABEL });
}

/** Mapping rows for a campaign, applying its decisions and (outside the demo) remembered approvals. */
export function mappingFor(
  campaign: Campaign,
  importRecord: ImportRecord | undefined,
  decisions: Record<string, Decision> | undefined,
  remembered: Record<string, RememberedContact>,
): MappingRow[] {
  if (!importRecord) return [];
  return resolveMapping(importRecord.result.customers, decisions ?? EMPTY, remembered, { useRemembered: !campaign.isDemo, campaignId: campaign.id });
}

/** Everything a campaign screen needs, derived from the campaign's latest import. */
export function useCampaignData(id: string): CampaignData | undefined {
  const campaign = useCampaign(id);
  const stored = useConsoleStore((s) => s.imports[id]);
  const rules = useConsoleStore((s) => s.rules);
  const decisions = useConsoleStore((s) => s.decisions[id]);
  const remembered = useConsoleStore((s) => s.remembered);
  const importRecord = campaign?.isDemo ? demoImport() : stored;

  return useMemo(() => {
    if (!campaign) return undefined;
    const summary = importRecord ? summarize(importRecord.result) : undefined;
    const mapping = mappingFor(campaign, importRecord, decisions, remembered);
    const decided = new Set(mapping.filter((r) => r.status !== "pending").map((r) => r.customer.accountId));
    const issues = importRecord
      ? buildIssues(importRecord.result, { catalogUploaded: false, largeAccountProducts: rules.largeAccountProducts, decided })
      : [];
    const steps = deriveSteps({ summary, decidedAccounts: decided.size, catalogUploaded: false, approverLabel: APPROVER_LABEL });
    return { campaign, importRecord, summary, mapping, issues, steps };
  }, [campaign, importRecord, decisions, remembered, rules.largeAccountProducts]);
}
