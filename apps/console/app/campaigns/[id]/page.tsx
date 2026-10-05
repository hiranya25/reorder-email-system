import { redirect } from "next/navigation";

export default async function CampaignIndex({ params }: PageProps<"/campaigns/[id]">) {
  const { id } = await params;
  redirect(`/campaigns/${id}/overview`);
}
