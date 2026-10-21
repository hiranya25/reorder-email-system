import { createHash } from "node:crypto";

/**
 * A small client for the parts of the Mailchimp Marketing API the console uses.
 * https://mailchimp.com/developer/marketing/api/
 */

export class MailchimpError extends Error {
  constructor(
    public status: number,
    public title: string,
    public detail: string,
  ) {
    super(detail || title || `Mailchimp error ${status}`);
  }
}

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface MailchimpConfig {
  apiKey: string;
  /** Tests only: a fake Mailchimp. Defaults to the key's data centre, e.g. https://us21.api.mailchimp.com/3.0. */
  baseUrl?: string;
  fetch?: FetchLike;
  /** Waits between retries; tests pass a no-op. */
  sleep?: (ms: number) => Promise<void>;
}

/** "abc123-us21" -> "us21". */
export function dataCenter(apiKey: string): string {
  const dc = apiKey.trim().split("-").pop() ?? "";
  if (!/^[a-z]+\d+$/.test(dc) || !apiKey.includes("-")) throw new Error("The Mailchimp API key should end with its data centre, like …-us21.");
  return dc;
}

/** Mailchimp identifies a contact by the MD5 of the lower-cased address. */
export function subscriberHash(email: string): string {
  return createHash("md5").update(email.trim().toLowerCase()).digest("hex");
}

export type MemberStatus = "subscribed" | "unsubscribed" | "cleaned" | "pending" | "transactional" | "archived";

export interface MergeField {
  tag: string;
  name: string;
  type: string;
}

export interface CampaignSettings {
  subject: string;
  preheader: string;
  title: string;
  fromName: string;
  replyTo: string;
}

export class MailchimpClient {
  private base: string;
  private auth: string;
  private fetchFn: FetchLike;
  private sleep: (ms: number) => Promise<void>;

  constructor(config: MailchimpConfig) {
    this.base = (config.baseUrl ?? `https://${dataCenter(config.apiKey)}.api.mailchimp.com/3.0`).replace(/\/+$/, "");
    this.auth = `Basic ${Buffer.from(`reorder:${config.apiKey.trim()}`).toString("base64")}`;
    this.fetchFn = config.fetch ?? (fetch as unknown as FetchLike);
    this.sleep = config.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  /** One API call. Retries when Mailchimp is busy (429) or briefly unavailable (5xx). */
  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      let res: Awaited<ReturnType<FetchLike>>;
      try {
        res = await this.fetchFn(`${this.base}${path}`, {
          method,
          headers: { authorization: this.auth, "content-type": "application/json", accept: "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
      } catch (e) {
        if (attempt < 3) {
          await this.sleep(500 * 2 ** attempt);
          continue;
        }
        throw new MailchimpError(0, "Network error", `Couldn't reach Mailchimp: ${(e as Error).message}`);
      }
      if ((res.status === 429 || res.status >= 500) && attempt < 3) {
        await this.sleep(1000 * 2 ** attempt);
        continue;
      }
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) throw new MailchimpError(res.status, String(data.title ?? ""), String(data.detail ?? ""));
      return data as T;
    }
  }

  async ping(): Promise<void> {
    await this.request("GET", "/ping");
  }

  async getList(listId: string): Promise<{ id: string; name: string; memberCount: number }> {
    const l = await this.request<{ id: string; name: string; stats?: { member_count?: number } }>("GET", `/lists/${listId}?fields=id,name,stats.member_count`);
    return { id: l.id, name: l.name, memberCount: l.stats?.member_count ?? 0 };
  }

  async listMergeFields(listId: string): Promise<MergeField[]> {
    const r = await this.request<{ merge_fields: MergeField[] }>("GET", `/lists/${listId}/merge-fields?count=1000&fields=merge_fields.tag,merge_fields.name,merge_fields.type`);
    return r.merge_fields ?? [];
  }

  async createMergeField(listId: string, field: { tag: string; name: string }): Promise<void> {
    await this.request("POST", `/lists/${listId}/merge-fields`, { tag: field.tag, name: field.name, type: "text", required: false, public: false });
  }

  /** The contact's status, or undefined when the address isn't in the audience. */
  async getMemberStatus(listId: string, email: string): Promise<MemberStatus | undefined> {
    try {
      const m = await this.request<{ status: MemberStatus }>("GET", `/lists/${listId}/members/${subscriberHash(email)}?fields=status`);
      return m.status;
    } catch (e) {
      if (e instanceof MailchimpError && e.status === 404) return undefined;
      throw e;
    }
  }

  /**
   * Writes the merge fields. An existing contact keeps their status; `addAsSubscribed` adds a new
   * address as subscribed (never used for someone who unsubscribed: they already exist).
   */
  async upsertMember(listId: string, email: string, fields: Record<string, string>, opts: { addAsSubscribed?: boolean } = {}): Promise<void> {
    await this.request("PUT", `/lists/${listId}/members/${subscriberHash(email)}`, {
      email_address: email,
      ...(opts.addAsSubscribed ? { status_if_new: "subscribed" } : { status_if_new: "transactional" }),
      merge_fields: fields,
    });
  }

  /** The static segment (Mailchimp "tag") with this name, created if needed. */
  async findOrCreateSegment(listId: string, name: string): Promise<number> {
    const r = await this.request<{ segments: { id: number; name: string }[] }>("GET", `/lists/${listId}/segments?type=static&count=1000&fields=segments.id,segments.name`);
    const found = r.segments?.find((s) => s.name === name);
    if (found) return found.id;
    const created = await this.request<{ id: number }>("POST", `/lists/${listId}/segments`, { name, static_segment: [] });
    return created.id;
  }

  async segmentMembers(listId: string, segmentId: number): Promise<string[]> {
    const emails: string[] = [];
    for (let offset = 0; ; offset += 1000) {
      const r = await this.request<{ members: { email_address: string }[]; total_items: number }>(
        "GET",
        `/lists/${listId}/segments/${segmentId}/members?count=1000&offset=${offset}&fields=members.email_address,total_items`,
      );
      emails.push(...(r.members ?? []).map((m) => m.email_address.toLowerCase()));
      if (!r.members?.length || emails.length >= r.total_items) return emails;
    }
  }

  /** Makes the segment hold exactly these addresses. */
  async setSegmentMembers(listId: string, segmentId: number, emails: string[]): Promise<void> {
    const want = new Set(emails.map((e) => e.toLowerCase()));
    const have = new Set(await this.segmentMembers(listId, segmentId));
    const add = [...want].filter((e) => !have.has(e));
    const remove = [...have].filter((e) => !want.has(e));
    for (let i = 0; i < Math.max(add.length, remove.length); i += 500) {
      await this.request("POST", `/lists/${listId}/segments/${segmentId}`, { members_to_add: add.slice(i, i + 500), members_to_remove: remove.slice(i, i + 500) });
    }
  }

  async createCampaign(listId: string, segmentId: number, s: CampaignSettings): Promise<string> {
    const c = await this.request<{ id: string }>("POST", "/campaigns", {
      type: "regular",
      recipients: { list_id: listId, segment_opts: { saved_segment_id: segmentId } },
      settings: { subject_line: s.subject, preview_text: s.preheader, title: s.title, from_name: s.fromName, reply_to: s.replyTo },
    });
    return c.id;
  }

  async updateCampaign(campaignId: string, listId: string, segmentId: number, s: CampaignSettings): Promise<void> {
    await this.request("PATCH", `/campaigns/${campaignId}`, {
      recipients: { list_id: listId, segment_opts: { saved_segment_id: segmentId } },
      settings: { subject_line: s.subject, preview_text: s.preheader, title: s.title, from_name: s.fromName, reply_to: s.replyTo },
    });
  }

  async setContent(campaignId: string, html: string): Promise<void> {
    await this.request("PUT", `/campaigns/${campaignId}/content`, { html });
  }

  async sendTest(campaignId: string, emails: string[]): Promise<void> {
    await this.request("POST", `/campaigns/${campaignId}/actions/test`, { test_emails: emails, send_type: "html" });
  }

  async send(campaignId: string): Promise<void> {
    await this.request("POST", `/campaigns/${campaignId}/actions/send`);
  }

  async getCampaign(campaignId: string): Promise<{ status: string; recipients: number; emailsSent: number }> {
    const c = await this.request<{ status: string; recipients?: { recipient_count?: number }; emails_sent?: number }>(
      "GET",
      `/campaigns/${campaignId}?fields=status,recipients.recipient_count,emails_sent`,
    );
    return { status: c.status, recipients: c.recipients?.recipient_count ?? 0, emailsSent: c.emails_sent ?? 0 };
  }
}
