"use server";

import type { Role } from "@reorder/db";
import { requireUser } from "@/lib/server/auth";
import * as mc from "@/lib/server/mailchimp";
import { getSettings, RepoError } from "@/lib/server/repo";
import type { ActionResult, MailchimpOverview } from "@/lib/types";

/** Sending through Mailchimp. Only admins send; everyone signed in can see the progress. */

const ADMINS: Role[] = ["admin"];
const isId = (v: unknown): v is string => typeof v === "string" && /^[\w-]{1,64}$/.test(v);
const isWave = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 20;

async function run(fn: (user: { id: string; name: string }) => Promise<void>): Promise<ActionResult> {
  const user = await requireUser();
  if (!ADMINS.includes(user.role)) return { ok: false, error: user.role === "viewer" ? "You have view-only access." : "Only an admin can send through Mailchimp." };
  try {
    await fn(user);
    return { ok: true };
  } catch (e) {
    if (e instanceof RepoError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Something went wrong talking to Mailchimp. Please try again." };
  }
}

function check(campaignId: unknown, wave: unknown): asserts campaignId is string {
  if (!isId(campaignId) || !isWave(wave)) throw new RepoError("Unknown campaign.");
}

export async function getMailchimpOverviewAction(campaignId: string): Promise<MailchimpOverview | { error: string }> {
  await requireUser();
  if (!isId(campaignId)) return { error: "Unknown campaign." };
  try {
    return await mc.mailchimpOverview(campaignId);
  } catch (e) {
    if (e instanceof RepoError) return { error: e.message };
    throw e;
  }
}

export async function startMailchimpSyncAction(campaignId: string, wave: number) {
  return run((user) => (check(campaignId, wave), mc.startSync(campaignId, wave, user)));
}

export async function addMailchimpContactsAction(campaignId: string, wave: number, emails: string[]) {
  return run((user) => {
    check(campaignId, wave);
    const list = Array.isArray(emails) ? emails.filter((e) => typeof e === "string").slice(0, 2000) : [];
    return mc.addContacts(campaignId, wave, list, user);
  });
}

export async function sendMailchimpTestAction(campaignId: string, wave: number) {
  return run(async (user) => {
    check(campaignId, wave);
    const settings = await getSettings();
    await mc.prepareAndTest(campaignId, wave, user, settings.testEmails);
  });
}

export async function sendMailchimpRoundAction(campaignId: string, wave: number, confirm: string) {
  return run((user) => {
    check(campaignId, wave);
    if (String(confirm).trim().toUpperCase() !== "SEND") throw new RepoError("Type SEND to confirm.");
    return mc.sendRound(campaignId, wave, user);
  });
}

export async function testMailchimpConnectionAction() {
  const user = await requireUser();
  if (user.role !== "admin") return { ok: false as const, error: "Only an admin can check the Mailchimp connection." };
  return mc.testConnection();
}
