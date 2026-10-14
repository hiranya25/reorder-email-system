import { randomUUID } from "node:crypto";
import { boolean, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["admin", "reviewer", "viewer"]);

// IDs come from the app, so no database extension is needed on older PostgreSQL versions.
const id = () => uuid("id").primaryKey().$defaultFn(() => randomUUID());
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

/** Console users. Sign-in is email + password + authenticator code (TOTP). */
export const users = pgTable(
  "users",
  {
    id: id(),
    /** Always stored lower-case. */
    email: text("email").notNull(),
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
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email)],
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
    createdBy: uuid("created_by").references(() => users.id),
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
    userId: uuid("user_id").references(() => users.id),
    campaignId: text("campaign_id"),
    action: text("action").notNull(),
    detail: text("detail"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_logs_created_idx").on(t.createdAt)],
);

export type User = typeof users.$inferSelect;
export type Role = (typeof roleEnum.enumValues)[number];
