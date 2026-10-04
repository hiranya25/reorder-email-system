/** The 8 campaign steps, in order. Matches the step tracker on the Overview screen. */
export const STEP_KEYS = [
  "import",
  "mapping",
  "products",
  "recommendations",
  "preview",
  "approve",
  "sync",
  "send",
] as const;
export type StepKey = (typeof STEP_KEYS)[number];

export type StepState = "done" | "in_progress" | "blocked" | "not_started";

export interface StepStatus {
  key: StepKey;
  label: string;
  state: StepState;
  /** Short metric or owner line under the label, e.g. "1,359 lines". */
  detail: string;
}

export type IssueSeverity = "blocker" | "review" | "auto_fixed";

export interface IssueAction {
  label: string;
  /** Console route the action leads to, relative to the campaign. */
  href?: string;
  /** Buttons are primary actions; links are "Review"-style deep links. */
  kind: "button" | "link";
}

export interface Issue {
  id: string;
  severity: IssueSeverity;
  message: string;
  action?: IssueAction;
}

export interface CategoryCount {
  name: string;
  customers: number;
}

export interface CampaignSummary {
  lines: number;
  customers: number;
  ready: number;
  review: number;
  noEmail: number;
  units: number;
  skus: number;
  styles: number;
  reps: number;
  categories: CategoryCount[];
  productsPerCustomer: { one: number; two: number; threePlus: number };
  /** Share of sales lines, 0..1. */
  origin: { labGrown: number; natural: number };
}

export type CampaignStatus =
  | "draft"
  | "imported"
  | "mapped"
  | "curated"
  | "previewed"
  | "approved"
  | "synced"
  | "sent";

export interface Campaign {
  id: string;
  name: string;
  /** ISO date (yyyy-mm-dd) of the first and last day of last season's sales window. */
  seasonStart: string;
  seasonEnd: string;
  status: CampaignStatus;
  fileName?: string;
  createdAt: string;
  /** True for the built-in synthetic dataset. */
  isDemo?: boolean;
}
