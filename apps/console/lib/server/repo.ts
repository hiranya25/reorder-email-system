import "server-only";

import {
  DEFAULT_RULES,
  DEMO_CAMPAIGN,
  type Campaign,
  type CatalogRecord,
  type Decision,
  type ImportRecord,
  type NamedMapping,
  type RecommendationPicks,
  type RememberedContact,
  type ReviewRules,
} from "@reorder/core";
import {
  appSettings,
  approvals,
  auditLogs,
  campaignImports,
  campaignPicks,
  campaigns,
  catalogs,
  decisions,
  getDb,
  hiddenProducts,
  productEdits,
  rememberedContacts,
  users,
  type Db,
} from "@reorder/db";
import { DEFAULT_REORDER, PLACEHOLDER_BRAND } from "@reorder/email";
import { and, desc, eq, inArray, like, sql } from "drizzle-orm";
import type { AuditEntry, CampaignSnapshot, ProductEditMaps, Settings, WorkspaceSnapshot } from "../types";
import { serverEnv } from "./env";

/** A rule was broken (locked campaign, wrong role, bad input). The message is shown to the user. */
export class RepoError extends Error {}

export function db(): Db {
  return getDb(serverEnv().databaseUrl);
}

export const DEFAULT_SETTINGS: Settings = { brand: PLACEHOLDER_BRAND, reorder: DEFAULT_REORDER, testEmails: [], requiredApprovals: 2 };

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : undefined);

function toCampaign(r: typeof campaigns.$inferSelect): Campaign {
  if (r.id === DEMO_CAMPAIGN.id) return DEMO_CAMPAIGN;
  return {
    id: r.id,
    name: r.name,
    seasonStart: r.seasonStart,
    seasonEnd: r.seasonEnd,
    status: r.status as Campaign["status"],
    fileName: r.fileName ?? undefined,
    createdAt: r.createdAt.toISOString(),
  };
}

/** The demo campaign's row exists so its decisions and picks can be saved like any other. */
async function ensureDemoRow() {
  await db()
    .insert(campaigns)
    .values({ id: DEMO_CAMPAIGN.id, name: DEMO_CAMPAIGN.name, seasonStart: DEMO_CAMPAIGN.seasonStart, seasonEnd: DEMO_CAMPAIGN.seasonEnd, status: "imported", fileName: DEMO_CAMPAIGN.fileName })
    .onConflictDoNothing();
}

// ---------- settings ----------

async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const [row] = await db().select().from(appSettings).where(eq(appSettings.key, key));
  return row ? (row.value as T) : fallback;
}

export async function putSetting(key: string, value: unknown, userId: string | null) {
  await db()
    .insert(appSettings)
    .values({ key, value, updatedBy: userId, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedBy: userId, updatedAt: new Date() } });
}

export async function getSettings(): Promise<Settings> {
  return { ...DEFAULT_SETTINGS, ...(await getSetting<Partial<Settings>>("settings", {})) };
}

export async function getRules(): Promise<ReviewRules> {
  return { ...DEFAULT_RULES, ...(await getSetting<Partial<ReviewRules>>("rules", {})) };
}

// ---------- loading ----------

export async function loadWorkspace(): Promise<WorkspaceSnapshot> {
  await ensureDemoRow();
  const d = db();
  const [campaignRows, settings, rules, demoCatalogLoaded, mappingRows, catalogRow, editRows, rememberedRows] = await Promise.all([
    d.select().from(campaigns).orderBy(desc(campaigns.createdAt)),
    getSettings(),
    getRules(),
    getSetting<boolean>("demoCatalogLoaded", false),
    d.select().from(appSettings).where(like(appSettings.key, "mapping:%")),
    d.select().from(catalogs).orderBy(desc(catalogs.createdAt)).limit(1),
    d.select().from(productEdits),
    d.select().from(rememberedContacts),
  ]);
  const edits: ProductEditMaps = { real: { successor: {}, displayName: {} }, demo: { successor: {}, displayName: {} } };
  for (const e of editRows) {
    if (e.successorSku) edits[e.scope].successor[e.sku] = e.successorSku;
    if (e.displayName) edits[e.scope].displayName[e.sku] = e.displayName;
  }
  const remembered: Record<string, RememberedContact> = {};
  for (const r of rememberedRows) remembered[r.accountId] = { emails: r.emails, approvedAt: r.approvedAt.toISOString(), campaignId: r.campaignId };
  return {
    campaigns: campaignRows.filter((c) => c.id !== DEMO_CAMPAIGN.id).map(toCampaign),
    settings,
    rules,
    savedMappings: Object.fromEntries(mappingRows.map((m) => [m.key.slice("mapping:".length), m.value as NamedMapping])),
    catalog: catalogRow[0]?.record as CatalogRecord | undefined,
    demoCatalogLoaded,
    productEdits: edits,
    remembered,
  };
}

export async function loadCampaignSnapshot(id: string): Promise<CampaignSnapshot | undefined> {
  if (id === DEMO_CAMPAIGN.id) await ensureDemoRow();
  const d = db();
  const [row] = await d.select().from(campaigns).where(eq(campaigns.id, id));
  if (!row) return undefined;
  const [imp, decisionRows, hiddenRows, pickRow, approvalRows, settings, auditRows] = await Promise.all([
    d.select().from(campaignImports).where(eq(campaignImports.campaignId, id)),
    d.select().from(decisions).where(eq(decisions.campaignId, id)),
    d.select().from(hiddenProducts).where(eq(hiddenProducts.campaignId, id)),
    d.select().from(campaignPicks).where(eq(campaignPicks.campaignId, id)),
    d.select().from(approvals).where(eq(approvals.campaignId, id)).orderBy(approvals.approvedAt),
    getSettings(),
    loadAudit({ campaignId: id, limit: 200 }),
  ]);
  const decisionMap: Record<string, Decision> = {};
  for (const r of decisionRows) decisionMap[r.accountId] = { status: r.status, emails: r.emails, decidedAt: r.decidedAt.toISOString(), decidedBy: r.decidedBy };
  return {
    campaignId: id,
    importRecord: imp[0]?.record as ImportRecord | undefined,
    decisions: decisionMap,
    hidden: hiddenRows.map((h) => h.sku),
    productsConfirmed: row.productsConfirmedAt ? { at: row.productsConfirmedAt.toISOString(), by: row.productsConfirmedBy ?? "" } : undefined,
    picks: pickRow[0]?.picks as RecommendationPicks | undefined,
    approval: {
      approvers: approvalRows.map((a) => ({ userId: a.userId, name: a.userName, at: a.approvedAt.toISOString() })),
      required: settings.requiredApprovals,
      exportedAt: iso(row.exportedAt),
    },
    audit: auditRows,
  };
}

export async function loadAudit(opts: { campaignId?: string; limit: number }): Promise<AuditEntry[]> {
  const rows = await db()
    .select({ id: auditLogs.id, at: auditLogs.createdAt, by: users.name, byDeleted: auditLogs.userName, campaignId: auditLogs.campaignId, action: auditLogs.action, detail: auditLogs.detail })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.userId))
    .where(opts.campaignId ? eq(auditLogs.campaignId, opts.campaignId) : undefined)
    .orderBy(desc(auditLogs.createdAt))
    .limit(opts.limit);
  return rows.map((r) => ({ id: r.id, at: r.at.toISOString(), by: r.by ?? (r.byDeleted ? `${r.byDeleted} (deleted)` : "System"), campaignId: r.campaignId ?? undefined, action: r.action, detail: r.detail ?? undefined }));
}

export async function audit(userId: string, action: string, detail?: string, campaignId?: string) {
  await db().insert(auditLogs).values({ userId, action, detail, campaignId });
}

// ---------- guards ----------

export async function assertCampaign(id: string) {
  const [row] = await db().select().from(campaigns).where(eq(campaigns.id, id));
  if (!row) throw new RepoError("This campaign no longer exists.");
  return row;
}

/** Review changes are blocked from the first approval until someone reopens the campaign. */
export async function assertUnlocked(campaignId: string) {
  const [row] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(approvals)
    .where(eq(approvals.campaignId, campaignId));
  if ((row?.n ?? 0) > 0) throw new RepoError("This campaign is approved and locked. Reopen it on Approve & sync to make changes.");
}

/**
 * Catalog uploads, renames and replacements change every campaign's emails, so they wait while a
 * campaign is approved but not yet exported (the approvers signed off on the current version).
 */
export async function assertNoApprovedPending(scope: "real" | "demo") {
  const rows = await db()
    .selectDistinct({ id: campaigns.id, name: campaigns.name })
    .from(approvals)
    .innerJoin(campaigns, eq(campaigns.id, approvals.campaignId))
    .where(sql`${campaigns.exportedAt} is null`);
  const hit = rows.filter((r) => (scope === "demo") === (r.id === DEMO_CAMPAIGN.id));
  if (hit.length) throw new RepoError(`"${hit[0]!.name}" is approved and waiting to be sent. Reopen it before changing products, or export it first.`);
}

// ---------- campaigns ----------

export async function createCampaign(input: { id: string; name: string; seasonStart: string; seasonEnd: string }, userId: string) {
  await db().insert(campaigns).values({ ...input, status: "draft", createdBy: userId });
  await audit(userId, "Campaign created", input.name, input.id);
}

export async function deleteCampaign(id: string, userId: string) {
  if (id === DEMO_CAMPAIGN.id) throw new RepoError("The demo campaign can't be deleted.");
  const row = await assertCampaign(id);
  await db().delete(campaigns).where(eq(campaigns.id, id));
  await audit(userId, "Campaign deleted", row.name);
}

export async function saveImport(campaignId: string, record: ImportRecord, signature: string, season: { start: string; end: string }, userId: string) {
  if (campaignId === DEMO_CAMPAIGN.id) throw new RepoError("The demo campaign uses sample data.");
  await assertCampaign(campaignId);
  await assertUnlocked(campaignId);
  const d = db();
  await d.transaction(async (tx) => {
    await tx
      .insert(campaignImports)
      .values({ campaignId, record, importedBy: userId, importedAt: new Date() })
      .onConflictDoUpdate({ target: campaignImports.campaignId, set: { record, importedBy: userId, importedAt: new Date() } });
    await tx
      .update(campaigns)
      .set({ seasonStart: season.start, seasonEnd: season.end, fileName: record.fileName, status: "imported" })
      .where(eq(campaigns.id, campaignId));
  });
  await putSetting(`mapping:${signature}`, record.mapping, userId);
  await audit(userId, "Sales data imported", `${record.fileName} · ${record.result.customers.length} customers`, campaignId);
}

// ---------- mapping ----------

export async function decide(campaignId: string, items: { accountId: string; emails: string[] }[], status: Decision["status"], user: { id: string; name: string }) {
  await assertUnlocked(campaignId);
  const d = db();
  const now = new Date();
  const isDemo = campaignId === DEMO_CAMPAIGN.id;
  await d.transaction(async (tx) => {
    for (const { accountId, emails } of items) {
      const kept = status === "approved" ? emails : [];
      await tx
        .insert(decisions)
        .values({ campaignId, accountId, status, emails: kept, decidedBy: user.name, decidedAt: now })
        .onConflictDoUpdate({ target: [decisions.campaignId, decisions.accountId], set: { status, emails: kept, decidedBy: user.name, decidedAt: now } });
      // Demo accounts are made up and must never become remembered contacts.
      if (isDemo) continue;
      if (status === "approved" && kept.length) {
        await tx
          .insert(rememberedContacts)
          .values({ accountId, emails: kept, campaignId, approvedAt: now })
          .onConflictDoUpdate({ target: rememberedContacts.accountId, set: { emails: kept, campaignId, approvedAt: now } });
      } else {
        await tx.delete(rememberedContacts).where(and(eq(rememberedContacts.accountId, accountId), eq(rememberedContacts.campaignId, campaignId)));
      }
    }
  });
  if (items.length > 1 || status !== "undecided") {
    const verb = { approved: "Approved", excluded: "Excluded", undecided: "Reopened" }[status];
    await audit(user.id, `${verb} ${items.length === 1 ? "account" : `${items.length} accounts`}`, items.length === 1 ? items[0]!.accountId : undefined, campaignId);
  }
}

// ---------- catalog and products ----------

export async function saveCatalog(record: CatalogRecord, signature: string, userId: string) {
  await assertNoApprovedPending("real");
  await db().insert(catalogs).values({ record, uploadedBy: userId });
  await putSetting(`mapping:catalog:${signature}`, record.mapping, userId);
  await audit(userId, "Catalog uploaded", `${record.fileName} · ${record.products.length} products`);
}

export async function setHidden(campaignId: string, sku: string, hidden: boolean) {
  await assertUnlocked(campaignId);
  if (hidden) await db().insert(hiddenProducts).values({ campaignId, sku }).onConflictDoNothing();
  else await db().delete(hiddenProducts).where(and(eq(hiddenProducts.campaignId, campaignId), eq(hiddenProducts.sku, sku)));
}

export async function setProductEdit(scope: "real" | "demo", sku: string, patch: { successorSku?: string | null; displayName?: string | null }) {
  await assertNoApprovedPending(scope);
  const d = db();
  const [existing] = await d.select().from(productEdits).where(and(eq(productEdits.scope, scope), eq(productEdits.sku, sku)));
  const next = { successorSku: existing?.successorSku ?? null, displayName: existing?.displayName ?? null, ...patch };
  if (!next.successorSku && !next.displayName) {
    await d.delete(productEdits).where(and(eq(productEdits.scope, scope), eq(productEdits.sku, sku)));
    return;
  }
  await d
    .insert(productEdits)
    .values({ scope, sku, ...next, updatedAt: new Date() })
    .onConflictDoUpdate({ target: [productEdits.scope, productEdits.sku], set: { ...next, updatedAt: new Date() } });
}

export async function confirmProducts(campaignId: string, confirmed: boolean, user: { id: string; name: string }) {
  await assertUnlocked(campaignId);
  await db()
    .update(campaigns)
    .set(confirmed ? { productsConfirmedAt: new Date(), productsConfirmedBy: user.name } : { productsConfirmedAt: null, productsConfirmedBy: null })
    .where(eq(campaigns.id, campaignId));
  await audit(user.id, confirmed ? "Product check confirmed" : "Product check reopened", undefined, campaignId);
}

export async function savePicks(campaignId: string, picks: RecommendationPicks) {
  await assertUnlocked(campaignId);
  await db()
    .insert(campaignPicks)
    .values({ campaignId, picks, updatedAt: new Date() })
    .onConflictDoUpdate({ target: campaignPicks.campaignId, set: { picks, updatedAt: new Date() } });
}

// ---------- approval ----------

export async function addApproval(campaignId: string, user: { id: string; name: string }, detail: string) {
  const d = db();
  const existing = await d.select().from(approvals).where(eq(approvals.campaignId, campaignId));
  if (existing.some((a) => a.userId === user.id)) throw new RepoError("You've already approved this campaign. A different person must give the next approval.");
  await d.insert(approvals).values({ campaignId, userId: user.id, userName: user.name });
  const settings = await getSettings();
  const count = existing.length + 1;
  const full = count >= settings.requiredApprovals;
  await d.update(campaigns).set({ status: full ? "approved" : "previewed" }).where(eq(campaigns.id, campaignId));
  await audit(user.id, full ? "Campaign approved" : `Approval ${count} of ${settings.requiredApprovals} given (campaign locked)`, detail, campaignId);
}

export async function reopen(campaignId: string, userId: string) {
  const d = db();
  await d.delete(approvals).where(eq(approvals.campaignId, campaignId));
  await d.update(campaigns).set({ status: "imported", exportedAt: null }).where(eq(campaigns.id, campaignId));
  await audit(userId, "Campaign reopened for changes (approvals cleared)", undefined, campaignId);
}

export async function markExported(campaignId: string, userId: string, detail: string) {
  const settings = await getSettings();
  const rows = await db().select().from(approvals).where(eq(approvals.campaignId, campaignId));
  if (rows.length < settings.requiredApprovals) throw new RepoError(`Export needs ${settings.requiredApprovals} approvals from different people.`);
  await db().update(campaigns).set({ exportedAt: new Date(), status: "synced" }).where(eq(campaigns.id, campaignId));
  await audit(userId, "Mailchimp CSV exported", detail, campaignId);
}

export async function clearCampaignData(userId: string) {
  // Keeps users, sign-in and the activity log; removes campaigns (cascade), catalogs, edits and memory.
  const d = db();
  const ids = (await d.select({ id: campaigns.id }).from(campaigns)).map((c) => c.id);
  if (ids.length) await d.delete(campaigns).where(inArray(campaigns.id, ids));
  await d.delete(catalogs);
  await d.delete(productEdits);
  await d.delete(rememberedContacts);
  await d.delete(appSettings).where(like(appSettings.key, "mapping:%"));
  await audit(userId, "All campaign data cleared");
}
