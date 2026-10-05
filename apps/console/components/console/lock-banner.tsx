"use client";

import { Lock } from "lucide-react";
import Link from "next/link";
import { useCurrentCampaign } from "./campaign-shell";

/** Shown on review screens once the campaign is approved: changes are blocked until it's reopened. */
export function LockBanner() {
  const { campaign, approval } = useCurrentCampaign();
  if (!approval) return null;
  return (
    <div className="mb-5 flex items-center gap-3 rounded-xl border border-line bg-cream px-4 py-3 text-[14px]">
      <Lock size={17} className="shrink-0 text-gold" />
      <p className="flex-1">
        Approved by {approval.by} on {new Date(approval.at).toLocaleDateString()}. Changes are locked so the emails match what was approved.
      </p>
      <Link href={`/campaigns/${campaign.id}/approve`} className="font-semibold underline underline-offset-4">
        Reopen
      </Link>
    </div>
  );
}
