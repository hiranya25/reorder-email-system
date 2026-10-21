import { randomUUID } from "node:crypto";
import { boolean, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["admin", "reviewer", "viewer"]);

// IDs come from the app, so no database extension is needed on older PostgreSQL versions.
const id = () => uuid("id").primaryKey().$defaultFn(() => randomUUID());
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

/**
 * Console users. Sign-in is "Sign in with Microsoft" or "Sign in with Google", or, where turned
 * on, email + password + authenticator code (TOTP).
 */
export const users = pgTable(
  "users",
  {
    id: id(),
    /** Always stored lower-case. */
    email: text("email").notNull(),
    /** Optional sign-in name, lower-case (letters, digits, dot, dash, underscore). */
    username: text("username"),
    name: text("name").notNull(),
    role: roleEnum("role").notNull(),
    /** scrypt hash; null until the invite is accepted. */
    passwordHash: text("password_hash"),
    /** Authenticator secret, encrypted with APP_SECRET; null until set up. */
    totpSecretEnc: text("totp_secret_enc"),
    totpEnabled: boolean("totp_enabled").notNull().default(false),
    /** Last accepted TOTP time step, so a code can't be used twice. */
    totpLastStep: integer("totp_last_step"),
    /** sha256 hashes of unused one-time recovery codes. */
    recoveryCodes: jsonb("recovery_codes").$type<string[]>().notNull().default([]),
    /** Microsoft Entra object id (`oid`), tied on first Microsoft sign-in. */
    microsoftSub: text("microsoft_sub"),
    /** Google account id (`sub`), tied on first Google sign-in. */
    googleSub: text("google_sub"),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("users_email_idx").on(t.email),
    uniqueIndex("users_username_idx").on(t.username),
    uniqueIndex("users_microsoft_sub_idx").on(t.microsoftSub), uniqueIndex("users_google_sub_idx").on(t.googleSub),
  ],
);

/** One-time links an admin hands to a new user (or to reset someone). */
export const invites = pgTable(
  "invites",
  {
    id: id(),
    email: text("email").notNull(),
    role: roleEnum("role").notNull(),
    /** sha256 of the token in the link; the token itself is never stored. */
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("invites_token_idx").on(t.tokenHash)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** sha256 of the cookie value. */
    tokenHash: text("token_hash").notNull(),
    /** "pending_totp" after a correct password, "active" after the code. */
    stage: text("stage", { enum: ["pending_totp", "active"] }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("sessions_token_idx").on(t.tokenHash), index("sessions_user_idx").on(t.userId)],
);

/** "Forgot password" links sent by email. Only the hash of the token is stored. */
export const passwordResets = pgTable(
  "password_resets",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("password_resets_token_idx").on(t.tokenHash), index("password_resets_user_idx").on(t.userId)],
);

/** Failed and successful sign-in attempts, for lockout after repeated failures. */
export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: id(),
    email: text("email").notNull(),
    ip: text("ip"),
    success: boolean("success").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("login_attempts_email_idx").on(t.email, t.createdAt)],
);

/** Who did what, when. Shared by sign-in events and campaign actions. */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: id(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    /** Filled in when the user is deleted, so the log still says who did it. */
    userName: text("user_name"),
    campaignId: text("campaign_id"),
    action: text("action").notNull(),
    detail: text("detail"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_logs_created_idx").on(t.createdAt)],
);

export type User = typeof users.$inferSelect;
export type Role = (typeof roleEnum.enumValues)[number];

// ---------- campaign data (B2) ----------

const at = (name: string) => timestamp(name, { withTimezone: true });

/** One row per season campaign. The built-in demo campaign uses id "demo". */
export const campaigns = pgTable("campaigns", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  /** yyyy-mm-dd */
  seasonStart: text("season_start").notNull(),
  seasonEnd: text("season_end").notNull(),
  status: text("status").notNull().default("draft"),
  fileName: text("file_name"),
  productsConfirmedAt: at("products_confirmed_at"),
  productsConfirmedBy: text("products_confirmed_by"),
  exportedAt: at("exported_at"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

const campaignRef = () =>
  text("campaign_id")
    .notNull()
    .references(() => campaigns.id, { onDelete: "cascade" });

/** Latest confirmed sales import (the processed result, not the raw file). */
export const campaignImports = pgTable("campaign_imports", {
  campaignId: campaignRef().primaryKey(),
  record: jsonb("record").notNull(),
  importedBy: uuid("imported_by").references(() => users.id, { onDelete: "set null" }),
  importedAt: at("imported_at").notNull().defaultNow(),
});

/** Customer mapping decision per account. */
export const decisions = pgTable(
  "decisions",
  {
    campaignId: campaignRef(),
    accountId: text("account_id").notNull(),
    status: text("status", { enum: ["approved", "excluded", "undecided"] }).notNull(),
    emails: jsonb("emails").$type<string[]>().notNull().default([]),
    decidedBy: text("decided_by").notNull(),
    decidedAt: at("decided_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.campaignId, t.accountId] })],
);

/** Approved addresses reused next season (never from the demo campaign). */
export const rememberedContacts = pgTable("remembered_contacts", {
  accountId: text("account_id").primaryKey(),
  emails: jsonb("emails").$type<string[]>().notNull(),
  campaignId: text("campaign_id").notNull(),
  approvedAt: at("approved_at").notNull().defaultNow(),
});

export const hiddenProducts = pgTable(
  "hidden_products",
  {
    campaignId: campaignRef(),
    sku: text("sku").notNull(),
  },
  (t) => [primaryKey({ columns: [t.campaignId, t.sku] })],
);

/** Replacement SKU and display name, kept across seasons. "demo" edits stay apart from real ones. */
export const productEdits = pgTable(
  "product_edits",
  {
    scope: text("scope", { enum: ["real", "demo"] }).notNull(),
    sku: text("sku").notNull(),
    successorSku: text("successor_sku"),
    displayName: text("display_name"),
    updatedAt: at("updated_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.scope, t.sku] })],
);

export const campaignPicks = pgTable("campaign_picks", {
  campaignId: campaignRef().primaryKey(),
  picks: jsonb("picks").notNull(),
  updatedAt: at("updated_at").notNull().defaultNow(),
});

/** One row per approver. The first approval locks the campaign; export needs the required number. */
export const approvals = pgTable(
  "approvals",
  {
    campaignId: campaignRef(),
    /** Not a foreign key: an approval stays on record even if the approver's account is deleted. */
    userId: uuid("user_id").notNull(),
    userName: text("user_name").notNull(),
    approvedAt: at("approved_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.campaignId, t.userId] })],
);

/** Uploaded product catalogs; the newest row is the current one. */
export const catalogs = pgTable("catalogs", {
  id: id(),
  record: jsonb("record").notNull(),
  uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

/** Small shared settings (brand, reorder button, rules, saved column choices, …) by key. */
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
  updatedAt: at("updated_at").notNull().defaultNow(),
});

// ---------- Mailchimp sending (B3) ----------

/**
 * One round of sending a campaign through Mailchimp. Usually one per campaign; an address shared
 * by two customers gets the second customer's email in round 2, after round 1 is sent.
 */
export const mailchimpRuns = pgTable(
  "mailchimp_runs",
  {
    campaignId: campaignRef(),
    wave: integer("wave").notNull(),
    /** idle → syncing → synced → test_sent → sent; "failed" when a step stopped with an error. */
    status: text("status", { enum: ["idle", "syncing", "synced", "test_sent", "sending", "sent", "failed"] }).notNull().default("idle"),
    /** What the running step is doing, e.g. "Updating contacts". */
    step: text("step"),
    error: text("error"),
    segmentId: integer("segment_id"),
    mcCampaignId: text("mc_campaign_id"),
    /** Audience fields the email used when last synced. */
    fieldTags: jsonb("field_tags").$type<string[]>().notNull().default([]),
    recipients: integer("recipients"),
    testSentAt: at("test_sent_at"),
    sentAt: at("sent_at"),
    sentBy: text("sent_by"),
    updatedAt: at("updated_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.campaignId, t.wave] })],
);

/** The outcome for each address in a round. */
export const mailchimpContacts = pgTable(
  "mailchimp_contacts",
  {
    campaignId: campaignRef(),
    wave: integer("wave").notNull(),
    email: text("email").notNull(),
    accountId: text("account_id").notNull(),
    company: text("company").notNull(),
    /** synced | new | unsubscribed | bounced | not_subscribed | failed */
    result: text("result").notNull(),
    error: text("error"),
    /** Hash of the fields last written, so unchanged contacts aren't written again. */
    fieldsHash: text("fields_hash"),
    updatedAt: at("updated_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.campaignId, t.wave, t.email] })],
);
