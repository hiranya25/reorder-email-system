"use client";

import { approvalReadiness, canApprove, formatNumber, recommendationsComplete } from "@reorder/core";
import { buildSendList, campaignTag, mailchimpImportCsv, renderMailchimpTemplate } from "@reorder/email";
import { AlertTriangle, Check, Download, Lock, XCircle } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { downloadCsv, downloadText } from "@/lib/download";
import { useConsoleStore } from "@/lib/store";
import { useCurrentCampaign } from "../console/campaign-shell";
import { PageHeader } from "../console/page-header";
import { Button } from "../ui/button";
import { Card, CardHeader } from "../ui/card";
import { Input } from "../ui/field";
import { Modal } from "../ui/modal";
import { AuditTable } from "./audit-table";

const CONFIRM_WORD = "APPROVE";

function Stat({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div className="rounded-lg bg-canvas px-4 py-3">
      <div className="text-[12px] text-ink-muted">{label}</div>
      <div className="text-[24px] font-bold tracking-tight">{formatNumber(value)}</div>
      {note && <div className="text-[12px] text-ink-muted">{note}</div>}
    </div>
  );
}

export function ApproveView() {
  const data = useCurrentCampaign();
  const { campaign, mapping, catalog, catalogUploaded, edits, picks, segments, settings, productsConfirmed, approval } = data;
  const approve = useConsoleStore((s) => s.approve);
  const reopen = useConsoleStore((s) => s.reopen);
  const markExported = useConsoleStore((s) => s.markExported);
  const audit = useConsoleStore((s) => s.audit);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [reopenOpen, setReopenOpen] = useState(false);

  const list = useMemo(
    () => buildSendList(mapping, { campaignName: campaign.name, seasonStart: campaign.seasonStart, catalog, edits, picks, brand: settings.brand, reorder: settings.reorder }),
    [mapping, campaign.name, campaign.seasonStart, catalog, edits, picks, settings],
  );
  const skipped = (reason: string) => list.skipped.filter((s) => s.reason === reason).length;
  const brandSet = !/^\[.*\]$/.test(settings.brand.brandName.trim()) && !/^\[.*\]$/.test(settings.brand.address.trim());
  const readiness = approvalReadiness({
    pendingAccounts: skipped("not_decided"),
    catalogUploaded,
    productsConfirmed,
    recommendationsComplete: recommendationsComplete(segments),
    reorderLinkSet: settings.reorder.mode !== "none",
    brandSet,
    emails: list.emails.length,
  });
  const ready = canApprove(readiness);
  const seasonCode = list.emails[0]?.seasonCode;
  const tag = seasonCode ? campaignTag(seasonCode) : "";
  const campaignAudit = audit.filter((a) => a.campaignId === campaign.id);
  const base = `/campaigns/${campaign.id}`;

  const exportCsv = () => {
    downloadCsv(`${seasonCode?.toLowerCase() ?? "reorder"}-mailchimp-contacts.csv`, mailchimpImportCsv(list));
    markExported(campaign.id, `${list.recipients} addresses · tag ${tag}`);
  };

  return (
    <>
      <PageHeader
        crumbs={[{ label: campaign.name, href: `${base}/overview` }, { label: "Steps 6–7" }]}
        title="Approve & sync"
        subtitle="Final gate before sending. Nothing reaches customers from this console; Mailchimp sends the emails."
        actions={
          approval ? (
            <Button variant="secondary" size="lg" onClick={() => setReopenOpen(true)}>
              Reopen for changes
            </Button>
          ) : (
            <Button size="lg" disabled={!ready} onClick={() => setConfirmOpen(true)} title={ready ? undefined : "Resolve the items marked ✗ first"}>
              <Lock size={16} /> Approve &amp; lock
            </Button>
          )
        }
      />

      {approval && (
        <div className="mb-5 flex items-center gap-3 rounded-xl border border-ok-fg/30 bg-ok-bg px-4 py-3 text-[14px] text-ok-fg">
          <Lock size={17} />
          <span>
            Approved and locked by <strong>{approval.by}</strong> on {new Date(approval.at).toLocaleString()}.
            {approval.exportedAt && ` Contacts exported ${new Date(approval.exportedAt).toLocaleString()}.`}
          </span>
        </div>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Who gets the email" subtitle={seasonCode ? `Mailchimp tag: ${tag}` : undefined} />
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Emails" value={list.emails.length} note={`${formatNumber(list.recipients)} addresses`} />
            <Stat label="Excluded" value={skipped("excluded")} note="by reviewer" />
            <Stat label="Not decided yet" value={skipped("not_decided")} note="on Customer mapping" />
            <Stat label="Nothing to show" value={skipped("no_products")} note="all products left out" />
          </div>
          <p className="mt-4 text-[13px] text-ink-muted">
            Subject: <span className="text-ink">{list.emails[0]?.subject ?? "—"}</span>
          </p>
        </Card>

        <Card>
          <CardHeader title="Before approving" />
          <ul className="space-y-2.5">
            {readiness.map((r) => (
              <li key={r.id} className="flex items-start gap-2.5 text-[14px]">
                {r.ok ? (
                  <Check size={17} className="mt-0.5 shrink-0 text-ok-fg" aria-label="Done" />
                ) : r.blocking ? (
                  <XCircle size={17} className="mt-0.5 shrink-0 text-bad-fg" aria-label="Blocking" />
                ) : (
                  <AlertTriangle size={17} className="mt-0.5 shrink-0 text-warn-fg" aria-label="Warning" />
                )}
                <span className="flex-1">{r.text}</span>
                {!r.ok && !approval && (
                  <Link href={r.href.startsWith("/") ? r.href : `${base}/${r.href}`} className="text-[13px] font-semibold underline underline-offset-4">
                    Fix
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader
          title="Sync to Mailchimp"
          subtitle="Direct sync arrives with the backend. Until then, import the contacts into Mailchimp and send to the tag."
          aside={approval?.exportedAt ? <span className="font-semibold text-ok-fg">Exported</span> : undefined}
        />
        <ol className="space-y-4 text-[14px]">
          <li className="flex flex-wrap items-center gap-3">
            <span className="flex size-6 items-center justify-center rounded-full bg-navy text-[12px] font-bold text-white">1</span>
            <span className="min-w-[240px] flex-1">Save the email as a template in Mailchimp (one time per season).</span>
            <Button variant="secondary" size="sm" disabled={!list.emails[0]} onClick={() => list.emails[0] && downloadText(`${seasonCode?.toLowerCase()}-mailchimp-template.html`, renderMailchimpTemplate(list.emails[0]), "text/html")}>
              <Download size={14} /> Email template
            </Button>
          </li>
          <li className="flex flex-wrap items-center gap-3">
            <span className="flex size-6 items-center justify-center rounded-full bg-navy text-[12px] font-bold text-white">2</span>
            <span className="min-w-[240px] flex-1">
              Import the contacts CSV into the audience (update existing contacts). It fills every merge field and adds the tag <span className="font-mono text-[13px]">{tag || "—"}</span>.
            </span>
            <Button size="sm" disabled={!approval} title={approval ? undefined : "Approve first"} onClick={exportCsv}>
              <Download size={14} /> Contacts CSV
            </Button>
          </li>
          <li className="flex flex-wrap items-center gap-3">
            <span className="flex size-6 items-center justify-center rounded-full bg-navy text-[12px] font-bold text-white">3</span>
            <span className="min-w-[240px] flex-1">In Mailchimp, send a regular campaign using the template to the segment tagged {tag || "with the campaign tag"}.</span>
          </li>
        </ol>
      </Card>

      <Card className="mt-5">
        <CardHeader title="Activity for this campaign" subtitle="Every approval, import and export, with who did it." />
        <AuditTable entries={campaignAudit} />
      </Card>

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Approve and lock this campaign?">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (typed.trim().toUpperCase() !== CONFIRM_WORD) return;
            approve(campaign.id, `${list.emails.length} emails · ${list.recipients} addresses`);
            setConfirmOpen(false);
            setTyped("");
          }}
          className="space-y-4 text-[14px]"
        >
          <p>
            <strong>{formatNumber(list.emails.length)}</strong> customers ({formatNumber(list.recipients)} addresses) will get the reorder email. {formatNumber(list.skipped.length)} accounts are left out.
          </p>
          <p className="text-ink-muted">Mapping, product and recommendation changes are locked after approval. You can reopen the campaign if something needs to change.</p>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-muted">Type {CONFIRM_WORD} to confirm</span>
            <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus aria-label={`Type ${CONFIRM_WORD} to confirm`} />
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={typed.trim().toUpperCase() !== CONFIRM_WORD}>
              Approve &amp; lock
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={reopenOpen} onClose={() => setReopenOpen(false)} title="Reopen for changes?">
        <p className="text-[14px]">
          The approval is removed and the campaign can be edited again. If contacts were already imported into Mailchimp, export and import them again after your changes.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setReopenOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              reopen(campaign.id);
              setReopenOpen(false);
            }}
          >
            Reopen
          </Button>
        </div>
      </Modal>
    </>
  );
}
