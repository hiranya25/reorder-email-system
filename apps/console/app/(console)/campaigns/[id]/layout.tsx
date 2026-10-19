import { CampaignShell } from "@/components/console/campaign-shell";
import { loadCampaignSnapshot } from "@/lib/server/repo";

export default async function CampaignLayout({ children, params }: LayoutProps<"/campaigns/[id]">) {
  const { id } = await params;
  const snapshot = /^[\w-]{1,64}$/.test(id) ? await loadCampaignSnapshot(id) : undefined;
  return (
    <CampaignShell id={id} snapshot={snapshot}>
      {children}
    </CampaignShell>
  );
}
