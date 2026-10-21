import { buildEmailModel, groupsInUse } from "@reorder/email";
import type { CustomerItem, CustomerRecord } from "@reorder/core";
import { describe, expect, it } from "vitest";
import { dataCenter, MailchimpClient, MailchimpError, subscriberHash } from "./client";
import { fakeFetch, newFakeState, seedMember, type FakeState } from "./fake";
import { addNewContacts, ensureMergeFields, MailchimpSetupError, planContacts, syncContacts, waveTag, type ContactOutcome, type PlannedContact } from "./sync";

const item = (sku: string, name: string, qty: number): CustomerItem => ({ sku, name, category: "Rings", origin: "Natural", qty, lines: 1, lastPeriod: { year: 2025, month: 12 } });
const customer = (id: string, emails: string[]): CustomerRecord => ({
  accountId: id, name: `Store ${id}`, emails, rep: "JYOTI", items: [item(`R${id}-14W`, `Ring ${id}`, 3)],
  units: 3, lines: 1, check: "ready", reasons: [], sharedWith: [], invalidEmails: [], large: false,
});
const model = (id: string, emails: string[]) => buildEmailModel({ customer: customer(id, emails), emails, campaignName: "Holiday 2026 Reorder", seasonStart: "2025-10-01" });

function setup(): { state: FakeState; client: MailchimpClient } {
  const state = newFakeState("list1");
  const client = new MailchimpClient({ apiKey: "abc-us21", fetch: fakeFetch(state), baseUrl: "https://fake/3.0", sleep: async () => {} });
  return { state, client };
}

async function collect(run: (onResult: (c: PlannedContact, o: ContactOutcome) => void) => Promise<void>) {
  const out: Record<string, ContactOutcome["result"]> = {};
  await run((c, o) => void (out[c.email] = o.result));
  return out;
}

describe("client basics", () => {
  it("reads the data centre from the key and hashes addresses like Mailchimp", () => {
    expect(dataCenter("0123abcd-us21")).toBe("us21");
    expect(() => dataCenter("no-dash-here!")).toThrow(/data centre/);
    expect(() => dataCenter("nodash")).toThrow(/data centre/);
    expect(subscriberHash(" Urist.McVankab@Freddiesjokes.com ")).toBe("62eeb292278cc15f5817cb78f7790b08");
  });

  it("retries when Mailchimp is busy, then gives a readable error", async () => {
    const { state, client } = setup();
    state.failNext.set("/ping", 2);
    await client.ping();
    expect(state.calls.get("GET /ping")).toBe(3);
    await expect(client.getList("nope")).rejects.toBeInstanceOf(MailchimpError);
    expect((await client.getList("list1")).name).toBe("AMIPI Core");
  });
});

describe("planning", () => {
  it("sends a shared address the second customer's email in a second wave", () => {
    const plan = planContacts([model("1", ["Shared@x.com", "a@x.com"]), model("2", ["shared@x.com"])]);
    expect(plan.map((p) => [p.email, p.accountId, p.wave])).toEqual([["shared@x.com", "1", 1], ["a@x.com", "1", 1], ["shared@x.com", "2", 2]]);
    expect(plan[0]!.fields.RCITEM1).toBe("Ring 1");
    expect(plan[0]!.fields.RCITEM1D).toContain("You ordered 3");
    expect(waveTag("HOLIDAY-2025", 1)).toBe("reorder-HOLIDAY-2025");
    expect(waveTag("HOLIDAY-2025", 2)).toBe("reorder-HOLIDAY-2025-2");
  });
});

describe("audience fields", () => {
  it("creates only what's missing, and explains a full audience", async () => {
    const { state, client } = setup();
    state.mergeFields.push({ tag: "RCGREET", name: "old", type: "text" });
    const { tags, created } = await ensureMergeFields(client, "list1", groupsInUse([model("1", ["a@x.com"])]));
    expect(tags.size).toBe(10);
    expect(created).toHaveLength(9);
    expect((await ensureMergeFields(client, "list1", new Set(["core"]))).created).toEqual([]);

    const full = setup();
    full.state.maxFields = 8;
    await expect(ensureMergeFields(full.client, "list1", new Set(["core"]))).rejects.toThrow(/out of field slots: the console needs 4 more/);
    const wrong = setup();
    wrong.state.mergeFields.push({ tag: "RCMORE", name: "x", type: "number" });
    await expect(ensureMergeFields(wrong.client, "list1", new Set(["core"]))).rejects.toBeInstanceOf(MailchimpSetupError);
  });
});

describe("contacts", () => {
  it("writes subscribers, reports new ones and never touches unsubscribed or bounced", async () => {
    const { state, client } = setup();
    const { tags } = await ensureMergeFields(client, "list1", new Set(["core"]));
    seedMember(state, "sub@x.com");
    seedMember(state, "gone@x.com", "unsubscribed");
    seedMember(state, "bounce@x.com", "cleaned");
    const plan = planContacts([model("1", ["sub@x.com", "new@x.com"]), model("2", ["gone@x.com"]), model("3", ["bounce@x.com"])]);
    const results = await collect((onResult) => syncContacts(client, "list1", plan, { tags, onResult }));
    expect(results).toEqual({ "sub@x.com": "synced", "new@x.com": "new", "gone@x.com": "unsubscribed", "bounce@x.com": "bounced" });
    expect(state.members.get(subscriberHash("sub@x.com"))!.merge.RCITEM1).toBe("Ring 1");
    // Only fields that exist in the audience are written.
    expect(Object.keys(state.members.get(subscriberHash("sub@x.com"))!.merge).sort()).toEqual([...tags].sort());
    expect(state.members.get(subscriberHash("gone@x.com"))!.merge).toEqual({});
    expect(state.members.has(subscriberHash("new@x.com"))).toBe(false);

    // A second run skips contacts already written with the same fields.
    const puts = state.calls.get("PUT /lists/list1/members/:hash");
    await syncContacts(client, "list1", plan, { tags, previous: new Map([["sub@x.com", { result: "synced", hash: plan[0]!.hash }]]), onResult: () => {} });
    expect(state.calls.get("PUT /lists/list1/members/:hash")).toBe(puts);

    // The admin adds the new address; it's subscribed with its fields.
    const added = await collect((onResult) => addNewContacts(client, "list1", plan.filter((p) => p.email === "new@x.com"), { tags, onResult }));
    expect(added).toEqual({ "new@x.com": "synced" });
    expect(state.members.get(subscriberHash("new@x.com"))).toMatchObject({ status: "subscribed", merge: { RCGREET: "Store 1 team" } });
  });

  it("records failures per contact instead of stopping", async () => {
    const { state, client } = setup();
    const { tags } = await ensureMergeFields(client, "list1", new Set(["core"]));
    seedMember(state, "a@x.com");
    state.failNext.set("/lists/list1/members/:hash", 10);
    const results = await collect((onResult) => syncContacts(client, "list1", planContacts([model("1", ["a@x.com"])]), { tags, onResult }));
    expect(results).toEqual({ "a@x.com": "failed" });
  });
});

describe("segment and campaign", () => {
  it("keeps the segment exactly in step and sends to it", async () => {
    const { state, client } = setup();
    for (const e of ["a@x.com", "b@x.com", "c@x.com"]) seedMember(state, e);
    const seg = await client.findOrCreateSegment("list1", "reorder-HOLIDAY-2025");
    expect(await client.findOrCreateSegment("list1", "reorder-HOLIDAY-2025")).toBe(seg);
    await client.setSegmentMembers("list1", seg, ["a@x.com", "b@x.com"]);
    await client.setSegmentMembers("list1", seg, ["B@x.com", "c@x.com"]);
    expect((await client.segmentMembers("list1", seg)).sort()).toEqual(["b@x.com", "c@x.com"]);

    const settings = { subject: "Restock", preheader: "p", title: "Holiday", fromName: "AMIPI INC", replyTo: "salesgroup@amipi.com" };
    const id = await client.createCampaign("list1", seg, settings);
    await client.setContent(id, "<html>*|RCGREET|*</html>");
    await client.sendTest(id, ["team@amipi.com"]);
    expect(await client.getCampaign(id)).toEqual({ status: "save", recipients: 2, emailsSent: 0 });
    await client.send(id);
    expect(state.campaigns.get(id)).toMatchObject({ status: "sent", sentTo: ["b@x.com", "c@x.com"], tests: [["team@amipi.com"]] });
    await expect(client.send(id)).rejects.toThrow(/already sent/);
  });
});
