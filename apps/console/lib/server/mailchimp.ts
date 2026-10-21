import "server-only";

import { DEMO_CAMPAIGN } from "@reorder/core";
import { mailchimpContacts, mailchimpRuns } from "@reorder/db";
import { campaignPreheader, groupsInUse, MERGE_FIELD_DEFS, renderMailchimpTemplate, type EmailModel, type MergeFieldGroup } from "@reorder/email";
import {
  addNewContacts,
  ensureMergeFields,
  MailchimpClient,
  MailchimpError,
  MailchimpSetupError,
  planContacts,
  syncContacts,
  waveTag,
  type ContactOutcome,
  type ContactResult,
  type PlannedContact,
} from "@reorder/mailchimp";
import { and, eq, inArray, sql } from "drizzle-orm";
import { deriveCampaign, sendListFor } from "@/lib/derive";
import type { MailchimpOverview, MailchimpWave } from "@/lib/types";
import { serverEnv } from "./env";
import { audit, db, loadCampaignSnapshot, loadWorkspace, RepoError } from "./repo";

/** A step that hasn't reported for this long is treated as stopped (e.g. the server restarted). */
const STALE_MS = 2 * 60_000;

export function mailchimpClient(): MailchimpClient {
  const mc = serverEnv().mailchimp;
  if (!mc) throw new RepoError("Mailchimp isn't connected yet. Add MAILCHIMP_API_KEY and MAILCHIMP_AUDIENCE_ID to the server settings.");
  return new MailchimpClient({ apiKey: mc.apiKey, baseUrl: mc.baseUrl });
}

/** For Settings: is the key valid, and which audience is it? */
export async function testConnection(): Promise<{ ok: true; audience: string; members: number; fields: number } | { ok: false; error: string }> {
  try {
    const client = mailchimpClient();
    await client.ping();
    const listId = serverEnv().mailchimp!.audienceId;
    const list = await client.getList(listId);
    const fields = await client.listMergeFields(listId);
    return { ok: true, audience: list.name, members: list.memberCount, fields: fields.length };
  } catch (e) {
    if (e instanceof MailchimpError) {
      if (e.status === 401) return { ok: false, error: "Mailchimp refused the API key. Check MAILCHIMP_API_KEY." };
      if (e.status === 404) return { ok: false, error: "Mailchimp has no audience with that ID. Check MAILCHIMP_AUDIENCE_ID." };
      return { ok: false, error: `Mailchimp said: ${e.message}` };
    }
    return { ok: false, error: (e as Error).message };
  }
}

/** The approved emails for a campaign, exactly as the Approve page shows them. */
async function approvedEmails(campaignId: string): Promise<{ name: string; emails: EmailModel[]; fullyApproved: boolean }> {
  if (campaignId === DEMO_CAMPAIGN.id) throw new RepoError("The demo campaign uses made-up customers, so it can't be sent through Mailchimp.");
  const ws = await loadWorkspace();
  const cs = await loadCampaignSnapshot(campaignId);
  const row = ws.campaigns.find((c) => c.id === campaignId);
  if (!cs || !row) throw new RepoError("This campaign no longer exists.");
  const data = deriveCampaign(row, ws, cs);
  return { name: row.name, emails: sendListFor(data).emails, fullyApproved: data.fullyApproved };
}

function plansByWave(emails: EmailModel[]): Map<number, PlannedContact[]> {
  const waves = new Map<number, PlannedContact[]>();
  for (const p of planContacts(emails)) waves.set(p.wave, [...(waves.get(p.wave) ?? []), p]);
  return waves;
}

function modelsForWave(emails: EmailModel[], plan: PlannedContact[]): EmailModel[] {
  const ids = new Set(plan.map((p) => p.accountId));
  return emails.filter((e) => ids.has(e.accountId));
}

async function getRun(campaignId: string, wave: number) {
  const [row] = await db().select().from(mailchimpRuns).where(and(eq(mailchimpRuns.campaignId, campaignId), eq(mailchimpRuns.wave, wave)));
  return row;
}

async function setRun(campaignId: string, wave: number, patch: Partial<typeof mailchimpRuns.$inferInsert>) {
  await db()
    .insert(mailchimpRuns)
    .values({ campaignId, wave, ...patch, updatedAt: new Date() })
    .onConflictDoUpdate({ target: [mailchimpRuns.campaignId, mailchimpRuns.wave], set: { ...patch, updatedAt: new Date() } });
}

async function saveContact(campaignId: string, wave: number, c: PlannedContact, o: ContactOutcome) {
  const values = { result: o.result, error: o.error ?? null, fieldsHash: o.result === "synced" ? c.hash : null, accountId: c.accountId, company: c.company, updatedAt: new Date() };
  await db()
    .insert(mailchimpContacts)
    .values({ campaignId, wave, email: c.email, ...values })
    .onConflictDoUpdate({ target: [mailchimpContacts.campaignId, mailchimpContacts.wave, mailchimpContacts.email], set: values });
}

function isBusy(run: { status: string; updatedAt: Date } | undefined): boolean {
  return !!run && (run.status === "syncing" || run.status === "sending") && Date.now() - run.updatedAt.getTime() < STALE_MS;
}

/** Everything the Approve page shows about sending through Mailchimp. */
export async function mailchimpOverview(campaignId: string): Promise<MailchimpOverview> {
  const env = serverEnv();
  if (campaignId === DEMO_CAMPAIGN.id) return { configured: !!env.mailchimp, demo: true, waves: [] };
  const { emails } = await approvedEmails(campaignId);
  const plans = plansByWave(emails);
  const runs = await db().select().from(mailchimpRuns).where(eq(mailchimpRuns.campaignId, campaignId));
  const contacts = await db().select().from(mailchimpContacts).where(eq(mailchimpContacts.campaignId, campaignId));
  const waveNumbers = [...new Set([...plans.keys(), ...runs.map((r) => r.wave)])].sort((a, b) => a - b);
  const waves: MailchimpWave[] = waveNumbers.map((wave) => {
    const run = runs.find((r) => r.wave === wave);
    const planned = plans.get(wave) ?? [];
    const plannedEmails = new Set(planned.map((p) => p.email));
    const rows = contacts.filter((c) => c.wave === wave && (plannedEmails.has(c.email) || run?.status === "sent"));
    const counts: Partial<Record<ContactResult, number>> = {};
    for (const r of rows) counts[r.result as ContactResult] = (counts[r.result as ContactResult] ?? 0) + 1;
    const stale = run && (run.status === "syncing" || run.status === "sending") && !isBusy(run);
    return {
      wave,
      tag: emails[0] ? waveTag(emails[0].seasonCode, wave) : "",
      planned: planned.length,
      status: stale ? "failed" : (run?.status ?? "idle"),
      step: run?.step ?? undefined,
      error: stale ? "This step stopped before finishing (the server may have restarted). Run it again; finished contacts are skipped." : (run?.error ?? undefined),
      counts,
      checked: rows.length,
      recipients: run?.recipients ?? undefined,
      testSentAt: run?.testSentAt?.toISOString(),
      sentAt: run?.sentAt?.toISOString(),
      sentBy: run?.sentBy ?? undefined,
      mcCampaignId: run?.mcCampaignId ?? undefined,
      attention: rows
        .filter((r) => r.result !== "synced")
        .map((r) => ({ email: r.email, company: r.company, accountId: r.accountId, result: r.result as ContactResult, error: r.error ?? undefined }))
        .sort((a, b) => a.result.localeCompare(b.result) || a.company.localeCompare(b.company)),
    };
  });
  return { configured: !!env.mailchimp, demo: false, waves };
}

async function guard(campaignId: string, wave: number, opts: { needs?: ("synced" | "test_sent")[] } = {}) {
  const info = await approvedEmails(campaignId);
  if (!info.fullyApproved) throw new RepoError("The campaign needs all its approvals before it can go to Mailchimp.");
  const plans = plansByWave(info.emails);
  const plan = plans.get(wave);
  if (!plan?.length) throw new RepoError(`There's no round ${wave} for this campaign.`);
  if (wave > 1 && (await getRun(campaignId, wave - 1))?.status !== "sent") {
    throw new RepoError(`Send round ${wave - 1} first. Round ${wave} reuses the same addresses with a different customer's products.`);
  }
  const run = await getRun(campaignId, wave);
  if (run?.status === "sent") throw new RepoError("This round has already been sent.");
  if (isBusy(run)) throw new RepoError("Mailchimp is still working on this round. Wait for it to finish.");
  if (opts.needs && !opts.needs.includes((run?.status ?? "idle") as "synced")) throw new RepoError("Update the contacts in Mailchimp first.");
  return { ...info, plan, run };
}

/** Keeps the round's segment holding exactly the contacts that will get the email. */
async function refreshSegment(client: MailchimpClient, campaignId: string, wave: number, plan: PlannedContact[], seasonCode: string) {
  const listId = serverEnv().mailchimp!.audienceId;
  const rows = await db()
    .select({ email: mailchimpContacts.email })
    .from(mailchimpContacts)
    .where(and(eq(mailchimpContacts.campaignId, campaignId), eq(mailchimpContacts.wave, wave), eq(mailchimpContacts.result, "synced")));
  const planned = new Set(plan.map((p) => p.email));
  const synced = rows.map((r) => r.email).filter((e) => planned.has(e));
  const segmentId = await client.findOrCreateSegment(listId, waveTag(seasonCode, wave));
  await client.setSegmentMembers(listId, segmentId, synced);
  return { segmentId, recipients: synced.length };
}

const running = new Set<string>();

/**
 * Step 1: makes the audience fields, writes each subscribed contact's products and fills the
 * round's segment. Runs in the background; the page polls mailchimpOverview().
 */
export async function startSync(campaignId: string, wave: number, user: { id: string; name: string }) {
  const { plan, emails, name } = await guard(campaignId, wave);
  const key = `${campaignId}:${wave}`;
  if (running.has(key)) throw new RepoError("Mailchimp is still working on this round. Wait for it to finish.");
  const client = mailchimpClient();
  running.add(key);
  await setRun(campaignId, wave, { status: "syncing", step: "Checking audience fields", error: null });
  await audit(user.id, `Mailchimp update started (round ${wave})`, `${plan.length} addresses`, campaignId);

  void (async () => {
    const listId = serverEnv().mailchimp!.audienceId;
    try {
      const models = modelsForWave(emails, plan);
      const { tags, created } = await ensureMergeFields(client, listId, groupsInUse(models));
      await setRun(campaignId, wave, { step: `Updating contacts (0 of ${plan.length})`, fieldTags: [...tags] });
      const previousRows = await db()
        .select()
        .from(mailchimpContacts)
        .where(and(eq(mailchimpContacts.campaignId, campaignId), eq(mailchimpContacts.wave, wave)));
      // Addresses no longer in the list (e.g. the campaign was reopened and changed) are dropped.
      const planned = new Set(plan.map((p) => p.email));
      const gone = previousRows.filter((r) => !planned.has(r.email)).map((r) => r.email);
      if (gone.length) await db().delete(mailchimpContacts).where(and(eq(mailchimpContacts.campaignId, campaignId), eq(mailchimpContacts.wave, wave), inArray(mailchimpContacts.email, gone)));
      const previous = new Map(previousRows.map((r) => [r.email, { result: r.result as ContactResult, hash: r.fieldsHash ?? "" }]));
      let done = 0;
      await syncContacts(client, listId, plan, {
        tags,
        previous,
        onResult: async (c, o) => {
          await saveContact(campaignId, wave, c, o);
          done++;
          if (done % 10 === 0 || done === plan.length) await setRun(campaignId, wave, { step: `Updating contacts (${done} of ${plan.length})` });
        },
      });
      await setRun(campaignId, wave, { step: "Updating the campaign segment" });
      const seasonCode = emails[0]!.seasonCode;
      const { segmentId, recipients } = await refreshSegment(client, campaignId, wave, plan, seasonCode);
      await setRun(campaignId, wave, { status: "synced", step: null, segmentId, recipients });
      await audit(user.id, `Mailchimp contacts updated (round ${wave})`, `${recipients} will get the email${created.length ? ` · ${created.length} audience fields added` : ""} · ${name}`, campaignId);
    } catch (e) {
      const message = e instanceof MailchimpSetupError || e instanceof MailchimpError ? e.message : "Something went wrong talking to Mailchimp.";
      if (!(e instanceof MailchimpSetupError)) console.error("Mailchimp sync failed", e);
      await setRun(campaignId, wave, { status: "failed", step: null, error: message });
    } finally {
      running.delete(key);
    }
  })();
}

/** The admin adds chosen new addresses to the audience as subscribed. */
export async function addContacts(campaignId: string, wave: number, chosen: string[], user: { id: string; name: string }) {
  const { plan, emails, run } = await guard(campaignId, wave, { needs: ["synced", "test_sent"] });
  const client = mailchimpClient();
  const listId = serverEnv().mailchimp!.audienceId;
  const rows = await db()
    .select()
    .from(mailchimpContacts)
    .where(and(eq(mailchimpContacts.campaignId, campaignId), eq(mailchimpContacts.wave, wave), eq(mailchimpContacts.result, "new")));
  const allowed = new Set(rows.map((r) => r.email));
  const picked = new Set(chosen.map((e) => e.toLowerCase()));
  const targets = plan.filter((p) => allowed.has(p.email) && picked.has(p.email));
  if (!targets.length) throw new RepoError("Choose at least one new address to add.");
  let added = 0;
  await addNewContacts(client, listId, targets, {
    tags: new Set(run?.fieldTags ?? MERGE_FIELD_DEFS.filter((d) => d.group === "core").map((d) => d.tag)),
    onResult: async (c, o) => {
      await saveContact(campaignId, wave, c, o);
      if (o.result === "synced") added++;
    },
  });
  const { recipients } = await refreshSegment(client, campaignId, wave, plan, emails[0]!.seasonCode);
  // The test email no longer matches who will get it, so it's sent again before the real send.
  await setRun(campaignId, wave, { status: "synced", recipients });
  await audit(user.id, `${added} new contact${added === 1 ? "" : "s"} added to Mailchimp (round ${wave})`, targets.map((t) => t.email).join(", ").slice(0, 300), campaignId);
}

/** Step 2: creates (or updates) the Mailchimp campaign and sends a test to the team. */
export async function prepareAndTest(campaignId: string, wave: number, user: { id: string; name: string }, testEmails: string[]) {
  const { plan, emails, name, run } = await guard(campaignId, wave, { needs: ["synced", "test_sent"] });
  if (!testEmails.length) throw new RepoError("Add your team's test addresses in Settings first, so the test email has somewhere to go.");
  if (!run?.segmentId || !run.recipients) throw new RepoError("Nobody in this round can get the email yet. Update the contacts, or add the new addresses.");
  const env = serverEnv().mailchimp!;
  const client = mailchimpClient();
  const models = modelsForWave(emails, plan);
  const first = models[0]!;
  const groups = new Set(MERGE_FIELD_DEFS.filter((d) => run.fieldTags.includes(d.tag)).map((d) => d.group)) as Set<MergeFieldGroup>;
  const html = renderMailchimpTemplate(first, groups);
  const settings = {
    subject: first.subject,
    preheader: campaignPreheader(first),
    title: wave === 1 ? name : `${name} (round ${wave})`,
    fromName: env.fromName,
    replyTo: env.replyTo,
  };
  let mcCampaignId = run.mcCampaignId;
  try {
    if (mcCampaignId) await client.updateCampaign(mcCampaignId, env.audienceId, run.segmentId, settings);
    else mcCampaignId = await client.createCampaign(env.audienceId, run.segmentId, settings);
    await client.setContent(mcCampaignId, html);
    await client.sendTest(mcCampaignId, testEmails);
  } catch (e) {
    if (e instanceof MailchimpError) throw new RepoError(`Mailchimp said: ${e.message}`);
    throw e;
  }
  await setRun(campaignId, wave, { status: "test_sent", mcCampaignId, testSentAt: new Date(), error: null });
  await audit(user.id, `Mailchimp test email sent (round ${wave})`, testEmails.join(", "), campaignId);
}

/** Step 3: sends the round to everyone in its segment. */
export async function sendRound(campaignId: string, wave: number, user: { id: string; name: string }) {
  const { run } = await guard(campaignId, wave, { needs: ["test_sent"] });
  if (!run?.mcCampaignId) throw new RepoError("Send the test email first.");
  const client = mailchimpClient();
  await setRun(campaignId, wave, { status: "sending", step: "Sending" });
  try {
    const info = await client.getCampaign(run.mcCampaignId);
    await client.send(run.mcCampaignId);
    await setRun(campaignId, wave, { status: "sent", step: null, error: null, sentAt: new Date(), sentBy: user.name, recipients: info.recipients || run.recipients });
    await db().execute(sql`update campaigns set exported_at = now(), status = 'synced' where id = ${campaignId}`);
    await audit(user.id, `Sent through Mailchimp (round ${wave})`, `${info.recipients || run.recipients} contacts`, campaignId);
  } catch (e) {
    await setRun(campaignId, wave, { status: "test_sent", step: null, error: e instanceof MailchimpError ? `Mailchimp said: ${e.message}` : "Sending failed." });
    if (e instanceof MailchimpError) throw new RepoError(`Mailchimp didn't send it: ${e.message}`);
    throw e;
  }
}

/** True once any round went out: the campaign can't be reopened then. */
export async function anyRoundSent(campaignId: string): Promise<boolean> {
  const rows = await db()
    .select({ wave: mailchimpRuns.wave })
    .from(mailchimpRuns)
    .where(and(eq(mailchimpRuns.campaignId, campaignId), eq(mailchimpRuns.status, "sent")));
  return rows.length > 0;
}
