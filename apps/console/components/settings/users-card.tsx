"use client";

import { PASSWORD_RULE, passwordProblem } from "@reorder/auth/rules";
import { Eye, EyeOff, UserPlus, Wand2 } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { createUserAction, deleteUserAction, setDisabledAction, updateUserAction, type UserActionState } from "@/app/(console)/settings/user-actions";
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
  username?: string;
  name: string;
  role: SessionUser["role"];
  disabled: boolean;
  /** Hasn't finished signing in for the first time. */
  pendingInvite: boolean;
  lastLoginAt?: string;
  /** e.g. ["Microsoft"], ["Google", "Password"]. */
  signInMethods: string[];
  authenticatorOn: boolean;
  linkedAccount: boolean;
}

/** Which sign-in options this server offers, for the help text. */
export interface SignInOptions {
  providers: string[];
  password: boolean;
  /** Password sign-in also asks for a 6-digit code. */
  authenticator: boolean;
  domain: string;
}

function describeOptions(o: SignInOptions): string {
  const ways = [...o.providers.map((p) => `Sign in with ${p}`), ...(o.password ? [`username or email + password${o.authenticator ? " + an authenticator code" : ""}`] : [])];
  const list = ways.length > 1 ? `${ways.slice(0, -1).join(", ")} or ${ways.at(-1)}` : (ways[0] ?? "not set up yet");
  return `Sign-in: ${list}. Only @${o.domain} addresses can be added.`;
}

const ROLE_HELP: Record<SessionUser["role"], string> = {
  admin: "Everything, including users, settings and Mailchimp",
  reviewer: "Approve customers, choose picks, preview, approve and send",
  viewer: "See campaigns, previews and results",
};

/** 16 characters from an alphabet without look-alikes (no 0/O, 1/l/I), always meeting the password rule. */
function generatePassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789-!";
  for (;;) {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    const p = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
    if (!passwordProblem(p)) return p;
  }
}

function RoleSelect({ defaultValue }: { defaultValue: SessionUser["role"] }) {
  return (
    <select name="role" defaultValue={defaultValue} aria-label="Role" className="h-10 w-full rounded-lg border border-line bg-white px-2.5 text-sm">
      {(["admin", "reviewer", "viewer"] as const).map((r) => (
        <option key={r} value={r} title={ROLE_HELP[r]}>
          {ROLE_LABELS[r]}
        </option>
      ))}
    </select>
  );
}

/** Password + confirm, with show/hide and a generator. */
function PasswordFields({ label, hint, required }: { label: string; hint: string; required?: boolean }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [shown, setShown] = useState(false);
  const type = shown ? "text" : "password";
  return (
    <>
      <Field label={label} hint={hint}>
        <div className="flex gap-2">
          <Input name="password" type={type} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required={required} minLength={6} />
          <Button variant="secondary" className="h-10 shrink-0 px-2.5" aria-label={shown ? "Hide password" : "Show password"} onClick={() => setShown(!shown)}>
            {shown ? <EyeOff size={15} /> : <Eye size={15} />}
          </Button>
          <Button
            variant="secondary"
            className="h-10 shrink-0"
            onClick={() => {
              const p = generatePassword();
              setPassword(p);
              setConfirm(p);
              setShown(true);
            }}
          >
            <Wand2 size={14} /> Generate
          </Button>
        </div>
      </Field>
      {password && (passwordProblem(password) || (confirm && confirm !== password)) && (
        <p className="text-[12px] text-bad-fg sm:col-span-2" role="status">
          {passwordProblem(password) ?? "The two passwords don't match yet."}
        </p>
      )}
      <Field label="Type the password again">
        <Input name="confirm" type={type} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required={!!password} />
      </Field>
    </>
  );
}

function Notice({ state }: { state: UserActionState }) {
  if (state.error)
    return (
      <p className="rounded-lg bg-bad-bg px-3 py-2 text-[13px] text-bad-fg" role="status">
        {state.error}
      </p>
    );
  if (state.done)
    return (
      <p className="rounded-lg bg-ok-bg px-3 py-2 text-[13px] text-ok-fg" role="status">
        {state.done}
      </p>
    );
  return null;
}

function AddUserForm({ options }: { options: SignInOptions }) {
  // `added` counts successes; the form remounts (and empties) after each one.
  const [state, action, saving] = useActionState(async (prev: UserActionState & { added?: number }, form: FormData) => {
    const r = await createUserAction(prev, form);
    return { ...r, added: (prev.added ?? 0) + (r.done ? 1 : 0) };
  }, {} as UserActionState & { added?: number });
  const passwordOptional = options.providers.length > 0;
  return (
    <div className="mb-5 space-y-3 rounded-lg bg-canvas p-3">
      <form key={state.added ?? 0} action={action} className="space-y-3" aria-label="Add a user">
        <div className="text-[13px] font-semibold">Add a user</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Full name">
            <Input name="name" required placeholder="Shreya Patel" />
          </Field>
          <Field label="Username" hint="Optional. 3–32 letters, numbers, dot, dash or underscore.">
            <Input name="username" placeholder="shreya" autoComplete="off" />
          </Field>
          <Field label="Email">
            <Input name="email" type="email" required placeholder={`name@${options.domain}`} />
          </Field>
          <Field label="Role">
            <RoleSelect defaultValue="reviewer" />
          </Field>
          {options.password && (
            <PasswordFields
              label={passwordOptional ? "Password (optional)" : "Password"}
              hint={passwordOptional ? `${PASSWORD_RULE} Leave empty if they'll only use ${options.providers.join(" or ")}.` : PASSWORD_RULE}
              required={!passwordOptional}
            />
          )}
        </div>
        <Button type="submit" disabled={saving}>
          <UserPlus size={15} /> {saving ? "Adding…" : "Add user"}
        </Button>
      </form>
      <Notice state={state} />
    </div>
  );
}

function EditUserForm({ user, options, onDone }: { user: UserRow; options: SignInOptions; onDone: (state: UserActionState) => void }) {
  const [state, action, saving] = useActionState(async (prev: UserActionState, form: FormData) => {
    const r = await updateUserAction(user.id, prev, form);
    if (r.done) onDone(r);
    return r;
  }, {} as UserActionState);
  return (
    <form action={action} className="space-y-3" aria-label={`Edit ${user.name}`}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Full name">
          <Input name="name" required defaultValue={user.name} />
        </Field>
        <Field label="Username">
          <Input name="username" defaultValue={user.username ?? ""} autoComplete="off" />
        </Field>
        <Field label="Email">
          <Input name="email" type="email" required defaultValue={user.email} />
        </Field>
        <Field label="Role">
          <RoleSelect defaultValue={user.role} />
        </Field>
        {options.password && <PasswordFields label="New password" hint={`${PASSWORD_RULE} Leave empty to keep their current password; a new one signs them out everywhere.`} />}
      </div>
      {user.authenticatorOn && (
        <label className="flex items-start gap-2 text-[13px]">
          <input type="checkbox" name="resetAuthenticator" className="mt-0.5" />
          <span>Reset their authenticator (lost or new phone). They scan a new QR code at their next sign-in.</span>
        </label>
      )}
      {user.linkedAccount && (
        <label className="flex items-start gap-2 text-[13px]">
          <input type="checkbox" name="unlinkAccounts" className="mt-0.5" />
          <span>Untie their Microsoft/Google account, so they can sign in with a different one.</span>
        </label>
      )}
      <Notice state={state.error ? state : {}} />
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="secondary" onClick={() => onDone({})}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}

export function UsersCard({ users, options }: { users: UserRow[]; options: SignInOptions }) {
  const me = useSessionUser();
  const isAdmin = me.role === "admin";
  const [rowResult, setRowResult] = useState<UserActionState>({});
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<UserRow>();
  const [deleting, setDeleting] = useState<UserRow>();

  const run = (fn: () => Promise<UserActionState>) =>
    start(async () => {
      setRowResult(await fn());
    });

  return (
    <Card>
      <CardHeader title="Users and roles" subtitle={describeOptions(options)} />

      {isAdmin && <AddUserForm options={options} />}
      <div className="mb-3">
        <Notice state={rowResult} />
      </div>

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
                  <div className="text-[12px] text-ink-muted">
                    {u.username && <span className="font-mono">{u.username} · </span>}
                    {u.email}
                  </div>
                </td>
                <td className="px-3 py-2.5" title={ROLE_HELP[u.role]}>
                  {ROLE_LABELS[u.role]}
                </td>
                <td className="px-3 py-2.5">
                  {u.disabled ? (
                    <StatusChip tone="neutral">Disabled</StatusChip>
                  ) : u.pendingInvite ? (
                    <StatusChip tone="warn">Not signed in yet</StatusChip>
                  ) : (
                    <span className="text-[12px] text-ink-muted">
                      {[u.signInMethods.join(" + "), u.lastLoginAt ? `last sign-in ${new Date(u.lastLoginAt).toLocaleDateString()}` : "Active"].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </td>
                {isAdmin && (
                  <td className="px-3 py-2.5">
                    <div className="flex gap-3 text-[12px] font-semibold">
                      <button type="button" className="underline underline-offset-2" disabled={pending} onClick={() => setEditing(u)} aria-label={`Edit ${u.email}`}>
                        Edit
                      </button>
                      {u.id !== me.id && (
                        <>
                          <button type="button" className="underline underline-offset-2" disabled={pending} onClick={() => run(() => setDisabledAction(u.id, !u.disabled))}>
                            {u.disabled ? "Enable" : "Disable"}
                          </button>
                          <button type="button" className="text-bad-fg underline underline-offset-2" disabled={pending} onClick={() => setDeleting(u)} aria-label={`Delete ${u.email}`}>
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!isAdmin && <p className="mt-3 text-[12px] text-ink-muted">Ask an admin to add people or change access.</p>}

      <Modal open={!!editing} onClose={() => setEditing(undefined)} title={`Edit ${editing?.name ?? ""}`} wide>
        {editing && (
          <EditUserForm
            key={editing.id}
            user={editing}
            options={options}
            onDone={(s) => {
              setEditing(undefined);
              if (s.done) setRowResult(s);
            }}
          />
        )}
      </Modal>

      <Modal open={!!deleting} onClose={() => setDeleting(undefined)} title={`Delete ${deleting?.name ?? ""}?`}>
        <p className="text-[14px]">
          Their account is removed and they&apos;re signed out right away. The activity log keeps their name, and approvals they already gave stay on record. You can add them again later.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeleting(undefined)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              const u = deleting!;
              setDeleting(undefined);
              run(() => deleteUserAction(u.id));
            }}
          >
            Delete user
          </Button>
        </div>
      </Modal>
    </Card>
  );
}
