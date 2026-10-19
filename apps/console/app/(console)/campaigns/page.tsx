import { DEMO_CAMPAIGN, type StepStatus } from "@reorder/core";
import { CampaignsHome } from "@/components/console/campaigns-home";
import { ConsoleShell } from "@/components/console/shell";
import { deriveCampaign } from "@/lib/derive";
import { loadCampaignSnapshot, loadWorkspace } from "@/lib/server/repo";

export default async function CampaignsPage() {
  const ws = await loadWorkspace();
  const all = [...ws.campaigns, DEMO_CAMPAIGN];
  const progress: Record<string, StepStatus[]> = {};
  await Promise.all(
    all.map(async (c) => {
      progress[c.id] = deriveCampaign(c, ws, await loadCampaignSnapshot(c.id)).steps;
    }),
  );
  return (
    <ConsoleShell>
      <CampaignsHome progress={progress} />
    </ConsoleShell>
  );
}
