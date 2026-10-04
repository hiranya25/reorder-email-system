"use client";

import {
  DEMO_ISSUES,
  DEMO_SUMMARY,
  deriveSteps,
  type Campaign,
  type CampaignSummary,
  type Issue,
  type StepStatus,
} from "@reorder/core";
import { useCampaign } from "./store";

export interface CampaignData {
  campaign: Campaign;
  /** Undefined until a sales export has been imported. */
  summary?: CampaignSummary;
  issues: Issue[];
  steps: StepStatus[];
}

/** Everything a campaign screen needs. F2 replaces the demo values with the parsed upload. */
export function useCampaignData(id: string): CampaignData | undefined {
  const campaign = useCampaign(id);
  if (!campaign) return undefined;
  const summary = campaign.isDemo ? DEMO_SUMMARY : undefined;
  const issues = campaign.isDemo ? DEMO_ISSUES : [];
  const steps = deriveSteps({
    summary,
    decidedAccounts: 0,
    catalogUploaded: false,
    approverLabel: "Shruti / Founder",
  });
  return { campaign, summary, issues, steps };
}
