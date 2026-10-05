"use client";

import {
  DEFAULT_RULES,
  DEMO_CAMPAIGN,
  type Campaign,
  type CatalogRecord,
  type Decision,
  type ImportRecord,
  type RecommendationPicks,
  type RememberedContact,
  type NamedMapping,
  type ReviewRules,
} from "@reorder/core";
import { del, get, set } from "idb-keyval";
import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { CURRENT_USER } from "./session";
import { DEFAULT_REORDER, PLACEHOLDER_BRAND, type Brand, type ReorderSetting } from "@reorder/email";

export interface AuditEntry {
  id: string;
  at: string;
  by: string;
  campaignId?: string;
  action: string;
  detail?: string;
}

export interface Settings {
  brand: Brand;
  reorder: ReorderSetting;
  /** Team addresses for test sends once Mailchimp is connected. */
  testEmails: string[];
}

export interface Approval {
  at: string;
  by: string;
  exportedAt?: string;
}

const AUDIT_LIMIT = 500;

interface ConsoleState {
  /** Campaigns created in this browser. The demo campaign is always added on top. */
  campaigns: Campaign[];
  /** Latest confirmed import per campaign id. */
  imports: Record<string, ImportRecord>;
  /** Column choices remembered per export layout (see headerSignature). */
  savedMappings: Record<string, NamedMapping>;
  rules: ReviewRules;
  /** Mapping decisions per campaign id, then account id. */
  decisions: Record<string, Record<string, Decision>>;
  /** Approved addresses per account id, reused next season. */
  remembered: Record<string, RememberedContact>;
  decide: (campaignId: string, accountIds: string[], status: Decision["status"], emailsFor: (accountId: string) => string[]) => void;
  /** Current product catalog (shared by all campaigns). */
  catalog?: CatalogRecord;
  /** The demo campaign uses a generated catalog once the user asks for it. */
  demoCatalogLoaded: boolean;
  /** Replacement SKUs and display names, kept across seasons. Demo edits are kept apart. */
  productEdits: Record<"real" | "demo", { successor: Record<string, string>; displayName: Record<string, string> }>;
  /** SKUs hidden per campaign. */
  hiddenProducts: Record<string, string[]>;
  productsConfirmed: Record<string, { at: string; by: string }>;
  picks: Record<string, RecommendationPicks>;
  saveCatalog: (record: CatalogRecord) => void;
  loadDemoCatalog: () => void;
  setHidden: (campaignId: string, sku: string, hidden: boolean) => void;
  setSuccessor: (scope: "real" | "demo", sku: string, successor: string | undefined) => void;
  setDisplayName: (scope: "real" | "demo", sku: string, name: string | undefined) => void;
  confirmProducts: (campaignId: string, confirmed: boolean) => void;
  setPicks: (campaignId: string, update: (picks: RecommendationPicks) => RecommendationPicks) => void;
  settings: Settings;
  updateSettings: (patch: Partial<Settings>, detail: string) => void;
  /** Approved (locked) campaigns. While locked, review decisions can't change. */
  approvals: Record<string, Approval>;
  approve: (campaignId: string, detail: string) => void;
  reopen: (campaignId: string) => void;
  markExported: (campaignId: string, detail: string) => void;
  audit: AuditEntry[];
  log: (entry: Omit<AuditEntry, "id" | "at" | "by">) => void;
  clearAll: () => void;
  createCampaign: (input: Pick<Campaign, "name" | "seasonStart" | "seasonEnd">) => Campaign;
  updateCampaign: (id: string, patch: Partial<Omit<Campaign, "id">>) => void;
  deleteCampaign: (id: string) => void;
  saveImport: (campaignId: string, record: ImportRecord, signature: string, season: { start: string; end: string }) => void;
}

/**
 * IndexedDB holds far more than localStorage, which matters for large exports.
 * Falls back to memory when storage is blocked (private windows, previews).
 */
function browserStorage(): StateStorage {
  const mem = new Map<string, string>();
  const memory: StateStorage = {
    getItem: (k) => mem.get(k) ?? null,
    setItem: (k, v) => void mem.set(k, v),
    removeItem: (k) => void mem.delete(k),
  };
  if (typeof indexedDB === "undefined") return memory;
  let failed = false;
  const guard = async <T,>(op: () => Promise<T>, fallback: () => T): Promise<T> => {
    if (failed) return fallback();
    try {
      return await op();
    } catch {
      failed = true;
      return fallback();
    }
  };
  return {
    getItem: (k) => guard(async () => (await get<string>(k)) ?? null, () => memory.getItem(k) as string | null),
    setItem: (k, v) => guard(() => set(k, v), () => memory.setItem(k, v)),
    removeItem: (k) => guard(() => del(k), () => memory.removeItem(k)),
  };
}

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
}

function auditEntry(e: Omit<AuditEntry, "id" | "at" | "by">): AuditEntry {
  return { ...e, id: newId(), at: new Date().toISOString(), by: CURRENT_USER.name };
}

function withAudit(audit: AuditEntry[], e: Omit<AuditEntry, "id" | "at" | "by">): AuditEntry[] {
  return [auditEntry(e), ...audit].slice(0, AUDIT_LIMIT);
}

const INITIAL = {
  campaigns: [] as Campaign[],
  imports: {} as Record<string, ImportRecord>,
  savedMappings: {} as Record<string, NamedMapping>,
  rules: DEFAULT_RULES,
  decisions: {} as Record<string, Record<string, Decision>>,
  remembered: {} as Record<string, RememberedContact>,
  catalog: undefined as CatalogRecord | undefined,
  demoCatalogLoaded: false,
  productEdits: { real: { successor: {}, displayName: {} }, demo: { successor: {}, displayName: {} } } as ConsoleState["productEdits"],
  hiddenProducts: {} as Record<string, string[]>,
  productsConfirmed: {} as Record<string, { at: string; by: string }>,
  picks: {} as Record<string, RecommendationPicks>,
  settings: { brand: PLACEHOLDER_BRAND, reorder: DEFAULT_REORDER, testEmails: [] } as Settings,
  approvals: {} as Record<string, Approval>,
  audit: [] as AuditEntry[],
};

export const useConsoleStore = create<ConsoleState>()(
  persist(
    (set, getState) => {
      const locked = (campaignId: string) => !!getState().approvals[campaignId];
      return {
      ...INITIAL,
      saveCatalog: (record) =>
        set((s) => ({ catalog: record, audit: withAudit(s.audit, { action: "Catalog uploaded", detail: `${record.fileName} · ${record.products.length} products` }) })),
      loadDemoCatalog: () => set({ demoCatalogLoaded: true }),
      setHidden: (campaignId, sku, hidden) =>
        set((s) => {
          if (locked(campaignId)) return {};
          const current = s.hiddenProducts[campaignId] ?? [];
          const next = hidden ? [...new Set([...current, sku])] : current.filter((x) => x !== sku);
          return { hiddenProducts: { ...s.hiddenProducts, [campaignId]: next } };
        }),
      setSuccessor: (scope, sku, successor) =>
        set((s) => {
          const map = { ...s.productEdits[scope].successor };
          if (successor) map[sku] = successor;
          else delete map[sku];
          return { productEdits: { ...s.productEdits, [scope]: { ...s.productEdits[scope], successor: map } } };
        }),
      setDisplayName: (scope, sku, name) =>
        set((s) => {
          const map = { ...s.productEdits[scope].displayName };
          if (name?.trim()) map[sku] = name.trim();
          else delete map[sku];
          return { productEdits: { ...s.productEdits, [scope]: { ...s.productEdits[scope], displayName: map } } };
        }),
      confirmProducts: (campaignId, confirmed) =>
        set((s) => {
          if (locked(campaignId)) return {};
          const next = { ...s.productsConfirmed };
          if (confirmed) next[campaignId] = { at: new Date().toISOString(), by: CURRENT_USER.name };
          else delete next[campaignId];
          return { productsConfirmed: next, audit: withAudit(s.audit, { campaignId, action: confirmed ? "Product check confirmed" : "Product check reopened" }) };
        }),
      setPicks: (campaignId, update) =>
        set((s) => (locked(campaignId) ? {} : { picks: { ...s.picks, [campaignId]: update(s.picks[campaignId] ?? { bySegment: {}, byCustomer: {} }) } })),
      updateSettings: (patch, detail) => set((s) => ({ settings: { ...s.settings, ...patch }, audit: withAudit(s.audit, { action: "Settings changed", detail }) })),
      approve: (campaignId, detail) =>
        set((s) => ({
          approvals: { ...s.approvals, [campaignId]: { at: new Date().toISOString(), by: CURRENT_USER.name } },
          campaigns: s.campaigns.map((c) => (c.id === campaignId ? { ...c, status: "approved" } : c)),
          audit: withAudit(s.audit, { campaignId, action: "Campaign approved and locked", detail }),
        })),
      reopen: (campaignId) =>
        set((s) => {
          const approvals = { ...s.approvals };
          delete approvals[campaignId];
          return {
            approvals,
            campaigns: s.campaigns.map((c) => (c.id === campaignId ? { ...c, status: "imported" } : c)),
            audit: withAudit(s.audit, { campaignId, action: "Campaign reopened for changes" }),
          };
        }),
      markExported: (campaignId, detail) =>
        set((s) => {
          const a = s.approvals[campaignId];
          if (!a) return {};
          return {
            approvals: { ...s.approvals, [campaignId]: { ...a, exportedAt: new Date().toISOString() } },
            campaigns: s.campaigns.map((c) => (c.id === campaignId ? { ...c, status: "synced" } : c)),
            audit: withAudit(s.audit, { campaignId, action: "Mailchimp CSV exported", detail }),
          };
        }),
      log: (e) => set((s) => ({ audit: withAudit(s.audit, e) })),
      clearAll: () => set({ ...INITIAL }),
      decide: (campaignId, accountIds, status, emailsFor) =>
        set((s) => {
          if (locked(campaignId)) return {};
          const now = new Date().toISOString();
          const campaignDecisions = { ...(s.decisions[campaignId] ?? {}) };
          const remembered = { ...s.remembered };
          for (const id of accountIds) {
            const emails = status === "approved" ? emailsFor(id) : [];
            campaignDecisions[id] = { status, emails, decidedAt: now, decidedBy: CURRENT_USER.name };
            // The demo campaign's made-up accounts must never leak into real campaigns.
            if (campaignId === DEMO_CAMPAIGN.id) continue;
            if (status === "approved" && emails.length) remembered[id] = { emails, approvedAt: now, campaignId };
            else if (remembered[id]?.campaignId === campaignId) delete remembered[id];
          }
          const verb = { approved: "Approved", excluded: "Excluded", undecided: "Reopened" }[status];
          const audit =
            accountIds.length > 1 || status !== "undecided"
              ? withAudit(s.audit, { campaignId, action: `${verb} ${accountIds.length === 1 ? "account" : `${accountIds.length} accounts`}`, detail: accountIds.length === 1 ? accountIds[0] : undefined })
              : s.audit;
          return { decisions: { ...s.decisions, [campaignId]: campaignDecisions }, remembered, audit };
        }),
      createCampaign: (input) => {
        const campaign: Campaign = { ...input, id: newId(), status: "draft", createdAt: new Date().toISOString() };
        set((s) => ({ campaigns: [campaign, ...s.campaigns] }));
        return campaign;
      },
      updateCampaign: (id, patch) =>
        set((s) => ({ campaigns: s.campaigns.map((c) => (c.id === id ? { ...c, ...patch } : c)) })),
      deleteCampaign: (id) =>
        set((s) => {
          const drop = <T,>(rec: Record<string, T>) => {
            const next = { ...rec };
            delete next[id];
            return next;
          };
          return {
            campaigns: s.campaigns.filter((c) => c.id !== id),
            imports: drop(s.imports),
            decisions: drop(s.decisions),
            hiddenProducts: drop(s.hiddenProducts),
            productsConfirmed: drop(s.productsConfirmed),
            picks: drop(s.picks),
            approvals: drop(s.approvals),
          };
        }),
      saveImport: (campaignId, record, signature, season) =>
        set((s) => locked(campaignId) ? {} : ({
          audit: withAudit(s.audit, { campaignId, action: "Sales data imported", detail: `${record.fileName} · ${record.result.customers.length} customers` }),
          imports: { ...s.imports, [campaignId]: record },
          savedMappings: { ...s.savedMappings, [signature]: record.mapping },
          campaigns: s.campaigns.map((c) =>
            c.id === campaignId
              ? { ...c, seasonStart: season.start, seasonEnd: season.end, fileName: record.fileName, status: "imported" }
              : c,
          ),
        })),
      };
    },
    {
      name: "reorder-console",
      version: 5,
      storage: createJSONStorage(browserStorage),
      skipHydration: true,
      partialize: (s) => ({
        campaigns: s.campaigns,
        imports: s.imports,
        savedMappings: s.savedMappings,
        rules: s.rules,
        decisions: s.decisions,
        remembered: s.remembered,
        catalog: s.catalog,
        demoCatalogLoaded: s.demoCatalogLoaded,
        productEdits: s.productEdits,
        hiddenProducts: s.hiddenProducts,
        productsConfirmed: s.productsConfirmed,
        picks: s.picks,
        settings: s.settings,
        approvals: s.approvals,
        audit: s.audit,
      }),
      // Older versions lack the newer keys; fill them in.
      migrate: (persisted) =>
        ({ ...INITIAL, ...(persisted as object) }) as ConsoleState,
    },
  ),
);

export function useAllCampaigns(): Campaign[] {
  const campaigns = useConsoleStore((s) => s.campaigns);
  return [...campaigns, DEMO_CAMPAIGN];
}

export function useCampaign(id: string): Campaign | undefined {
  const campaigns = useConsoleStore((s) => s.campaigns);
  return id === DEMO_CAMPAIGN.id ? DEMO_CAMPAIGN : campaigns.find((c) => c.id === id);
}

/** True once persisted campaigns have loaded (always true for the demo campaign). */
export function useStoreHydrated(): boolean {
  return useSyncExternalStore(
    (cb) => useConsoleStore.persist.onFinishHydration(cb),
    () => useConsoleStore.persist.hasHydrated(),
    () => false,
  );
}
