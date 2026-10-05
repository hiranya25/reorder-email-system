"use client";

import {
  DEFAULT_RULES,
  DEMO_CAMPAIGN,
  type Campaign,
  type Decision,
  type ImportRecord,
  type RememberedContact,
  type NamedMapping,
  type ReviewRules,
} from "@reorder/core";
import { del, get, set } from "idb-keyval";
import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { CURRENT_USER } from "./session";

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

export const useConsoleStore = create<ConsoleState>()(
  persist(
    (set) => ({
      campaigns: [],
      imports: {},
      savedMappings: {},
      rules: DEFAULT_RULES,
      decisions: {},
      remembered: {},
      decide: (campaignId, accountIds, status, emailsFor) =>
        set((s) => {
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
          return { decisions: { ...s.decisions, [campaignId]: campaignDecisions }, remembered };
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
          const imports = { ...s.imports };
          delete imports[id];
          const decisions = { ...s.decisions };
          delete decisions[id];
          return { campaigns: s.campaigns.filter((c) => c.id !== id), imports, decisions };
        }),
      saveImport: (campaignId, record, signature, season) =>
        set((s) => ({
          imports: { ...s.imports, [campaignId]: record },
          savedMappings: { ...s.savedMappings, [signature]: record.mapping },
          campaigns: s.campaigns.map((c) =>
            c.id === campaignId
              ? { ...c, seasonStart: season.start, seasonEnd: season.end, fileName: record.fileName, status: "imported" }
              : c,
          ),
        })),
    }),
    {
      name: "reorder-console",
      version: 3,
      storage: createJSONStorage(browserStorage),
      skipHydration: true,
      partialize: ({ campaigns, imports, savedMappings, rules, decisions, remembered }) => ({ campaigns, imports, savedMappings, rules, decisions, remembered }),
      // Older versions lack the newer keys; fill them in.
      migrate: (persisted) =>
        ({ imports: {}, savedMappings: {}, rules: DEFAULT_RULES, decisions: {}, remembered: {}, ...(persisted as object) }) as ConsoleState,
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
