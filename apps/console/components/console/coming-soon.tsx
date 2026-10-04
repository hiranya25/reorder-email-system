"use client";

import { Hammer } from "lucide-react";
import { navItem } from "@/lib/nav";
import { Card } from "../ui/card";
import { useCurrentCampaign } from "./campaign-shell";
import { PageHeader } from "./page-header";

/** Placeholder for screens built in a later frontend phase. */
export function ComingSoon({ slug, title, subtitle, features }: { slug: string; title: string; subtitle: string; features: string[] }) {
  const { campaign } = useCurrentCampaign();
  const item = navItem(slug);
  const stepNo = ["import", "mapping", "products", "recommendations", "preview", "approve", "results"].indexOf(slug) + 1;

  return (
    <>
      <PageHeader
        crumbs={[{ label: campaign.name, href: `/campaigns/${campaign.id}/overview` }, { label: stepNo > 0 ? `Step ${stepNo}` : item.label }]}
        title={title}
        subtitle={subtitle}
      />
      <Card className="max-w-2xl">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-cream text-gold">
            <Hammer size={18} />
          </span>
          <div>
            <div className="font-semibold">Built in phase {item.phase}</div>
            <div className="text-[13px] text-ink-muted">This screen will include:</div>
          </div>
        </div>
        <ul className="mt-4 list-disc space-y-1.5 pl-5 text-[14px]">
          {features.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      </Card>
    </>
  );
}
