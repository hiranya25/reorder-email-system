import { CampaignShell } from "@/components/console/campaign-shell";

export default async function CampaignLayout({ children, params }: LayoutProps<"/campaigns/[id]">) {
  const { id } = await params;
  return <CampaignShell id={id}>{children}</CampaignShell>;
}
