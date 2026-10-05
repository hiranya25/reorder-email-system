"use client";

import { buildEmailModel, emailChecks, renderMailchimpTemplate, renderPreviewHtml } from "@reorder/email";
import { formatNumber, picksFor, type MappingRow } from "@reorder/core";
import { AlertTriangle, Check, Download, ExternalLink, Search, XCircle } from "lucide-react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { downloadText } from "@/lib/download";
import { cn } from "@/lib/utils";
import { useCurrentCampaign } from "../console/campaign-shell";
import { PageHeader } from "../console/page-header";
import { Button, ButtonLink } from "../ui/button";
import { Card, CardHeader } from "../ui/card";
import { Input } from "../ui/field";
import { Modal } from "../ui/modal";
import { StatusChip } from "../ui/status-chip";
import { EmailFrame } from "./email-frame";

const LIST_LIMIT = 100;

function sortForPreview(rows: MappingRow[]) {
  const rank = (r: MappingRow) => (r.status === "approved" ? 0 : r.status === "pending" ? 1 : 2);
  return [...rows].sort((a, b) => rank(a) - rank(b) || a.customer.name.localeCompare(b.customer.name));
}

export function PreviewView() {
  const { campaign, mapping, catalog, catalogUploaded, edits, picks } = useCurrentCampaign();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [query, setQuery] = useState("");
  const [testOpen, setTestOpen] = useState(false);

  const sorted = useMemo(() => sortForPreview(mapping), [mapping]);
  const selectedId = params.get("account") ?? sorted[0]?.customer.accountId;
  const row = mapping.find((r) => r.customer.accountId === selectedId) ?? sorted[0];

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const hits = q ? sorted.filter((r) => r.customer.name.toLowerCase().includes(q) || r.customer.accountId.includes(q) || r.customer.emails.some((e) => e.includes(q))) : sorted;
    return hits.slice(0, LIST_LIMIT);
  }, [sorted, query]);

  const email = useMemo(() => {
    if (!row) return undefined;
    const model = buildEmailModel({
      customer: row.customer,
      emails: row.emails,
      campaignName: campaign.name,
      seasonStart: campaign.seasonStart,
      catalog,
      edits,
      picks: picksFor(row.customer, picks, catalog, edits),
    });
    const html = renderPreviewHtml(model);
    const bytes = new TextEncoder().encode(html).length;
    return { model, html, checks: emailChecks(model, { approved: row.status === "approved", htmlBytes: bytes, catalogUploaded }) };
  }, [row, campaign.name, campaign.seasonStart, catalog, edits, picks, catalogUploaded]);

  const crumbs = [{ label: campaign.name, href: `/campaigns/${campaign.id}/overview` }, { label: "Step 5" }];

  if (!row || !email) {
    return (
      <>
        <PageHeader crumbs={crumbs} title="Email preview" />
        <Card className="max-w-xl">
          <p className="font-semibold">Import sales data first</p>
          <p className="mt-1 text-sm text-ink-muted">Each customer&apos;s email is built from last season&apos;s purchases.</p>
          <ButtonLink href={`/campaigns/${campaign.id}/import`} className="mt-4">
            Import sales data
          </ButtonLink>
        </Card>
      </>
    );
  }

  const { model, html, checks } = email;
  const select = (accountId: string) => {
    const next = new URLSearchParams(params);
    next.set("account", accountId);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };
  const fileBase = `${model.seasonCode.toLowerCase()}-${model.accountId}`;

  return (
    <>
      <PageHeader
        crumbs={crumbs}
        title="Email preview"
        subtitle="See exactly what each customer will receive before anything is sent."
        actions={
          <>
            <div className="inline-flex overflow-hidden rounded-lg border border-line bg-white" role="group" aria-label="Preview size">
              {(["desktop", "mobile"] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={device === d}
                  onClick={() => setDevice(d)}
                  className={cn("h-11 px-5 text-[15px] font-semibold capitalize", device === d ? "bg-navy text-white" : "hover:bg-canvas")}
                >
                  {d}
                </button>
              ))}
            </div>
            <Button size="lg" onClick={() => setTestOpen(true)}>
              Send test to team
            </Button>
          </>
        }
      />

      <div className="grid items-start gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card className="p-4">
            <h2 className="mb-3 text-[16px] font-semibold">Preview as customer</h2>
            <span className="relative mb-3 block">
              <Search size={15} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-muted" />
              <Input className="h-9 pl-8" placeholder="Search customers" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search customers" />
            </span>
            <ul className="max-h-[340px] space-y-2 overflow-y-auto pr-1">
              {list.map((r) => {
                const active = r.customer.accountId === row.customer.accountId;
                return (
                  <li key={r.customer.accountId}>
                    <button
                      type="button"
                      onClick={() => select(r.customer.accountId)}
                      aria-current={active}
                      className={cn("w-full rounded-lg border px-3 py-2.5 text-left", active ? "border-navy bg-navy/[0.04]" : "border-line hover:bg-canvas")}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-[14px] font-semibold">{r.customer.name}</span>
                        {r.status !== "approved" && (
                          <StatusChip tone={r.status === "excluded" ? "neutral" : "warn"} className="shrink-0 text-[10px]">
                            {r.status === "excluded" ? "Excluded" : "Not approved"}
                          </StatusChip>
                        )}
                      </span>
                      <span className="mt-0.5 block text-[12px] text-ink-muted">
                        Acct {r.customer.accountId} · {formatNumber(r.customer.items.length)} product{r.customer.items.length === 1 ? "" : "s"} last season
                      </span>
                    </button>
                  </li>
                );
              })}
              {list.length === 0 && <li className="py-4 text-center text-[13px] text-ink-muted">No customers match.</li>}
            </ul>
            {!query && sorted.length > LIST_LIMIT && <p className="mt-2 text-[12px] text-ink-muted">Showing {LIST_LIMIT} of {formatNumber(sorted.length)}. Search to find others.</p>}
          </Card>

          <Card className="p-4">
            <h2 className="mb-3 text-[16px] font-semibold">Checks for this email</h2>
            <ul className="space-y-2.5">
              {checks.map((c) => (
                <li key={c.text} className="flex gap-2.5 text-[14px] leading-snug">
                  {c.level === "ok" ? (
                    <Check size={17} className="mt-0.5 shrink-0 text-ok-fg" aria-label="OK" />
                  ) : c.level === "warn" ? (
                    <AlertTriangle size={17} className="mt-0.5 shrink-0 text-warn-fg" aria-label="Warning" />
                  ) : (
                    <XCircle size={17} className="mt-0.5 shrink-0 text-bad-fg" aria-label="Problem" />
                  )}
                  <span>{c.text}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-4">
            <h2 className="mb-3 text-[16px] font-semibold">Sending details</h2>
            <dl className="space-y-1.5 text-[14px]">
              <div>
                <dt className="inline text-ink-muted">To: </dt>
                <dd className="inline font-mono text-[13px] break-all">{model.to.join(", ") || "—"}</dd>
              </div>
              <div>
                <dt className="inline text-ink-muted">Subject: </dt>
                <dd className="inline">{model.subject}</dd>
              </div>
              <div>
                <dt className="inline text-ink-muted">Recommendation group: </dt>
                <dd className="inline">{model.segment}</dd>
              </div>
            </dl>
          </Card>

          <Card className="p-4">
            <CardHeader title="Mailchimp template" subtitle="The same layout with merge tags, to save as a template in Mailchimp." />
            <Button variant="secondary" size="sm" onClick={() => downloadText(`${model.seasonCode.toLowerCase()}-mailchimp-template.html`, renderMailchimpTemplate(model), "text/html")}>
              <Download size={14} /> Download template
            </Button>
          </Card>
        </div>

        <div className="overflow-x-auto rounded-xl bg-[#e5e7eb] p-4 sm:p-6">
          <EmailFrame html={html} width={device === "desktop" ? 660 : 375} title={`Email to ${model.company}`} />
        </div>
      </div>

      <Modal open={testOpen} onClose={() => setTestOpen(false)} title="Send test to team">
        <p className="text-[14px]">
          Test sends go out through Mailchimp, which gets connected with the backend. Until then you can save this email or open it in a new tab to forward or check it.
        </p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
              window.open(url, "_blank", "noopener");
              setTimeout(() => URL.revokeObjectURL(url), 60_000);
            }}
          >
            <ExternalLink size={15} /> Open in new tab
          </Button>
          <Button onClick={() => downloadText(`${fileBase}.html`, html, "text/html")}>
            <Download size={15} /> Download email
          </Button>
        </div>
      </Modal>
    </>
  );
}
