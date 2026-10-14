import {
  approvalReadiness,
  buildIssues,
  demoCatalog,
  deriveSteps,
  EMPTY_PICKS,
  indexCatalog,
  recommendationsComplete,
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
  type ReadinessItem,
  type RecommendationPicks,
  type RememberedContact,
  type SegmentSummary,
  type StepStatus,
} from "@reorder/core";
import { buildSendList, type SendList } from "@reorder/email";
import { demoImport } from "./demo-import";
import { isFullyApproved, isLocked, type ApprovalInfo, type CampaignSnapshot, type Settings, type WorkspaceSnapshot } from "./types";

/**
 * Pure calculations shared by the browser (to show) and the server (to validate).
 * No React, no store, no database here.
 */

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
  /** Which edits scope this campaign uses: the demo never touches real edits. */
  editScope: "real" | "demo";
  edits: ProductEdits;
  productsConfirmed: boolean;
  picks: RecommendationPicks;
  segments: SegmentSummary[];
  settings: Settings;
  approval: ApprovalInfo;
  /** Locked from the first approval until reopened. */
  locked: boolean;
  fullyApproved: boolean;
}

const EMPTY = {};
const APPROVER_LABEL = "Shruti & Shreya";

let demoProducts: Product[] | undefined;
export function demoCatalogProducts(): Product[] {
  demoProducts ??= demoCatalog(demoImport().result.customers);
  return demoProducts;
}

export function mappingFor(
  campaign: Campaign,
  importRecord: ImportRecord | undefined,
  decisions: Record<string, Decision> | undefined,
  remembered: Record<string, RememberedContact>,
): MappingRow[] {
  if (!importRecord) return [];
  return resolveMapping(importRecord.result.customers, decisions ?? EMPTY, remembered, { useRemembered: !campaign.isDemo, campaignId: campaign.id });
}

export function deriveCampaign(campaign: Campaign, ws: WorkspaceSnapshot, cs: CampaignSnapshot | undefined): CampaignData {
  const isDemo = !!campaign.isDemo;
  const importRecord = isDemo ? demoImport() : cs?.importRecord;
  const products = isDemo ? (ws.demoCatalogLoaded ? demoCatalogProducts() : []) : (ws.catalog?.products ?? []);
  const catalog = indexCatalog(products);
  const catalogUploaded = products.length > 0;
  const editScope = isDemo ? "demo" : "real";
  const edits: ProductEdits = { hidden: cs?.hidden ?? [], ...ws.productEdits[editScope] };
  const picks = cs?.picks ?? EMPTY_PICKS;
  const approval = cs?.approval ?? { approvers: [], required: ws.settings.requiredApprovals };

  const summary = importRecord ? summarize(importRecord.result) : undefined;
  const mapping = mappingFor(campaign, importRecord, cs?.decisions, ws.remembered);
  const decided = new Set(mapping.filter((r) => r.status !== "pending").map((r) => r.customer.accountId));
  const segments = importRecord ? segmentSummaries(importRecord.result.customers, picks) : [];
  const issues = importRecord
    ? buildIssues(importRecord.result, { catalogUploaded, largeAccountProducts: ws.rules.largeAccountProducts, decided, catalog, edits })
    : [];
  const fullyApproved = isFullyApproved(approval);
  const steps = deriveSteps({
    summary,
    decidedAccounts: decided.size,
    catalogUploaded,
    productsConfirmed: !!cs?.productsConfirmed,
    recommendations: { filled: segments.filter((s) => s.filled === 3 || s.overridden === s.customers).length, total: segments.length },
    approverLabel: approval.approvers.length ? `${approval.approvers.length} of ${approval.required} approved` : APPROVER_LABEL,
    approvedBy: fullyApproved ? approval.approvers.map((a) => a.name).join(" & ") : undefined,
    exported: !!approval.exportedAt,
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
    productsConfirmed: !!cs?.productsConfirmed,
    picks,
    segments,
    settings: ws.settings,
    approval,
    locked: isLocked(approval),
    fullyApproved,
  };
}

export function sendListFor(d: CampaignData): SendList {
  return buildSendList(d.mapping, {
    campaignName: d.campaign.name,
    seasonStart: d.campaign.seasonStart,
    catalog: d.catalog,
    edits: d.edits,
    picks: d.picks,
    brand: d.settings.brand,
    reorder: d.settings.reorder,
  });
}

/** The Approve & sync checklist. The server re-runs this before accepting an approval. */
export function readinessFor(d: CampaignData, list: SendList = sendListFor(d)): ReadinessItem[] {
  const brand = d.settings.brand;
  return approvalReadiness({
    pendingAccounts: list.skipped.filter((s) => s.reason === "not_decided").length,
    catalogUploaded: d.catalogUploaded,
    productsConfirmed: d.productsConfirmed,
    recommendationsComplete: recommendationsComplete(d.segments),
    reorderLinkSet: d.settings.reorder.mode !== "none",
    brandSet: !/^\[.*\]$/.test(brand.brandName.trim()) && !/^\[.*\]$/.test(brand.address.trim()),
    emails: list.emails.length,
  });
}
