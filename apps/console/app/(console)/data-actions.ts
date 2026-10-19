"use server";

import { canApprove, DEMO_CAMPAIGN, type Campaign, type CatalogRecord, type Decision, type ImportRecord, type RecommendationPicks, type ReviewRules } from "@reorder/core";
import type { Role } from "@reorder/db";
import { randomBytes } from "node:crypto";
import { deriveCampaign, readinessFor, sendListFor } from "@/lib/derive";
import { requireUser } from "@/lib/server/auth";
import * as repo from "@/lib/server/repo";
import type { ActionResult, CampaignSnapshot, Settings } from "@/lib/types";

/**
 * Every change to campaign data goes through here. Each action checks the signed-in user's role
 * and the campaign lock on the server; the browser's checks are only for a friendlier UI.
 */

const EDITORS: Role[] = ["admin", "reviewer"];
const ADMINS: Role[] = ["admin"];
const EMAIL_RE = /^[^\s@;,]+@[^\s@;,]+\.[^\s@;,]+$/;

async function run(roles: Role[], fn: (user: { id: string; name: string; role: Role }) => Promise<void>): Promise<ActionResult> {
  const user = await requireUser();
  if (!roles.includes(user.role)) return { ok: false, error: user.role === "viewer" ? "You have view-only access." : "Only an admin can do this." };
  try {
    await fn(user);
    return { ok: true };
  } catch (e) {
    if (e instanceof repo.RepoError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Something went wrong saving this change. Please reload and try again." };
  }
}

const isId = (v: unknown): v is string => typeof v === "string" && /^[\w-]{1,64}$/.test(v);
const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isSku = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 120;

function bad(message: string): never {
  throw new repo.RepoError(message);
}

// ---------- reads ----------

export async function getCampaignSnapshotAction(campaignId: string): Promise<CampaignSnapshot | undefined> {
  await requireUser();
  return isId(campaignId) ? repo.loadCampaignSnapshot(campaignId) : undefined;
}

// ---------- campaigns and imports (admin) ----------

export async function createCampaignAction(input: { name: string; seasonStart: string; seasonEnd: string }): Promise<ActionResult & { campaign?: Campaign }> {
  let campaign: Campaign | undefined;
  const result = await run(ADMINS, async (user) => {
    const name = String(input.name ?? "").trim().slice(0, 120);
    if (!name) bad("Enter a campaign name.");
    if (!isDate(input.seasonStart) || !isDate(input.seasonEnd) || input.seasonStart > input.seasonEnd) bad("Check the season dates.");
    const id = randomBytes(6).toString("base64url").replace(/[-_]/g, "x");
    await repo.createCampaign({ id, name, seasonStart: input.seasonStart, seasonEnd: input.seasonEnd }, user.id);
    campaign = { id, name, seasonStart: input.seasonStart, seasonEnd: input.seasonEnd, status: "draft", createdAt: new Date().toISOString() };
  });
  return { ...result, campaign };
}

export async function deleteCampaignAction(id: string) {
  return run(ADMINS, (user) => repo.deleteCampaign(isId(id) ? id : bad("Unknown campaign."), user.id));
}

export async function saveImportAction(campaignId: string, record: ImportRecord, signature: string, season: { start: string; end: string }) {
  return run(ADMINS, async (user) => {
    if (!isId(campaignId)) bad("Unknown campaign.");
    if (!record || !Array.isArray(record.result?.customers) || typeof record.fileName !== "string") bad("The import is incomplete. Try again.");
    if (!isDate(season?.start) || !isDate(season?.end)) bad("Check the season dates.");
    await repo.saveImport(campaignId, record, String(signature).slice(0, 2000), season, user.id);
  });
}

export async function saveCatalogAction(record: CatalogRecord, signature: string) {
  return run(ADMINS, async (user) => {
    if (!record || !Array.isArray(record.products) || typeof record.fileName !== "string") bad("The catalog is incomplete. Try again.");
    await repo.saveCatalog(record, String(signature).slice(0, 2000), user.id);
  });
}

export async function loadDemoCatalogAction() {
  return run(EDITORS, (user) => repo.putSetting("demoCatalogLoaded", true, user.id));
}

// ---------- review (reviewers and admins) ----------

export async function decideAction(campaignId: string, items: { accountId: string; emails: string[] }[], status: Decision["status"]) {
  return run(EDITORS, async (user) => {
    if (!isId(campaignId)) bad("Unknown campaign.");
    if (!["approved", "excluded", "undecided"].includes(status)) bad("Unknown decision.");
    if (!Array.isArray(items) || items.length === 0 || items.length > 20000) bad("Nothing to save.");
    const clean = items.map((i) => {
      if (typeof i.accountId !== "string" || !i.accountId || i.accountId.length > 100) bad("Unknown account.");
      const emails = Array.isArray(i.emails) ? [...new Set(i.emails.map((e) => String(e).trim().toLowerCase()))] : [];
      if (emails.some((e) => !EMAIL_RE.test(e))) bad(`Not a valid email address for account ${i.accountId}.`);
      if (status === "approved" && emails.length === 0) bad(`Account ${i.accountId} needs an email before it can be approved.`);
      return { accountId: i.accountId, emails };
    });
    await repo.decide(campaignId, clean, status, user);
  });
}

export async function setHiddenAction(campaignId: string, sku: string, hidden: boolean) {
  return run(EDITORS, () => repo.setHidden(isId(campaignId) ? campaignId : bad("Unknown campaign."), isSku(sku) ? sku : bad("Unknown product."), !!hidden));
}

export async function setSuccessorAction(scope: "real" | "demo", sku: string, successor: string | undefined) {
  return run(EDITORS, async () => {
    if (scope !== "real" && scope !== "demo") bad("Unknown scope.");
    if (!isSku(sku) || (successor !== undefined && !isSku(successor))) bad("Unknown product.");
    await repo.setProductEdit(scope, sku, { successorSku: successor ?? null });
  });
}

export async function setDisplayNameAction(scope: "real" | "demo", sku: string, name: string | undefined) {
  return run(EDITORS, async () => {
    if (scope !== "real" && scope !== "demo") bad("Unknown scope.");
    if (!isSku(sku)) bad("Unknown product.");
    await repo.setProductEdit(scope, sku, { displayName: name?.trim().slice(0, 120) || null });
  });
}

export async function confirmProductsAction(campaignId: string, confirmed: boolean) {
  return run(EDITORS, (user) => repo.confirmProducts(isId(campaignId) ? campaignId : bad("Unknown campaign."), !!confirmed, user));
}

export async function savePicksAction(campaignId: string, picks: RecommendationPicks) {
  return run(EDITORS, async () => {
    if (!isId(campaignId)) bad("Unknown campaign.");
    const okSlots = (v: unknown) => Array.isArray(v) && v.length <= 3 && v.every((s) => typeof s === "string" && s.length <= 120);
    const okMap = (m: unknown) => !!m && typeof m === "object" && Object.values(m as object).every(okSlots);
    if (!okMap(picks?.bySegment) || !okMap(picks?.byCustomer)) bad("The picks couldn't be read. Reload and try again.");
    await repo.savePicks(campaignId, { bySegment: picks.bySegment, byCustomer: picks.byCustomer });
  });
}

// ---------- approval ----------

/** Re-checks the whole checklist on the server before recording an approval. */
export async function approveAction(campaignId: string) {
  return run(EDITORS, async (user) => {
    if (!isId(campaignId)) bad("Unknown campaign.");
    const ws = await repo.loadWorkspace();
    const cs = await repo.loadCampaignSnapshot(campaignId);
    const row = campaignId === DEMO_CAMPAIGN.id ? DEMO_CAMPAIGN : ws.campaigns.find((c) => c.id === campaignId);
    if (!cs || !row) bad("This campaign no longer exists.");
    const data = deriveCampaign(row, ws, cs);
    const list = sendListFor(data);
    const readiness = readinessFor(data, list);
    if (!canApprove(readiness)) bad(`Not ready yet: ${readiness.filter((r) => !r.ok && r.blocking).map((r) => r.text).join("; ")}.`);
    await repo.addApproval(campaignId, user, `${list.emails.length} emails · ${list.recipients} addresses`);
  });
}

export async function reopenAction(campaignId: string) {
  return run(EDITORS, (user) => repo.reopen(isId(campaignId) ? campaignId : bad("Unknown campaign."), user.id));
}

export async function markExportedAction(campaignId: string, detail: string) {
  return run(ADMINS, (user) => repo.markExported(isId(campaignId) ? campaignId : bad("Unknown campaign."), user.id, String(detail).slice(0, 300)));
}

// ---------- settings (admin) ----------

export async function updateSettingsAction(patch: Partial<Settings>, detail: string) {
  return run(ADMINS, async (user) => {
    const current = await repo.getSettings();
    const next: Settings = { ...current };
    if (patch.brand) {
      const b = patch.brand;
      next.brand = { brandName: String(b.brandName ?? "").slice(0, 40), companyName: String(b.companyName ?? "").slice(0, 80), address: String(b.address ?? "").slice(0, 160) };
    }
    if (patch.reorder) {
      const r = patch.reorder;
      if (r.mode === "url") {
        if (!/^https:\/\/\S+$/i.test(r.template)) bad("Use a full https:// link for the Reorder button.");
        next.reorder = { mode: "url", template: r.template.slice(0, 500) };
      } else if (r.mode === "mailto") {
        if (!EMAIL_RE.test(r.address)) bad("Enter a valid email address for reorders.");
        next.reorder = { mode: "mailto", address: r.address.toLowerCase() };
      } else next.reorder = { mode: "none" };
    }
    if (patch.testEmails) {
      const list = patch.testEmails.map((e) => String(e).trim().toLowerCase()).filter(Boolean);
      if (list.some((e) => !EMAIL_RE.test(e))) bad("One of the test addresses isn't valid.");
      next.testEmails = list.slice(0, 50);
    }
    if (patch.requiredApprovals !== undefined) {
      const n = Number(patch.requiredApprovals);
      if (!Number.isInteger(n) || n < 1 || n > 5) bad("Approvals must be between 1 and 5.");
      next.requiredApprovals = n;
    }
    await repo.putSetting("settings", next, user.id);
    await repo.audit(user.id, "Settings changed", String(detail).slice(0, 200));
  });
}

export async function saveRulesAction(rules: ReviewRules) {
  return run(ADMINS, async (user) => {
    const parts = Array.isArray(rules?.genericLocalParts) ? rules.genericLocalParts.map((p) => String(p).toLowerCase().trim()).filter((p) => /^[a-z0-9._-]{1,40}$/.test(p)) : [];
    const n = Number(rules?.largeAccountProducts);
    if (!Number.isInteger(n) || n < 3 || n > 500) bad("Large account must be a whole number between 3 and 500.");
    await repo.putSetting("rules", { genericLocalParts: [...new Set(parts)], largeAccountProducts: n }, user.id);
    await repo.audit(user.id, "Settings changed", "Review rules");
  });
}

export async function clearAllAction() {
  return run(ADMINS, (user) => repo.clearCampaignData(user.id));
}
