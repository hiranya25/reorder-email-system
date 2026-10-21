"use client";

import { formatNumber } from "@reorder/core";
import { AlertTriangle, Check, Loader2, Send, UserPlus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  addMailchimpContactsAction,
  getMailchimpOverviewAction,
  sendMailchimpRoundAction,
  sendMailchimpTestAction,
  startMailchimpSyncAction,
} from "@/app/(console)/mailchimp-actions";
import type { MailchimpContactResult, MailchimpOverview, MailchimpWave } from "@/lib/types";
import { Button } from "../ui/button";
import { Card, CardHeader } from "../ui/card";
import { Input } from "../ui/field";
import { Modal } from "../ui/modal";
import { StatusChip } from "../ui/status-chip";

const RESULT_LABEL: Record<MailchimpContactResult, string> = {
  synced: "Ready",
  new: "Not in your audience yet",
  unsubscribed: "Unsubscribed (won't be emailed)",
  bounced: "Address bounced (won't be emailed)",
  not_subscribed: "Not subscribed (won't be emailed)",
  failed: "Couldn't update",
};

/** Loads the Mailchimp state for a campaign and keeps it fresh while a step runs. */
export function useMailchimpOverview(campaignId: string) {
  const [overview, setOverview] = useState<MailchimpOverview>();
  const [error, setError] = useState<string>();
  // Bumped to load again: after an action, and every 1.5 s while a step runs.
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  useEffect(() => {
    let alive = true;
    void getMailchimpOverviewAction(campaignId).then((r) => {
      if (!alive) return;
      if ("error" in r) setError(r.error);
      else {
        setOverview(r);
        setError(undefined);
      }
    });
    return () => {
      alive = false;
    };
  }, [campaignId, tick]);
  const busy = overview?.waves.some((w) => w.status === "syncing" || w.status === "sending");
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(reload, 1500);
    return () => clearInterval(t);
  }, [busy, reload]);
  return { overview, error, reload };
}

function Step({ n, done, title, children }: { n: number; done: boolean; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white ${done ? "bg-ok-fg" : "bg-navy"}`}>{done ? <Check size={13} /> : n}</span>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="font-semibold">{title}</div>
        {children}
      </div>
    </li>
  );
}

function WavePanel({
  wave,
  rounds,
  campaignId,
  canSend,
  previousSent,
  onChanged,
  onSent,
}: {
  wave: MailchimpWave;
  rounds: number;
  campaignId: string;
  canSend: boolean;
  previousSent: boolean;
  onChanged: () => void;
  onSent: () => void;
}) {
  const [pending, setPending] = useState<string>();
  const [error, setError] = useState<string>();
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [typed, setTyped] = useState("");

  const act = async (label: string, fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setPending(label);
    setError(undefined);
    const r = await fn();
    setPending(undefined);
    if (!r.ok) setError(r.error);
    onChanged();
  };

  const s = wave.status;
  const running = s === "syncing" || s === "sending";
  const synced = s === "synced" || s === "test_sent" || s === "sent";
  const sent = s === "sent";
  const newOnes = wave.attention.filter((a) => a.result === "new");
  const blocked = !canSend || running || sent || !previousSent;
  const c = wave.counts;

  return (
    <section className="space-y-4" aria-label={`Round ${wave.wave}`}>
      {rounds > 1 && (
        <div className="text-[13px]">
          <div className="font-semibold">
            Round {wave.wave} of {rounds}
          </div>
          <p className="text-ink-muted">
            {wave.wave === 1
              ? `${formatNumber(wave.planned)} addresses. Some addresses belong to more than one customer; a Mailchimp contact can hold only one customer's products at a time, so those get the other customer's email in a later round.`
              : `${formatNumber(wave.planned)} address${wave.planned === 1 ? "" : "es"} shared with another customer. They get this customer's email after round ${wave.wave - 1} is sent.`}{" "}
            Tag <span className="font-mono">{wave.tag}</span>.
          </p>
        </div>
      )}
      {sent ? (
        <div className="rounded-lg border border-ok-fg/30 bg-ok-bg px-4 py-3 text-[14px] text-ok-fg" role="status">
          <strong>Sent</strong> to {formatNumber(wave.recipients ?? 0)} contacts {wave.sentAt && `on ${new Date(wave.sentAt).toLocaleString()}`}
          {wave.sentBy && ` by ${wave.sentBy}`}. Opens and clicks appear in Mailchimp&apos;s reports.
        </div>
      ) : (
        <ol className="space-y-5 text-[14px]">
          <Step n={1} done={synced} title="Update the contacts in Mailchimp">
            <p className="text-ink-muted">
              Writes each customer&apos;s products into their Mailchimp contact and tags them <span className="font-mono">{wave.tag}</span>. Only subscribed contacts are updated; nobody gets an email yet.
            </p>
            {running && (
              <p className="flex items-center gap-2 text-navy" role="status">
                <Loader2 size={14} className="animate-spin" /> {wave.step ?? "Working…"}
              </p>
            )}
            {wave.checked > 0 && !running && (
              <div className="flex flex-wrap gap-2 text-[13px]">
                <StatusChip tone="ok">{formatNumber(c.synced ?? 0)} ready</StatusChip>
                {!!c.new && <StatusChip tone="warn">{formatNumber(c.new)} not in audience</StatusChip>}
                {!!((c.unsubscribed ?? 0) + (c.bounced ?? 0) + (c.not_subscribed ?? 0)) && (
                  <StatusChip tone="neutral">{formatNumber((c.unsubscribed ?? 0) + (c.bounced ?? 0) + (c.not_subscribed ?? 0))} unsubscribed or bounced</StatusChip>
                )}
                {!!c.failed && <StatusChip tone="bad">{formatNumber(c.failed)} failed</StatusChip>}
              </div>
            )}
            <Button size="sm" variant={synced ? "secondary" : "primary"} disabled={blocked || !!pending} onClick={() => void act("sync", () => startMailchimpSyncAction(campaignId, wave.wave))}>
              {pending === "sync" ? "Starting…" : synced || s === "failed" ? (c.failed ? "Retry failed contacts" : "Update again") : `Update ${formatNumber(wave.planned)} contacts`}
            </Button>
          </Step>

          {newOnes.length > 0 && !running && (
            <li className="rounded-lg border border-gold/40 bg-cream p-3 text-[13px]">
              <p className="font-semibold">
                {formatNumber(newOnes.length)} address{newOnes.length === 1 ? " isn't" : "es aren't"} in your Mailchimp audience yet
              </p>
              <p className="mt-1 text-ink-muted">They won&apos;t get the email unless you add them. Only add wholesale customers who expect emails from you.</p>
              <ul className="mt-2 max-h-48 space-y-1 overflow-auto">
                {newOnes.map((a) => (
                  <li key={a.email}>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={chosen.has(a.email)}
                        onChange={(e) => {
                          const next = new Set(chosen);
                          if (e.target.checked) next.add(a.email);
                          else next.delete(a.email);
                          setChosen(next);
                        }}
                        aria-label={`Add ${a.email}`}
                      />
                      <span className="font-mono">{a.email}</span>
                      <span className="text-ink-muted">· {a.company}</span>
                    </label>
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => setChosen(new Set(newOnes.map((a) => a.email)))}>
                  Select all
                </Button>
                <Button
                  size="sm"
                  disabled={!chosen.size || blocked || !!pending}
                  onClick={() =>
                    void act("add", async () => {
                      const r = await addMailchimpContactsAction(campaignId, wave.wave, [...chosen]);
                      if (r.ok) setChosen(new Set());
                      return r;
                    })
                  }
                >
                  <UserPlus size={14} /> {pending === "add" ? "Adding…" : `Add ${chosen.size || ""} as subscribed`}
                </Button>
              </div>
            </li>
          )}

          <Step n={2} done={s === "test_sent"} title="Send a test to the team">
            <p className="text-ink-muted">Creates the Mailchimp campaign from the AMIPI template and sends a test to the team test list in Settings. Check it in your inbox before sending.</p>
            {wave.testSentAt && s === "test_sent" && <p className="text-ok-fg">Test sent {new Date(wave.testSentAt).toLocaleString()}.</p>}
            <Button size="sm" variant={s === "test_sent" ? "secondary" : "primary"} disabled={blocked || !synced || !!pending} onClick={() => void act("test", () => sendMailchimpTestAction(campaignId, wave.wave))}>
              {pending === "test" ? "Sending test…" : s === "test_sent" ? "Send the test again" : "Send test email"}
            </Button>
          </Step>

          <Step n={3} done={false} title={`Send to ${formatNumber(wave.recipients ?? c.synced ?? 0)} customers`}>
            <p className="text-ink-muted">Mailchimp sends it to everyone tagged {wave.tag}. This can&apos;t be undone.</p>
            <Button size="sm" variant="gold" disabled={blocked || s !== "test_sent" || !!pending} onClick={() => setConfirmOpen(true)}>
              <Send size={14} /> Send now
            </Button>
          </Step>
        </ol>
      )}
      {!previousSent && <p className="text-[13px] text-ink-muted">Send round {wave.wave - 1} first.</p>}
      {(error || wave.error) && (
        <p className="flex items-start gap-2 rounded-lg bg-bad-bg px-3 py-2 text-[13px] text-bad-fg" role="alert">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {error ?? wave.error}
        </p>
      )}
      {wave.attention.some((a) => a.result !== "new") && !running && (
        <details className="text-[13px]">
          <summary className="cursor-pointer text-ink-muted">Who won&apos;t get it ({formatNumber(wave.attention.filter((a) => a.result !== "new").length)})</summary>
          <ul className="mt-2 space-y-1">
            {wave.attention
              .filter((a) => a.result !== "new")
              .map((a) => (
                <li key={a.email}>
                  <span className="font-mono">{a.email}</span> <span className="text-ink-muted">· {a.company} · {RESULT_LABEL[a.result]}</span>
                  {a.error && <span className="text-bad-fg"> · {a.error}</span>}
                </li>
              ))}
          </ul>
        </details>
      )}

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title={`Send to ${formatNumber(wave.recipients ?? 0)} customers?`}>
        <form
          className="space-y-4 text-[14px]"
          onSubmit={(e) => {
            e.preventDefault();
            if (typed.trim().toUpperCase() !== "SEND") return;
            setConfirmOpen(false);
            setTyped("");
            void act("send", async () => {
              const r = await sendMailchimpRoundAction(campaignId, wave.wave, "SEND");
              if (r.ok) onSent();
              return r;
            });
          }}
        >
          <p>Mailchimp emails everyone tagged <span className="font-mono">{wave.tag}</span> now. You can&apos;t take it back, and the campaign can&apos;t be reopened afterwards.</p>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-muted">Type SEND to confirm</span>
            <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus aria-label="Type SEND to confirm" />
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="gold" disabled={typed.trim().toUpperCase() !== "SEND"}>
              Send now
            </Button>
          </div>
        </form>
      </Modal>
    </section>
  );
}

export function MailchimpCard({
  campaignId,
  fullyApproved,
  isAdmin,
  state,
  onSent,
}: {
  campaignId: string;
  fullyApproved: boolean;
  isAdmin: boolean;
  state: ReturnType<typeof useMailchimpOverview>;
  onSent: () => void;
}) {
  const { overview, error, reload } = state;
  const sentCount = overview?.waves.filter((w) => w.status === "sent").length ?? 0;

  const reason = !overview
    ? undefined
    : overview.demo
      ? "The demo campaign uses made-up customers, so it can't be sent."
      : !overview.configured
        ? "Mailchimp isn't connected yet. Add MAILCHIMP_API_KEY and MAILCHIMP_AUDIENCE_ID to the server settings (see docs/DEPLOY_CPANEL.md)."
        : !fullyApproved
          ? "Available once the campaign has all its approvals."
          : !isAdmin
            ? "Only an admin can send. You can follow the progress here."
            : undefined;

  return (
    <Card className="mt-5">
      <CardHeader
        title="Send with Mailchimp"
        subtitle="Updates your Mailchimp contacts with each customer's products, sends a test, then sends the campaign."
        aside={sentCount > 0 && overview && sentCount === overview.waves.length ? <span className="font-semibold text-ok-fg">Sent</span> : undefined}
      />
      {error && <p className="text-[13px] text-bad-fg">{error}</p>}
      {!overview && !error && (
        <p className="flex items-center gap-2 text-[13px] text-ink-muted">
          <Loader2 size={14} className="animate-spin" /> Checking Mailchimp…
        </p>
      )}
      {reason && <p className="mb-3 text-[14px] text-ink-muted">{reason}</p>}
      {overview && overview.configured && !overview.demo && (
        <div className="space-y-6">
          {overview.waves.length === 0 && <p className="text-[14px] text-ink-muted">No approved customers to send to yet.</p>}
          {overview.waves.map((w, i) => (
            <WavePanel
              key={w.wave}
              wave={w}
              rounds={overview.waves.length}
              campaignId={campaignId}
              canSend={fullyApproved && isAdmin}
              previousSent={i === 0 || overview.waves[i - 1]!.status === "sent"}
              onChanged={reload}
              onSent={onSent}
            />
          ))}
        </div>
      )}
    </Card>
  );
}
