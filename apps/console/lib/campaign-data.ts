"use client";

import {
  buildIssues,
  demoCatalog,
  deriveSteps,
  EMPTY_PICKS,
  indexCatalog,
  resolveMapping,
  segmentSummaries,
  summarize,
  type Campaign,
  type CampaignSummary,
  type CatalogIndex,
  type Decision,
  type ImportRecord,
  type Issue,
  type MappingRow,
  type Product,
  type ProductEdits,
  type RecommendationPicks,
  type RememberedContact,
  type SegmentSummary,
  type StepStatus,
} from "@reorder/core";
import { useMemo } from "react";
import type { Approval, Settings } from "./store";
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
  /** Products from the uploaded catalog (or the demo catalog). Empty until uploaded. */
  products: Product[];
  catalog: CatalogIndex;
  catalogUploaded: boolean;
  /** Which store scope edits belong to: the demo never touches real edits. */
  editScope: "real" | "demo";
  edits: ProductEdits;
  productsConfirmed: boolean;
  picks: RecommendationPicks;
  segments: SegmentSummary[];
  settings: Settings;
  /** Present once approved; the campaign is locked until reopened. */
  approval?: Approval;
  locked: boolean;
}

const APPROVER_LABEL = "Shruti / Founder";
const EMPTY = {};
const NO_HIDDEN: string[] = [];

let demoProducts: Product[] | undefined;
function demoCatalogProducts(): Product[] {
  demoProducts ??= demoCatalog(demoImport().result.customers);
  return demoProducts;
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

/** Light version for the campaigns list: no catalog or picks detail. */
export function stepsFor(
  importRecord: ImportRecord | undefined,
  decidedAccounts: number,
  extra: { catalogUploaded: boolean; productsConfirmed: boolean; approval?: Approval },
): StepStatus[] {
  const summary = importRecord ? summarize(importRecord.result) : undefined;
  return deriveSteps({
    summary,
    decidedAccounts,
    catalogUploaded: extra.catalogUploaded,
    productsConfirmed: extra.productsConfirmed,
    approverLabel: APPROVER_LABEL,
    approvedBy: extra.approval?.by,
    exported: !!extra.approval?.exportedAt,
  });
}

/** Everything a campaign screen needs, derived from the campaign's import and review decisions. */
export function useCampaignData(id: string): CampaignData | undefined {
  const campaign = useCampaign(id);
  const stored = useConsoleStore((s) => s.imports[id]);
  const rules = useConsoleStore((s) => s.rules);
  const decisions = useConsoleStore((s) => s.decisions[id]);
  const remembered = useConsoleStore((s) => s.remembered);
  const catalogRecord = useConsoleStore((s) => s.catalog);
  const demoCatalogLoaded = useConsoleStore((s) => s.demoCatalogLoaded);
  const productEdits = useConsoleStore((s) => s.productEdits);
  const hidden = useConsoleStore((s) => s.hiddenProducts[id] ?? NO_HIDDEN);
  const confirmed = useConsoleStore((s) => s.productsConfirmed[id]);
  const storedPicks = useConsoleStore((s) => s.picks[id]);
  const settings = useConsoleStore((s) => s.settings);
  const approval = useConsoleStore((s) => s.approvals[id]);
  const importRecord = campaign?.isDemo ? demoImport() : stored;

  return useMemo(() => {
    if (!campaign) return undefined;
    const isDemo = !!campaign.isDemo;
    const products = isDemo ? (demoCatalogLoaded ? demoCatalogProducts() : []) : (catalogRecord?.products ?? []);
    const catalog = indexCatalog(products);
    const catalogUploaded = products.length > 0;
    const editScope = isDemo ? "demo" : "real";
    const edits: ProductEdits = { hidden, ...productEdits[editScope] };
    const picks = storedPicks ?? EMPTY_PICKS;

    const summary = importRecord ? summarize(importRecord.result) : undefined;
    const mapping = mappingFor(campaign, importRecord, decisions, remembered);
    const decided = new Set(mapping.filter((r) => r.status !== "pending").map((r) => r.customer.accountId));
    const segments = importRecord ? segmentSummaries(importRecord.result.customers, picks) : [];
    const issues = importRecord
      ? buildIssues(importRecord.result, { catalogUploaded, largeAccountProducts: rules.largeAccountProducts, decided, catalog, edits })
      : [];
    const steps = deriveSteps({
      summary,
      decidedAccounts: decided.size,
      catalogUploaded,
      productsConfirmed: !!confirmed,
      recommendations: { filled: segments.filter((s) => s.filled === 3 || s.overridden === s.customers).length, total: segments.length },
      approverLabel: APPROVER_LABEL,
      approvedBy: approval?.by,
      exported: !!approval?.exportedAt,
    });
    return {
      campaign,
      importRecord,
      summary,
      mapping,
      issues,
      steps,
      products,
      catalog,
      catalogUploaded,
      editScope,
      edits,
      productsConfirmed: !!confirmed,
      picks,
      segments,
      settings,
      approval,
      locked: !!approval,
    };
  }, [campaign, importRecord, decisions, remembered, rules.largeAccountProducts, catalogRecord, demoCatalogLoaded, productEdits, hidden, confirmed, storedPicks, settings, approval]);
}
