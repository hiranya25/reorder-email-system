import type { CustomerRecord, EmailCheck, ReviewReason } from "./import/types";

/** What the reviewer decided for one account in one campaign. */
export interface Decision {
  /** "undecided" records an explicit undo, which also overrides a remembered approval. */
  status: "approved" | "excluded" | "undecided";
  /** Addresses that will receive the email (approved only). */
  emails: string[];
  decidedAt: string;
  decidedBy: string;
}

/** Approved address kept across seasons, so returning customers are approved automatically. */
export interface RememberedContact {
  emails: string[];
  approvedAt: string;
  campaignId: string;
}

export type EffectiveStatus = "approved" | "excluded" | "pending";

export interface MappingRow {
  customer: CustomerRecord;
  status: EffectiveStatus;
  /** Addresses that will receive the email; empty unless approved. */
  emails: string[];
  /** "remembered" = approved in an earlier season and still valid. */
  source: "manual" | "remembered" | "none";
}

export type MappingFilter = "generic" | "shared" | "multi" | "large" | "no_email";

/**
 * Applies this campaign's decisions, then remembered approvals from earlier seasons.
 * A remembered approval only applies when its addresses are still in the file
 * (or the file has no email for the account), so a changed email gets reviewed again.
 */
export function resolveMapping(
  customers: CustomerRecord[],
  decisions: Record<string, Decision>,
  remembered: Record<string, RememberedContact>,
  options: { useRemembered: boolean; campaignId: string },
): MappingRow[] {
  return customers.map((customer) => {
    const d = decisions[customer.accountId];
    if (d && d.status !== "undecided") {
      return { customer, status: d.status, emails: d.status === "approved" ? d.emails : [], source: "manual" };
    }
    const r = options.useRemembered && !d ? remembered[customer.accountId] : undefined;
    if (r && r.campaignId !== options.campaignId && r.emails.length) {
      const stillValid = customer.emails.length === 0 || r.emails.every((e) => customer.emails.includes(e));
      if (stillValid) return { customer, status: "approved", emails: r.emails, source: "remembered" };
    }
    return { customer, status: "pending", emails: [], source: "none" };
  });
}

export function mappingCounts(rows: MappingRow[]) {
  const count = (fn: (r: MappingRow) => boolean) => rows.filter(fn).length;
  return {
    total: rows.length,
    approved: count((r) => r.status === "approved"),
    excluded: count((r) => r.status === "excluded"),
    pending: count((r) => r.status === "pending"),
    byCheck: {
      ready: count((r) => r.customer.check === "ready"),
      review: count((r) => r.customer.check === "review"),
      no_email: count((r) => r.customer.check === "no_email"),
    } satisfies Record<EmailCheck, number>,
  };
}

const FILTER_REASON: Partial<Record<MappingFilter, ReviewReason>> = {
  generic: "generic_inbox",
  shared: "shared_email",
  multi: "multi_email",
};

export function matchesFilter(c: CustomerRecord, filter: MappingFilter): boolean {
  if (filter === "large") return c.large;
  if (filter === "no_email") return c.check === "no_email";
  return c.reasons.includes(FILTER_REASON[filter]!);
}

export const FILTER_LABELS: Record<MappingFilter, string> = {
  generic: "Generic inbox",
  shared: "Shared email",
  multi: "Two emails in one field",
  large: "Large accounts",
  no_email: "No email",
};

/** The other account's name relative to this one: "Joyeria Universal Branch 1" -> "Branch 1". */
function relativeName(own: string, other: string): string {
  return other.toLowerCase().startsWith(own.toLowerCase() + " ") ? other.slice(own.length + 1) : other;
}

/** One-line explanation under the READY / REVIEW / NO EMAIL chip, as in the mockup. */
export function checkReason(c: CustomerRecord, genericLocalParts: string[]): string {
  const parts: string[] = [];
  if (c.check === "ready") parts.push("One clear email on file");
  if (c.check === "no_email") parts.push(c.invalidEmails.length ? `Email couldn't be read (${c.invalidEmails[0]})` : "No email in sales data");
  if (c.reasons.includes("multi_email")) parts.push(c.emails.length === 2 ? "Two emails in one field" : `${c.emails.length} emails in one field`);
  if (c.reasons.includes("shared_email")) {
    const others = c.sharedWith.map((s) => `${relativeName(c.name, s.name)} (${s.accountId})`);
    parts.push(`Email shared with ${others.join(", ")}`);
  }
  if (c.reasons.includes("generic_inbox")) {
    const generic = new Set(genericLocalParts);
    const local = c.emails.map((e) => e.split("@")[0]!).find((l) => generic.has(l));
    parts.push(`Generic inbox (${local}@)`);
  }
  if (c.reasons.includes("invalid_email") && c.check !== "no_email") parts.push(`Unreadable address ignored (${c.invalidEmails[0]})`);
  if (c.large) parts.push("large account");
  return parts.join(" · ");
}
