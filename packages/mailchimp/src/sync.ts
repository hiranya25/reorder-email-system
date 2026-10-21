import { createHash } from "node:crypto";
import { campaignTag, MERGE_FIELD_DEFS, mergeFields, type EmailModel, type MergeFieldGroup } from "@reorder/email";
import { MailchimpError, type MailchimpClient } from "./client";

/** One address getting one customer's email. */
export interface PlannedContact {
  email: string;
  accountId: string;
  company: string;
  /**
   * A Mailchimp contact holds one set of fields, so an address shared by two customers gets the
   * second customer's email in a second round ("wave"), after the first is sent.
   */
  wave: number;
  fields: Record<string, string>;
  /** Changes when any field changes, so unchanged contacts aren't written again. */
  hash: string;
}

export function planContacts(emails: EmailModel[]): PlannedContact[] {
  const seen = new Map<string, number>();
  const out: PlannedContact[] = [];
  for (const m of emails) {
    const fields = mergeFields(m);
    const hash = createHash("sha256").update(JSON.stringify(Object.entries(fields).sort())).digest("hex").slice(0, 32);
    for (const raw of m.to) {
      const email = raw.trim().toLowerCase();
      const wave = (seen.get(email) ?? 0) + 1;
      seen.set(email, wave);
      out.push({ email, accountId: m.accountId, company: m.company, wave, fields, hash });
    }
  }
  return out;
}

/** Tag for one round: "reorder-HOLIDAY-2025", then "reorder-HOLIDAY-2025-2", … */
export function waveTag(seasonCode: string, wave: number): string {
  return wave === 1 ? campaignTag(seasonCode) : `${campaignTag(seasonCode)}-${wave}`;
}

export class MailchimpSetupError extends Error {}

/**
 * Creates the audience fields the email needs. Returns the tags that now exist, so only those are
 * written and referenced.
 */
export async function ensureMergeFields(client: MailchimpClient, listId: string, groups: ReadonlySet<MergeFieldGroup>): Promise<{ tags: Set<string>; created: string[] }> {
  const existing = new Map((await client.listMergeFields(listId)).map((f) => [f.tag.toUpperCase(), f]));
  const needed = MERGE_FIELD_DEFS.filter((d) => groups.has(d.group));
  const wrongType = needed.filter((d) => existing.has(d.tag) && !["text", "url"].includes(existing.get(d.tag)!.type));
  if (wrongType.length) {
    throw new MailchimpSetupError(`These Mailchimp audience fields exist but aren't text fields: ${wrongType.map((d) => d.tag).join(", ")}. Change them to text in Mailchimp, or delete them so the console can recreate them.`);
  }
  const missing = needed.filter((d) => !existing.has(d.tag));
  const created: string[] = [];
  for (const d of missing) {
    try {
      await client.createMergeField(listId, d);
      created.push(d.tag);
    } catch (e) {
      if (e instanceof MailchimpError && e.status === 400) {
        throw new MailchimpSetupError(
          `Mailchimp wouldn't add the field ${d.tag} (${e.message}). Your audience may be out of field slots: the console needs ${missing.length - created.length} more. In Mailchimp, delete audience fields you no longer use (Audience → Settings → Audience fields and *|MERGE|* tags), then try again.`,
        );
      }
      throw e;
    }
  }
  return { tags: new Set(needed.map((d) => d.tag)), created };
}

export type ContactResult = "synced" | "new" | "unsubscribed" | "bounced" | "not_subscribed" | "failed";

export interface ContactOutcome {
  result: ContactResult;
  error?: string;
}

async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await fn(items[next++]!);
  });
  await Promise.all(workers);
}

function only(fields: Record<string, string>, tags: ReadonlySet<string>): Record<string, string> {
  return Object.fromEntries(Object.entries(fields).filter(([k]) => tags.has(k)));
}

/**
 * Writes each subscribed contact's fields. New addresses are only reported (an admin decides);
 * unsubscribed or bounced contacts are never written to or emailed.
 */
export async function syncContacts(
  client: MailchimpClient,
  listId: string,
  contacts: PlannedContact[],
  opts: {
    tags: ReadonlySet<string>;
    /** Results from an earlier run: contacts already written with the same fields are skipped. */
    previous?: Map<string, { result: ContactResult; hash: string }>;
    concurrency?: number;
    onResult: (c: PlannedContact, outcome: ContactOutcome) => Promise<void> | void;
  },
): Promise<void> {
  await mapLimit(contacts, opts.concurrency ?? 5, async (c) => {
    const before = opts.previous?.get(c.email);
    if (before?.result === "synced" && before.hash === c.hash) return void (await opts.onResult(c, { result: "synced" }));
    let outcome: ContactOutcome;
    try {
      const status = await client.getMemberStatus(listId, c.email);
      if (status === undefined) outcome = { result: "new" };
      else if (status === "subscribed") {
        await client.upsertMember(listId, c.email, only(c.fields, opts.tags));
        outcome = { result: "synced" };
      } else outcome = { result: status === "unsubscribed" ? "unsubscribed" : status === "cleaned" ? "bounced" : "not_subscribed" };
    } catch (e) {
      outcome = { result: "failed", error: (e as Error).message.slice(0, 300) };
    }
    await opts.onResult(c, outcome);
  });
}

/** An admin's choice: add these new addresses to the audience as subscribed, with their fields. */
export async function addNewContacts(
  client: MailchimpClient,
  listId: string,
  contacts: PlannedContact[],
  opts: { tags: ReadonlySet<string>; concurrency?: number; onResult: (c: PlannedContact, outcome: ContactOutcome) => Promise<void> | void },
): Promise<void> {
  await mapLimit(contacts, opts.concurrency ?? 5, async (c) => {
    let outcome: ContactOutcome;
    try {
      // Re-check: if they exist now (e.g. they unsubscribed meanwhile), don't touch their status.
      const status = await client.getMemberStatus(listId, c.email);
      if (status !== undefined && status !== "subscribed") outcome = { result: status === "unsubscribed" ? "unsubscribed" : status === "cleaned" ? "bounced" : "not_subscribed" };
      else {
        await client.upsertMember(listId, c.email, only(c.fields, opts.tags), { addAsSubscribed: true });
        outcome = { result: "synced" };
      }
    } catch (e) {
      outcome = { result: "failed", error: (e as Error).message.slice(0, 300) };
    }
    await opts.onResult(c, outcome);
  });
}
