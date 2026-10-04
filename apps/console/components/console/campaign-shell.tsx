"use client";

import { createContext, useContext } from "react";
import { DEMO_CAMPAIGN } from "@reorder/core";
import { useCampaignData, type CampaignData } from "@/lib/campaign-data";
import { useStoreHydrated } from "@/lib/store";
import { ButtonLink } from "../ui/button";
import { Card } from "../ui/card";
import { ConsoleShell } from "./shell";

const CampaignContext = createContext<CampaignData | null>(null);

export function useCurrentCampaign(): CampaignData {
  const data = useContext(CampaignContext);
  if (!data) throw new Error("useCurrentCampaign must be used inside <CampaignShell>");
  return data;
}

export function CampaignShell({ id, children }: { id: string; children: React.ReactNode }) {
  const data = useCampaignData(id);
  const hydrated = useStoreHydrated();

  if (!data) {
    return (
      <ConsoleShell>
        {hydrated || id === DEMO_CAMPAIGN.id ? (
          <Card className="max-w-lg">
            <h1 className="text-lg font-semibold">Campaign not found</h1>
            <p className="mt-1 text-sm text-ink-muted">
              Campaigns are stored in this browser until the backend is connected, so it may have been created on another device.
            </p>
            <ButtonLink href="/campaigns" className="mt-4">
              Back to campaigns
            </ButtonLink>
          </Card>
        ) : (
          <p className="text-sm text-ink-muted">Loading campaign…</p>
        )}
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
