import type {
  Campaign,
  CatalogRecord,
  Decision,
  ImportRecord,
  NamedMapping,
  RecommendationPicks,
  RememberedContact,
  ReviewRules,
} from "@reorder/core";
import type { Brand, ReorderSetting } from "@reorder/email";

export interface Settings {
  brand: Brand;
  reorder: ReorderSetting;
  /** Team addresses for test sends once Mailchimp is connected. */
  testEmails: string[];
  /** Different people who must approve before export or send. */
  requiredApprovals: number;
}

export interface Approver {
  userId: string;
  name: string;
  at: string;
}

export interface ApprovalInfo {
  approvers: Approver[];
  required: number;
  exportedAt?: string;
}

/** Outcome for one address in Mailchimp. */
export type MailchimpContactResult = "synced" | "new" | "unsubscribed" | "bounced" | "not_subscribed" | "failed";

/** One round of sending (usually only one; see mailchimp_runs). */
export interface MailchimpWave {
  wave: number;
  tag: string;
  /** Addresses planned for this round. */
  planned: number;
  status: "idle" | "syncing" | "synced" | "test_sent" | "sending" | "sent" | "failed";
  step?: string;
  error?: string;
  counts: Partial<Record<MailchimpContactResult, number>>;
  /** Addresses checked so far. */
  checked: number;
  /** Contacts in the round's segment, who get the email. */
  recipients?: number;
  testSentAt?: string;
  sentAt?: string;
  sentBy?: string;
  mcCampaignId?: string;
  /** Addresses that won't get it as things stand (new, unsubscribed, bounced, failed). */
  attention: { email: string; company: string; accountId: string; result: MailchimpContactResult; error?: string }[];
}

export interface MailchimpOverview {
  /** MAILCHIMP_API_KEY and MAILCHIMP_AUDIENCE_ID are set. */
  configured: boolean;
  /** The demo campaign can't be sent. */
  demo: boolean;
  waves: MailchimpWave[];
}

export interface AuditEntry {
  id: string;
  at: string;
  by: string;
  campaignId?: string;
  action: string;
  detail?: string;
}

export type ProductEditMaps = Record<"real" | "demo", { successor: Record<string, string>; displayName: Record<string, string> }>;

/** Shared data every console page needs; loaded once per page load by the console layout. */
export interface WorkspaceSnapshot {
  campaigns: Campaign[];
  settings: Settings;
  rules: ReviewRules;
  savedMappings: Record<string, NamedMapping>;
  catalog?: CatalogRecord;
  demoCatalogLoaded: boolean;
  productEdits: ProductEditMaps;
  remembered: Record<string, RememberedContact>;
}

/** One campaign's review data; loaded by the campaign layout. */
export interface CampaignSnapshot {
  campaignId: string;
  importRecord?: ImportRecord;
  decisions: Record<string, Decision>;
  hidden: string[];
  productsConfirmed?: { at: string; by: string };
  picks?: RecommendationPicks;
  approval: ApprovalInfo;
  audit: AuditEntry[];
}

/** Result of every server action that changes data. */
export type ActionResult = { ok: true } | { ok: false; error: string };

export function isLocked(a: ApprovalInfo | undefined): boolean {
  return !!a && a.approvers.length > 0;
}

export function isFullyApproved(a: ApprovalInfo | undefined): boolean {
  return !!a && a.approvers.length >= a.required;
}
