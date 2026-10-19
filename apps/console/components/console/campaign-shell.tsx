"use client";

import { createContext, useContext, useEffect } from "react";
import { useCampaignData, type CampaignData } from "@/lib/campaign-data";
import { useConsoleStoreApi } from "@/lib/store";
import type { CampaignSnapshot } from "@/lib/types";
import { ButtonLink } from "../ui/button";
import { Card } from "../ui/card";
import { ConsoleShell } from "./shell";

const CampaignContext = createContext<CampaignData | null>(null);

export function useCurrentCampaign(): CampaignData {
  const data = useContext(CampaignContext);
  if (!data) throw new Error("useCurrentCampaign must be used inside <CampaignShell>");
  return data;
}

/** Loads one campaign's server data into the store and provides it to the campaign screens. */
export function CampaignShell({ id, snapshot, children }: { id: string; snapshot?: CampaignSnapshot; children: React.ReactNode }) {
  const store = useConsoleStoreApi();
  useEffect(() => {
    if (snapshot) store.getState().hydrateCampaign(snapshot);
  }, [store, snapshot]);
  const data = useCampaignData(id, snapshot);

  if (!data || !snapshot) {
    return (
      <ConsoleShell>
        <Card className="max-w-lg">
          <h1 className="text-lg font-semibold">Campaign not found</h1>
          <p className="mt-1 text-sm text-ink-muted">It may have been deleted. Check the campaigns list.</p>
          <ButtonLink href="/campaigns" className="mt-4">
            Back to campaigns
          </ButtonLink>
        </Card>
      </ConsoleShell>
    );
  }

  return (
    <CampaignContext.Provider value={data}>
      <ConsoleShell campaignId={id} steps={data.steps}>
        {children}
      </ConsoleShell>
    </CampaignContext.Provider>
  );
}
