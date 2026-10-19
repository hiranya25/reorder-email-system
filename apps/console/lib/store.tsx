"use client";

import {
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
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { createStore, useStore, type StoreApi } from "zustand";
import * as actions from "@/app/(console)/data-actions";
import { actingUser } from "./session";
import {
  isLocked,
  type ActionResult,
  type ApprovalInfo,
  type AuditEntry,
  type CampaignSnapshot,
  type ProductEditMaps,
  type Settings,
  type WorkspaceSnapshot,
} from "./types";

export type { ApprovalInfo, AuditEntry, Settings } from "./types";

/**
 * The browser's copy of the data. It's loaded from the server (see hydrators) and every change is
 * saved through a server action, which checks role and lock. Changes show immediately; if the
 * server refuses, the change is undone and the reason shown.
 */
interface ConsoleState {
  hydrated: boolean;
  campaigns: Campaign[];
  settings: Settings;
  rules: ReviewRules;
  savedMappings: Record<string, NamedMapping>;
  catalog?: CatalogRecord;
  demoCatalogLoaded: boolean;
  productEdits: ProductEditMaps;
  remembered: Record<string, RememberedContact>;

  /** Per campaign id, filled when a campaign page loads. */
  loadedCampaigns: Record<string, true>;
  imports: Record<string, ImportRecord>;
  decisions: Record<string, Record<string, Decision>>;
  hiddenProducts: Record<string, string[]>;
  productsConfirmed: Record<string, { at: string; by: string }>;
  picks: Record<string, RecommendationPicks>;
  approvals: Record<string, ApprovalInfo>;
  campaignAudit: Record<string, AuditEntry[]>;

  /** Last refused or failed save, shown in a banner. */
  saveError?: string;
  /** Saves still on their way to the server. */
  saving: number;

  hydrateWorkspace: (ws: WorkspaceSnapshot) => void;
  hydrateCampaign: (cs: CampaignSnapshot) => void;
  refreshCampaign: (campaignId: string) => Promise<void>;
  dismissError: () => void;

  createCampaign: (input: Pick<Campaign, "name" | "seasonStart" | "seasonEnd">) => Promise<Campaign | undefined>;
  deleteCampaign: (id: string) => Promise<void>;
  saveImport: (campaignId: string, record: ImportRecord, signature: string, season: { start: string; end: string }) => Promise<boolean>;
  decide: (campaignId: string, accountIds: string[], status: Decision["status"], emailsFor: (accountId: string) => string[]) => void;
  saveCatalog: (record: CatalogRecord, signature: string) => Promise<boolean>;
  loadDemoCatalog: () => void;
  setHidden: (campaignId: string, sku: string, hidden: boolean) => void;
  setSuccessor: (scope: "real" | "demo", sku: string, successor: string | undefined) => void;
  setDisplayName: (scope: "real" | "demo", sku: string, name: string | undefined) => void;
  confirmProducts: (campaignId: string, confirmed: boolean) => void;
  setPicks: (campaignId: string, update: (picks: RecommendationPicks) => RecommendationPicks) => void;
  approve: (campaignId: string) => Promise<boolean>;
  reopen: (campaignId: string) => Promise<boolean>;
  markExported: (campaignId: string, detail: string) => Promise<boolean>;
  updateSettings: (patch: Partial<Settings>, detail: string) => Promise<boolean>;
  saveRules: (rules: ReviewRules) => Promise<boolean>;
  clearAll: () => Promise<boolean>;
}

const OFFLINE = "Couldn't reach the server, so this change wasn't saved. Check your connection and reload the page (the console may also have just been updated).";

/**
 * One store per browser tab (and per request during server rendering), never module-wide:
 * a shared store on the server would mix different users' data.
 */
function createConsoleStore(initial: WorkspaceSnapshot) {
  return createStore<ConsoleState>()((set, get) => {
  /** Calls a server action; on failure shows the reason and returns false. */
  async function call(server: () => Promise<ActionResult>): Promise<boolean> {
    set((s) => ({ saving: s.saving + 1 }));
    try {
      const r = await server();
      if (!r.ok) set({ saveError: r.error });
      return r.ok;
    } catch {
      set({ saveError: OFFLINE });
      return false;
    } finally {
      set((s) => ({ saving: s.saving - 1 }));
    }
  }

  /** Shows a change at once and saves it; if the server refuses, puts the old values back. */
  function optimistic(keys: (keyof ConsoleState)[], apply: (s: ConsoleState) => Partial<ConsoleState>, server: () => Promise<ActionResult>, campaignId?: string) {
    if (actingUser()?.role === "viewer") {
      set({ saveError: "You have view-only access, so changes aren't saved." });
      return;
    }
    if (campaignId && isLocked(get().approvals[campaignId])) {
      set({ saveError: "This campaign is approved and locked. Reopen it on Approve & sync to make changes." });
      return;
    }
    const before = Object.fromEntries(keys.map((k) => [k, get()[k]])) as Partial<ConsoleState>;
    set(apply(get()));
    void call(server).then((ok) => {
      if (!ok) set(before);
    });
  }

  return {
    loadedCampaigns: {},
    imports: {},
    decisions: {},
    hiddenProducts: {},
    productsConfirmed: {},
    picks: {},
    approvals: {},
    campaignAudit: {},
    saveError: undefined,
    saving: 0,

    hydrateWorkspace: (ws) => set({ ...ws, hydrated: true }),

    hydrateCampaign: (cs) =>
      set((s) => {
        const id = cs.campaignId;
        const without = <T,>(rec: Record<string, T>) => {
          const next = { ...rec };
          delete next[id];
          return next;
        };
        return {
          loadedCampaigns: { ...s.loadedCampaigns, [id]: true },
          imports: cs.importRecord ? { ...s.imports, [id]: cs.importRecord } : without(s.imports),
          decisions: { ...s.decisions, [id]: cs.decisions },
          hiddenProducts: { ...s.hiddenProducts, [id]: cs.hidden },
          productsConfirmed: cs.productsConfirmed ? { ...s.productsConfirmed, [id]: cs.productsConfirmed } : without(s.productsConfirmed),
          picks: cs.picks ? { ...s.picks, [id]: cs.picks } : without(s.picks),
          approvals: { ...s.approvals, [id]: cs.approval },
          campaignAudit: { ...s.campaignAudit, [id]: cs.audit },
        };
      }),

    refreshCampaign: async (campaignId) => {
      try {
        const cs = await actions.getCampaignSnapshotAction(campaignId);
        if (cs) get().hydrateCampaign(cs);
      } catch {
        set({ saveError: OFFLINE });
      }
    },

    dismissError: () => set({ saveError: undefined }),

    createCampaign: async (input) => {
      let created: Campaign | undefined;
      const ok = await call(async () => {
        const r = await actions.createCampaignAction(input);
        created = r.campaign;
        return r;
      });
      if (!ok || !created) return undefined;
      const campaign = created;
      set((s) => ({ campaigns: [campaign, ...s.campaigns] }));
      return campaign;
    },

    deleteCampaign: async (id) => {
      if (await call(() => actions.deleteCampaignAction(id))) set((s) => ({ campaigns: s.campaigns.filter((c) => c.id !== id) }));
    },

    saveImport: async (campaignId, record, signature, season) => {
      const ok = await call(() => actions.saveImportAction(campaignId, record, signature, season));
      if (ok) {
        set((s) => ({
          imports: { ...s.imports, [campaignId]: record },
          savedMappings: { ...s.savedMappings, [signature]: record.mapping },
          campaigns: s.campaigns.map((c) => (c.id === campaignId ? { ...c, seasonStart: season.start, seasonEnd: season.end, fileName: record.fileName, status: "imported" } : c)),
        }));
      }
      return ok;
    },

    decide: (campaignId, accountIds, status, emailsFor) => {
      const items = accountIds.map((accountId) => ({ accountId, emails: status === "approved" ? emailsFor(accountId) : [] }));
      const by = actingUser()?.name ?? "";
      optimistic(
        ["decisions", "remembered"],
        (s) => {
          const now = new Date().toISOString();
          const campaignDecisions = { ...(s.decisions[campaignId] ?? {}) };
          const remembered = { ...s.remembered };
          for (const { accountId, emails } of items) {
            campaignDecisions[accountId] = { status, emails, decidedAt: now, decidedBy: by };
            if (campaignId === DEMO_CAMPAIGN.id) continue;
            if (status === "approved" && emails.length) remembered[accountId] = { emails, approvedAt: now, campaignId };
            else if (remembered[accountId]?.campaignId === campaignId) delete remembered[accountId];
          }
          return { decisions: { ...s.decisions, [campaignId]: campaignDecisions }, remembered };
        },
        () => actions.decideAction(campaignId, items, status),
        campaignId,
      );
    },

    saveCatalog: async (record, signature) => {
      const ok = await call(() => actions.saveCatalogAction(record, signature));
      if (ok) set((s) => ({ catalog: record, savedMappings: { ...s.savedMappings, [`catalog:${signature}`]: record.mapping as NamedMapping } }));
      return ok;
    },

    loadDemoCatalog: () => optimistic(["demoCatalogLoaded"], () => ({ demoCatalogLoaded: true }), () => actions.loadDemoCatalogAction()),

    setHidden: (campaignId, sku, hidden) =>
      optimistic(
        ["hiddenProducts"],
        (s) => {
          const current = s.hiddenProducts[campaignId] ?? [];
          return { hiddenProducts: { ...s.hiddenProducts, [campaignId]: hidden ? [...new Set([...current, sku])] : current.filter((x) => x !== sku) } };
        },
        () => actions.setHiddenAction(campaignId, sku, hidden),
        campaignId,
      ),

    setSuccessor: (scope, sku, successor) =>
      optimistic(
        ["productEdits"],
        (s) => {
          const map = { ...s.productEdits[scope].successor };
          if (successor) map[sku] = successor;
          else delete map[sku];
          return { productEdits: { ...s.productEdits, [scope]: { ...s.productEdits[scope], successor: map } } };
        },
        () => actions.setSuccessorAction(scope, sku, successor),
      ),

    setDisplayName: (scope, sku, name) =>
      optimistic(
        ["productEdits"],
        (s) => {
          const map = { ...s.productEdits[scope].displayName };
          if (name?.trim()) map[sku] = name.trim();
          else delete map[sku];
          return { productEdits: { ...s.productEdits, [scope]: { ...s.productEdits[scope], displayName: map } } };
        },
        () => actions.setDisplayNameAction(scope, sku, name),
      ),

    confirmProducts: (campaignId, confirmed) =>
      optimistic(
        ["productsConfirmed"],
        (s) => {
          const next = { ...s.productsConfirmed };
          if (confirmed) next[campaignId] = { at: new Date().toISOString(), by: actingUser()?.name ?? "" };
          else delete next[campaignId];
          return { productsConfirmed: next };
        },
        () => actions.confirmProductsAction(campaignId, confirmed),
        campaignId,
      ),

    setPicks: (campaignId, update) => {
      const next = update(get().picks[campaignId] ?? { bySegment: {}, byCustomer: {} });
      optimistic(["picks"], (s) => ({ picks: { ...s.picks, [campaignId]: next } }), () => actions.savePicksAction(campaignId, next), campaignId);
    },

    approve: async (campaignId) => {
      const ok = await call(() => actions.approveAction(campaignId));
      await get().refreshCampaign(campaignId);
      return ok;
    },

    reopen: async (campaignId) => {
      const ok = await call(() => actions.reopenAction(campaignId));
      await get().refreshCampaign(campaignId);
      return ok;
    },

    markExported: async (campaignId, detail) => {
      const ok = await call(() => actions.markExportedAction(campaignId, detail));
      await get().refreshCampaign(campaignId);
      return ok;
    },

    updateSettings: async (patch, detail) => {
      const ok = await call(() => actions.updateSettingsAction(patch, detail));
      if (ok) set((s) => ({ settings: { ...s.settings, ...patch } }));
      return ok;
    },

    saveRules: async (rules) => {
      const ok = await call(() => actions.saveRulesAction(rules));
      if (ok) set({ rules });
      return ok;
    },

    clearAll: () => call(() => actions.clearAllAction()),
    ...initial,
    hydrated: true,
  };
  });
}

const StoreContext = createContext<StoreApi<ConsoleState> | null>(null);

/** Wraps the console; refreshed server data (router.refresh) flows in through `snapshot`. */
export function ConsoleStoreProvider({ snapshot, children }: { snapshot: WorkspaceSnapshot; children: React.ReactNode }) {
  const [store] = useState(() => createConsoleStore(snapshot));
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    store.getState().hydrateWorkspace(snapshot);
  }, [store, snapshot]);
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useConsoleStoreApi(): StoreApi<ConsoleState> {
  const store = useContext(StoreContext);
  if (!store) throw new Error("Console store used outside <ConsoleStoreProvider>");
  return store;
}

export function useConsoleStore<T>(selector: (s: ConsoleState) => T): T {
  return useStore(useConsoleStoreApi(), selector);
}

export function useAllCampaigns(): Campaign[] {
  const campaigns = useConsoleStore((s) => s.campaigns);
  return [...campaigns, DEMO_CAMPAIGN];
}

export function useCampaign(id: string): Campaign | undefined {
  const campaigns = useConsoleStore((s) => s.campaigns);
  return id === DEMO_CAMPAIGN.id ? DEMO_CAMPAIGN : campaigns.find((c) => c.id === id);
}

/** True once the workspace data from the server is in the store. */
export function useStoreHydrated(): boolean {
  return useConsoleStore((s) => s.hydrated);
}
