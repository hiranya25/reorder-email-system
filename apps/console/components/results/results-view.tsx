"use client";

import { BarChart3 } from "lucide-react";
import { useCurrentCampaign } from "../console/campaign-shell";
import { PageHeader } from "../console/page-header";
import { ButtonLink } from "../ui/button";
import { Card, CardHeader } from "../ui/card";

const METRICS = [
  ["Opens", "Share of customers who opened the email", "Mailchimp report"],
  ["Clicks", "Clicks on any link in the email", "Mailchimp report"],
  ["Reorder clicks", "Clicks on REORDER THESE ITEMS", "Mailchimp click map"],
  ["Recommendation clicks", "Clicks on the 3 new-season picks", "Mailchimp click map"],
  ["Reorders and revenue", "Orders placed from the email", "UTM links + store orders"],
] as const;

export function ResultsView() {
  const { campaign, approval } = useCurrentCampaign();
  return (
    <>
      <PageHeader crumbs={[{ label: campaign.name, href: `/campaigns/${campaign.id}/overview` }, { label: "Results" }]} title="Results" subtitle="Prove it works: engagement and reorders, by group and sales rep." />
      <Card className="mb-5 flex flex-col items-center py-10 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-cream text-gold">
          <BarChart3 size={22} />
        </span>
        <h2 className="mt-4 text-lg font-semibold">{approval?.exportedAt ? "Waiting for the send" : "No results yet"}</h2>
        <p className="mt-1 max-w-lg text-sm text-ink-muted">
          {approval?.exportedAt
            ? "Contacts were exported for Mailchimp. Results appear here once the Mailchimp connection is added with the backend; until then, check the campaign report in Mailchimp."
            : "Results appear after the campaign is approved, imported into Mailchimp and sent."}
        </p>
        {!approval && (
          <ButtonLink href={`/campaigns/${campaign.id}/approve`} className="mt-5">
            Go to Approve &amp; sync
          </ButtonLink>
        )}
      </Card>
      <Card>
        <CardHeader title="What will be measured" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {METRICS.map(([name, what, source]) => (
            <div key={name} className="rounded-lg bg-canvas p-4">
              <div className="text-[13px] font-semibold">{name}</div>
              <div className="mt-2 text-[28px] font-bold text-ink-muted/50">—</div>
              <div className="mt-1 text-[12px] text-ink-muted">{what}</div>
              <div className="mt-2 text-[11px] tracking-wide text-ink-muted uppercase">{source}</div>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
