"use client";

import { DEMO_CAMPAIGN, type Campaign } from "@reorder/core";
import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface ConsoleState {
  /** Campaigns created in this browser. The demo campaign is always added on top. */
  campaigns: Campaign[];
  createCampaign: (input: Pick<Campaign, "name" | "seasonStart" | "seasonEnd">) => Campaign;
  deleteCampaign: (id: string) => void;
}

/** localStorage can throw (private mode, blocked storage); fall back to memory. */
const safeStorage = createJSONStorage(() => {
  try {
    const probe = "__reorder_probe__";
    window.localStorage.setItem(probe, probe);
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    const mem = new Map<string, string>();
    return {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
    };
  }
});

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
}

export const useConsoleStore = create<ConsoleState>()(
  persist(
    (set) => ({
      campaigns: [],
      createCampaign: (input) => {
        const campaign: Campaign = {
          ...input,
          id: newId(),
          status: "draft",
          createdAt: new Date().toISOString(),
        };
        set((s) => ({ campaigns: [campaign, ...s.campaigns] }));
        return campaign;
      },
      deleteCampaign: (id) => set((s) => ({ campaigns: s.campaigns.filter((c) => c.id !== id) })),
    }),
    { name: "reorder-console", version: 1, storage: safeStorage, skipHydration: true },
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
