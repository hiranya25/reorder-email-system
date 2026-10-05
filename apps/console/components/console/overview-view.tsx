"use client";

import { formatNumber, formatPercent, formatSeasonRange } from "@reorder/core";
import { Upload } from "lucide-react";
import { ButtonLink } from "../ui/button";
import { Card, CardHeader } from "../ui/card";
import { BarList } from "./bar-list";
import { useCurrentCampaign } from "./campaign-shell";
import { IssueList } from "./issue-list";
import { PageHeader } from "./page-header";
import { SplitBar } from "./split-bar";
import { StatCard } from "./stat-card";
import { StepTracker } from "./step-tracker";

function MiniStat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <div className="text-[22px] font-bold tracking-tight">{formatNumber(value)}</div>
      <div className="text-[13px] text-ink-muted">{label}</div>
    </div>
  );
}

export function OverviewView() {
  const { campaign, summary, issues, steps } = useCurrentCampaign();
  const base = `/campaigns/${campaign.id}`;

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Campaigns", href: "/campaigns" }, { label: campaign.name.replace(/ Reorder$/, "") }]}
        title={campaign.name}
        subtitle={
          <>
            Built from last season&apos;s sales, {formatSeasonRange(campaign.seasonStart, campaign.seasonEnd)}
            {campaign.fileName && <span className="ml-1.5 font-mono text-[13px]">· {campaign.fileName}</span>}
            {campaign.isDemo && <span className="ml-2 rounded bg-cream px-1.5 py-0.5 text-[11px] font-semibold text-gold uppercase">Demo data</span>}
          </>
        }
        actions={
          summary ? (
            <>
              <ButtonLink href={`${base}/import`} variant="secondary" size="lg">
                Re-import data
              </ButtonLink>
              <ButtonLink href={`${base}/mapping`} size="lg">
                Continue to mapping →
              </ButtonLink>
            </>
          ) : (
            <ButtonLink href={`${base}/import`} size="lg">
              Import sales data →
            </ButtonLink>
          )
        }
      />

      <div className="space-y-5">
        <StepTracker steps={steps} />

        {!summary ? (
          <Card className="flex flex-col items-center py-12 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-cream text-gold">
              <Upload size={22} />
            </span>
            <h2 className="mt-4 text-lg font-semibold">Import last season&apos;s sales to get started</h2>
            <p className="mt-1 max-w-md text-sm text-ink-muted">
              Upload the Power BI export (.xlsx or .csv). We&apos;ll check it, group purchases by customer and show what needs attention before anything is sent.
            </p>
            <ButtonLink href={`${base}/import`} className="mt-5">
              Import sales data
            </ButtonLink>
          </Card>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Customers last season" value={summary.customers} caption="accounts with at least one order" />
              <StatCard label="Ready to email" value={summary.ready} caption="one clear email on file" tone="ok" />
              <StatCard label="Needs review" value={summary.review} caption="generic, shared or double emails" tone="warn" />
              <StatCard label="No email on file" value={summary.noEmail} caption="excluded until an email is added" tone="bad" />
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <Card>
                <CardHeader title="Customers by category bought" subtitle="Used to group customers for the 3 new recommendations" />
                <BarList items={summary.categories.map((c) => ({ label: c.name, value: c.customers }))} />
              </Card>

              <Card>
                <CardHeader title="Products per customer" subtitle="The email adapts when a customer bought fewer than 3 products" />
                <SplitBar
                  label="Customers by number of products bought"
                  segments={[
                    { label: `1 · ${summary.productsPerCustomer.one}`, value: summary.productsPerCustomer.one, className: "bg-gold text-ink" },
                    { label: `2 · ${summary.productsPerCustomer.two}`, value: summary.productsPerCustomer.two, className: "bg-gold-soft text-ink" },
                    { label: `3 or more · ${summary.productsPerCustomer.threePlus}`, value: summary.productsPerCustomer.threePlus, className: "bg-navy text-white" },
                  ]}
                />
                <h3 className="mt-6 text-[17px] font-semibold tracking-tight">Lab grown vs natural</h3>
                <p className="mt-1 mb-3 text-[13px] text-ink-muted">Share of sales lines; recommendations should match what each store stocks</p>
                <SplitBar
                  label="Lab grown versus natural share of sales lines"
                  segments={[
                    { label: `Lab grown · ${formatPercent(summary.origin.labGrown)}`, value: summary.origin.labGrown, className: "bg-navy text-white" },
                    { label: `Natural · ${formatPercent(summary.origin.natural)}`, value: summary.origin.natural, className: "bg-[#d5d9e1] text-ink" },
                  ]}
                />
                <div className="mt-6 grid grid-cols-3 gap-4 border-t border-line pt-5">
                  <MiniStat value={summary.units} label="units sold" />
                  <MiniStat value={summary.skus} label={`SKUs (${formatNumber(summary.styles)} styles)`} />
                  <MiniStat value={summary.reps} label="sales reps" />
                </div>
              </Card>
            </div>

            <IssueList issues={issues} basePath={base} />
          </>
        )}
      </div>
    </>
  );
}
