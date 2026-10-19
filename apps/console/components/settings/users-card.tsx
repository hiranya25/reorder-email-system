"use client";

import { Copy, UserPlus } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { inviteUserAction, resetUserAction, setDisabledAction, setRoleAction, type UserActionState } from "@/app/(console)/settings/user-actions";
import { ROLE_LABELS, type SessionUser } from "@/lib/session";
import { useSessionUser } from "../session-provider";
import { Button } from "../ui/button";
import { Card, CardHeader } from "../ui/card";
import { Field, Input } from "../ui/field";
import { Modal } from "../ui/modal";
import { StatusChip } from "../ui/status-chip";

export interface UserRow {
  id: string;
  email: string;
  name: string;
  role: SessionUser["role"];
  disabled: boolean;
  pendingInvite: boolean;
  lastLoginAt?: string;
  /** e.g. ["Microsoft"], ["Google", "Password"]. */
  signInMethods: string[];
}

/** Which sign-in options this server offers, for the help text. */
export interface SignInOptions {
  providers: string[];
  password: boolean;
  domain: string;
}

function describeOptions(o: SignInOptions): string {
  const ways = [...o.providers.map((p) => `Sign in with ${p}`), ...(o.password ? ["email + password + an authenticator code"] : [])];
  const list = ways.length > 1 ? `${ways.slice(0, -1).join(", ")} or ${ways.at(-1)}` : (ways[0] ?? "not set up yet");
  return `Sign-in: ${list}. Only invited @${o.domain} addresses can get in.`;
}

export interface InviteRow {
  email: string;
  role: SessionUser["role"];
  expiresAt: string;
}

const ROLE_HELP: Record<SessionUser["role"], string> = {
  admin: "Everything, including users, settings and Mailchimp",
  reviewer: "Approve customers, choose picks, preview, approve and send",
  viewer: "See campaigns, previews and results",
};

function LinkBox({ link, note }: { link: string; note: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-2 rounded-lg border border-ok-fg/30 bg-ok-bg p-3 text-[13px]">
      <p className="text-ok-fg">{note}</p>
      <div className="flex gap-2">
        <Input readOnly value={link} className="h-9 font-mono text-[12px]" aria-label="Invite link" onFocus={(e) => e.currentTarget.select()} />
        <Button
          size="sm"
          variant="secondary"
          className="h-9"
          onClick={() => {
            void navigator.clipboard?.writeText(link);
            setCopied(true);
          }}
        >
          <Copy size={14} /> {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <p className="text-ink-muted">Send it by Teams or email. It works once and expires in 3 days.</p>
    </div>
  );
}

export function UsersCard({ users, invites, options }: { users: UserRow[]; invites: InviteRow[]; options: SignInOptions }) {
  const me = useSessionUser();
  const isAdmin = me.role === "admin";
  const [inviteState, inviteAction, inviting] = useActionState(inviteUserAction, {} as UserActionState);
  const [rowResult, setRowResult] = useState<UserActionState & { userId?: string }>({});
  const [pending, start] = useTransition();
  const [resetFor, setResetFor] = useState<UserRow>();

  const run = (userId: string, fn: () => Promise<UserActionState>) =>
    start(async () => {
      const r = await fn();
      setRowResult({ ...r, userId });
    });

  return (
    <Card>
      <CardHeader title="Users and roles" subtitle={describeOptions(options)} />

      {isAdmin && (
        <form action={inviteAction} className="mb-5 grid gap-3 rounded-lg bg-canvas p-3 sm:grid-cols-[1fr_150px_auto] sm:items-end">
          <Field label="Invite by email">
            <Input name="email" type="email" required placeholder="name@amipi.com" />
          </Field>
          <Field label="Role">
            <select name="role" defaultValue="reviewer" className="h-10 w-full rounded-lg border border-line bg-white px-2.5 text-sm">
              <option value="admin">Admin</option>
              <option value="reviewer">Reviewer</option>
              <option value="viewer">Viewer</option>
            </select>
          </Field>
          <Button type="submit" disabled={inviting} className="h-10">
            <UserPlus size={15} /> Create invite link
          </Button>
          <div className="sm:col-span-3">
            {inviteState.error && <p className="text-[13px] text-bad-fg">{inviteState.error}</p>}
            {inviteState.link && <LinkBox link={inviteState.link} note={`Invite link for ${inviteState.email} is ready.`} />}
          </div>
        </form>
      )}

      {rowResult.error && <p className="mb-3 rounded-lg bg-bad-bg px-3 py-2 text-[13px] text-bad-fg">{rowResult.error}</p>}
      {rowResult.link && (
        <div className="mb-3">
          <LinkBox
            link={rowResult.link}
            note={
              options.providers.length
                ? `Sign-in reset. Send this new link; they continue with their ${options.providers.join(" or ")} account again.`
                : "Sign-in reset. Send this new link so they can choose a password and set up their authenticator again."
            }
          />
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-left text-[13px]">
          <thead className="border-y border-line bg-canvas/60 text-[11px] font-semibold tracking-wide text-ink-muted uppercase">
            <tr>
              <th className="px-3 py-2.5">Person</th>
              <th className="px-3 py-2.5">Role</th>
              <th className="px-3 py-2.5">Status</th>
              {isAdmin && <th className="px-3 py-2.5">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {users.map((u) => (
              <tr key={u.id} className={u.disabled ? "text-ink-muted" : undefined}>
                <td className="px-3 py-2.5">
                  <div className="font-semibold">
                    {u.name} {u.id === me.id && <span className="font-normal text-ink-muted">(you)</span>}
                  </div>
                  <div className="text-[12px] text-ink-muted">{u.email}</div>
                </td>
                <td className="px-3 py-2.5">
                  {isAdmin ? (
                    <select
                      aria-label={`Role for ${u.email}`}
                      value={u.role}
                      disabled={pending}
                      onChange={(e) => run(u.id, () => setRoleAction(u.id, e.target.value as UserRow["role"]))}
                      className="h-8 rounded-md border border-line bg-white px-2 text-[13px]"
                      title={ROLE_HELP[u.role]}
                    >
                      <option value="admin">Admin</option>
                      <option value="reviewer">Reviewer</option>
                      <option value="viewer">Viewer</option>
                    </select>
                  ) : (
                    ROLE_LABELS[u.role]
                  )}
                </td>
                <td className="px-3 py-2.5">
                  {u.disabled ? (
                    <StatusChip tone="neutral">Disabled</StatusChip>
                  ) : u.pendingInvite ? (
                    <StatusChip tone="warn">Invite not accepted</StatusChip>
                  ) : (
                    <span className="text-[12px] text-ink-muted">
                      {[u.signInMethods.join(" + "), u.lastLoginAt ? `last sign-in ${new Date(u.lastLoginAt).toLocaleDateString()}` : "Active"].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </td>
                {isAdmin && (
                  <td className="px-3 py-2.5">
                    <div className="flex gap-3 text-[12px] font-semibold">
                      <button type="button" className="underline underline-offset-2" disabled={pending} onClick={() => setResetFor(u)}>
                        Reset sign-in
                      </button>
                      {u.id !== me.id && (
                        <button type="button" className="underline underline-offset-2" disabled={pending} onClick={() => run(u.id, () => setDisabledAction(u.id, !u.disabled))}>
                          {u.disabled ? "Enable" : "Disable"}
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {invites.map((i) => (
              <tr key={`invite-${i.email}`} className="text-ink-muted">
                <td className="px-3 py-2.5">{i.email}</td>
                <td className="px-3 py-2.5">{ROLE_LABELS[i.role]}</td>
                <td className="px-3 py-2.5">
                  <StatusChip tone="warn">Invited</StatusChip>
                  <span className="ml-2 text-[12px]">expires {new Date(i.expiresAt).toLocaleDateString()}</span>
                </td>
                {isAdmin && <td className="px-3 py-2.5" />}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!isAdmin && <p className="mt-3 text-[12px] text-ink-muted">Ask an admin to add people or change access.</p>}

      <Modal open={!!resetFor} onClose={() => setResetFor(undefined)} title={`Reset sign-in for ${resetFor?.name}?`}>
        <p className="text-[14px]">
          Their linked Microsoft or Google account, password, authenticator and recovery codes stop working right away, and they&apos;re signed out everywhere. You&apos;ll get a new invite link to send them.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setResetFor(undefined)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              const u = resetFor!;
              setResetFor(undefined);
              run(u.id, () => resetUserAction(u.id));
            }}
          >
            Reset and create link
          </Button>
        </div>
      </Modal>
    </Card>
  );
}
