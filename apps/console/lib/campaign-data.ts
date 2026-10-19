"use client";

import { useMemo } from "react";
import { deriveCampaign, type CampaignData } from "./derive";
import { useCampaign, useConsoleStore } from "./store";
import type { CampaignSnapshot, WorkspaceSnapshot } from "./types";

export type { CampaignData } from "./derive";

const NONE: string[] = [];

/**
 * Everything a campaign screen needs. Uses the store once the campaign is loaded into it,
 * and the server snapshot (`initial`) for the very first render.
 */
export function useCampaignData(id: string, initial?: CampaignSnapshot): CampaignData | undefined {
  const campaign = useCampaign(id);
  const settings = useConsoleStore((s) => s.settings);
  const rules = useConsoleStore((s) => s.rules);
  const savedMappings = useConsoleStore((s) => s.savedMappings);
  const catalog = useConsoleStore((s) => s.catalog);
  const demoCatalogLoaded = useConsoleStore((s) => s.demoCatalogLoaded);
  const productEdits = useConsoleStore((s) => s.productEdits);
  const remembered = useConsoleStore((s) => s.remembered);
  const loaded = useConsoleStore((s) => !!s.loadedCampaigns[id]);
  const importRecord = useConsoleStore((s) => s.imports[id]);
  const decisions = useConsoleStore((s) => s.decisions[id]);
  const hidden = useConsoleStore((s) => s.hiddenProducts[id] ?? NONE);
  const productsConfirmed = useConsoleStore((s) => s.productsConfirmed[id]);
  const picks = useConsoleStore((s) => s.picks[id]);
  const approval = useConsoleStore((s) => s.approvals[id]);

  return useMemo(() => {
    if (!campaign) return undefined;
    const ws: WorkspaceSnapshot = { campaigns: [], settings, rules, savedMappings, catalog, demoCatalogLoaded, productEdits, remembered };
    const cs: CampaignSnapshot | undefined = loaded
      ? {
          campaignId: id,
          importRecord,
          decisions: decisions ?? {},
          hidden,
          productsConfirmed,
          picks,
          approval: approval ?? { approvers: [], required: settings.requiredApprovals },
          audit: [],
        }
      : initial;
    return deriveCampaign(campaign, ws, cs);
  }, [campaign, settings, rules, savedMappings, catalog, demoCatalogLoaded, productEdits, remembered, loaded, id, importRecord, decisions, hidden, productsConfirmed, picks, approval, initial]);
}
