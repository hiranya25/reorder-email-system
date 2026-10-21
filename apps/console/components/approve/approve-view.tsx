"use client";

import { canApprove, formatNumber } from "@reorder/core";
import { campaignTag, mailchimpImportCsv, renderMailchimpTemplate } from "@reorder/email";
import { AlertTriangle, Check, Download, Lock, XCircle } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { downloadCsv, downloadText } from "@/lib/download";
import { readinessFor, sendListFor } from "@/lib/derive";
import { useConsoleStore } from "@/lib/store";
import { useSessionUser } from "../session-provider";
import { useCurrentCampaign } from "../console/campaign-shell";
import { PageHeader } from "../console/page-header";
import { Button } from "../ui/button";
import { Card, CardHeader } from "../ui/card";
import { Input } from "../ui/field";
import { Modal } from "../ui/modal";
import { AuditTable } from "./audit-table";
import { MailchimpCard, useMailchimpOverview } from "./mailchimp-card";

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
  const { campaign, approval, locked, fullyApproved } = data;
  const me = useSessionUser();
  const approve = useConsoleStore((s) => s.approve);
  const reopen = useConsoleStore((s) => s.reopen);
  const markExported = useConsoleStore((s) => s.markExported);
  const refreshCampaign = useConsoleStore((s) => s.refreshCampaign);
  const mailchimp = useMailchimpOverview(campaign.id);
  const sentThroughMailchimp = mailchimp.overview?.waves.some((w) => w.status === "sent") ?? false;
  const campaignAudit = useConsoleStore((s) => s.campaignAudit[campaign.id]) ?? [];
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [reopenOpen, setReopenOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const list = useMemo(() => sendListFor(data), [data]);
  const skipped = (reason: string) => list.skipped.filter((s) => s.reason === reason).length;
  const readiness = readinessFor(data, list);
  const ready = canApprove(readiness);
  const seasonCode = list.emails[0]?.seasonCode;
  const tag = seasonCode ? campaignTag(seasonCode) : "";
  const base = `/campaigns/${campaign.id}`;
  const canReview = me.role !== "viewer";
  const iApproved = approval.approvers.some((a) => a.userId === me.id);
  const remaining = Math.max(0, approval.required - approval.approvers.length);

  const exportCsv = async () => {
    downloadCsv(`${seasonCode?.toLowerCase() ?? "reorder"}-mailchimp-contacts.csv`, mailchimpImportCsv(list));
    await markExported(campaign.id, `${list.recipients} addresses · tag ${tag}`);
  };

  return (
    <>
      <PageHeader
        crumbs={[{ label: campaign.name, href: `${base}/overview` }, { label: "Steps 6–7" }]}
        title="Approve & sync"
        subtitle="Final gate before sending. Nothing reaches customers from this console; Mailchimp sends the emails."
        actions={
          canReview && (
            <>
              {locked && !sentThroughMailchimp && (
                <Button variant="secondary" size="lg" onClick={() => setReopenOpen(true)}>
                  Reopen for changes
                </Button>
              )}
              {!fullyApproved && (
                <Button
                  size="lg"
                  disabled={!ready || iApproved || busy}
                  onClick={() => setConfirmOpen(true)}
                  title={iApproved ? "A different person must give the next approval" : ready ? undefined : "Resolve the items marked ✗ first"}
                >
                  <Lock size={16} /> {locked ? `Give approval ${approval.approvers.length + 1} of ${approval.required}` : approval.required > 1 ? `Approve (1 of ${approval.required})` : "Approve & lock"}
                </Button>
              )}
            </>
          )
        }
      />

      {locked && (
        <div className={`mb-5 rounded-xl border px-4 py-3 text-[14px] ${fullyApproved ? "border-ok-fg/30 bg-ok-bg text-ok-fg" : "border-gold/40 bg-cream text-ink"}`}>
          <div className="flex items-center gap-2 font-semibold">
            <Lock size={17} />
            {fullyApproved ? "Approved and locked" : `Locked — waiting for ${remaining} more approval${remaining === 1 ? "" : "s"} from a different person`}
          </div>
          <ul className="mt-1.5 space-y-0.5 pl-6 text-[13px]">
            {approval.approvers.map((a, i) => (
              <li key={a.userId}>
                Approval {i + 1}: <strong>{a.name}</strong>, {new Date(a.at).toLocaleString()}
                {a.userId === me.id && " (you)"}
              </li>
            ))}
            {approval.exportedAt && <li>Contacts exported {new Date(approval.exportedAt).toLocaleString()}</li>}
          </ul>
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

      <MailchimpCard
        campaignId={campaign.id}
        fullyApproved={fullyApproved}
        isAdmin={me.role === "admin"}
        state={mailchimp}
        onSent={() => void refreshCampaign(campaign.id)}
      />

      <Card className="mt-5">
        <details>
          <summary className="cursor-pointer text-[15px] font-semibold">
            Or do it by hand: CSV import into Mailchimp
            {approval?.exportedAt && <span className="ml-2 text-[13px] font-semibold text-ok-fg">Exported</span>}
          </summary>
          <p className="mt-1 mb-4 text-[13px] text-ink-muted">A backup if the direct connection isn&apos;t available. Import the contacts, then send a campaign to the tag from Mailchimp.</p>
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
            <Button
              size="sm"
              disabled={!fullyApproved || me.role !== "admin"}
              title={!fullyApproved ? `Needs ${approval.required} approvals first` : me.role !== "admin" ? "Only an admin can export" : undefined}
              onClick={() => void exportCsv()}
            >
              <Download size={14} /> Contacts CSV
            </Button>
          </li>
          <li className="flex flex-wrap items-center gap-3">
            <span className="flex size-6 items-center justify-center rounded-full bg-navy text-[12px] font-bold text-white">3</span>
            <span className="min-w-[240px] flex-1">In Mailchimp, send a regular campaign using the template to the segment tagged {tag || "with the campaign tag"}.</span>
          </li>
        </ol>
        </details>
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
            setConfirmOpen(false);
            setTyped("");
            setBusy(true);
            void approve(campaign.id).finally(() => setBusy(false));
          }}
          className="space-y-4 text-[14px]"
        >
          <p>
            <strong>{formatNumber(list.emails.length)}</strong> customers ({formatNumber(list.recipients)} addresses) will get the reorder email. {formatNumber(list.skipped.length)} accounts are left out.
          </p>
          <p className="text-ink-muted">
            {approval.required > 1
              ? `This is approval ${approval.approvers.length + 1} of ${approval.required}. The campaign locks now; a different person gives the next approval. Reopening clears all approvals.`
              : "Mapping, product and recommendation changes are locked after approval. You can reopen the campaign if something needs to change."}
          </p>
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
          All approvals are removed and the campaign can be edited again. Everyone has to approve again afterwards. If contacts were already imported into Mailchimp, export and import them again after your changes.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setReopenOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              void reopen(campaign.id);
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
