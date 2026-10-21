"use client";

import { formatNumber } from "@reorder/core";
import { useState } from "react";
import { testMailchimpConnectionAction } from "@/app/(console)/mailchimp-actions";
import { useSessionUser } from "../session-provider";
import { Button } from "../ui/button";
import { Card, CardHeader } from "../ui/card";
import { StatusChip } from "../ui/status-chip";

type Result = Awaited<ReturnType<typeof testMailchimpConnectionAction>>;

/** Whether the Mailchimp key is set, and a button to check it reaches the right audience. */
export function MailchimpSettingsCard({ configured, fromName, replyTo }: { configured: boolean; fromName?: string; replyTo?: string }) {
  const me = useSessionUser();
  const [result, setResult] = useState<Result>();
  const [pending, setPending] = useState(false);
  return (
    <Card>
      <CardHeader
        title="Mailchimp"
        subtitle="Campaigns are sent through your Mailchimp audience. The API key lives in the server settings, never on this page."
        aside={configured ? <StatusChip tone="ok">Connected</StatusChip> : <StatusChip tone="warn">Not connected</StatusChip>}
      />
      {configured ? (
        <div className="space-y-3 text-[14px]">
          <p className="text-ink-muted">
            Sent from <strong className="text-ink">{fromName}</strong>, replies go to <strong className="text-ink">{replyTo}</strong>.
          </p>
          {me.role === "admin" && (
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={async () => {
                setPending(true);
                setResult(await testMailchimpConnectionAction());
                setPending(false);
              }}
            >
              {pending ? "Checking…" : "Test connection"}
            </Button>
          )}
          {result?.ok && (
            <p className="rounded-lg bg-ok-bg px-3 py-2 text-[13px] text-ok-fg" role="status">
              Connected to the audience <strong>{result.audience}</strong>: {formatNumber(result.members)} subscribed contacts, {result.fields} audience fields in use.
            </p>
          )}
          {result && !result.ok && (
            <p className="rounded-lg bg-bad-bg px-3 py-2 text-[13px] text-bad-fg" role="alert">
              {result.error}
            </p>
          )}
        </div>
      ) : (
        <p className="text-[14px] text-ink-muted">
          Add <span className="font-mono">MAILCHIMP_API_KEY</span> and <span className="font-mono">MAILCHIMP_AUDIENCE_ID</span> to the server settings and restart the app (docs/DEPLOY_CPANEL.md, step 4d). Until then, use the CSV export on the Approve page.
        </p>
      )}
    </Card>
  );
}
