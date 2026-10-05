"use client";

import { useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/field";
import { Modal } from "../ui/modal";

const EMAIL_RE = /^[^\s@;,]+@[^\s@;,]+\.[^\s@;,]+$/;

export interface EmailModalTarget {
  accountId: string;
  name: string;
  /** Addresses to offer as checkboxes (from the file and any earlier choice). */
  candidates: string[];
  /** Initially ticked. */
  selected: string[];
}

/** Pick one or more addresses, or type a new one. Used for Add email, two-email accounts and Change. */
export function EmailModal({ target, onClose, onSave }: { target?: EmailModalTarget; onClose: () => void; onSave: (emails: string[]) => void }) {
  return (
    <Modal open={!!target} onClose={onClose} title={target ? (target.candidates.length ? `Choose email for ${target.name}` : `Add email for ${target.name}`) : ""}>
      {target && <EmailForm key={target.accountId} target={target} onClose={onClose} onSave={onSave} />}
    </Modal>
  );
}

function EmailForm({ target, onClose, onSave }: { target: EmailModalTarget; onClose: () => void; onSave: (emails: string[]) => void }) {
  const [checked, setChecked] = useState<string[]>(target.selected);
  const [typed, setTyped] = useState("");
  const typedClean = typed.trim().toLowerCase();
  const typedInvalid = typedClean !== "" && !EMAIL_RE.test(typedClean);
  const result = [...new Set([...checked, ...(typedClean && !typedInvalid ? [typedClean] : [])])];

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (result.length && !typedInvalid) onSave(result);
      }}
    >
      {target.candidates.length > 0 && (
        <fieldset className="space-y-2">
          <legend className="mb-1 text-xs font-medium text-ink-muted">Send to</legend>
          {target.candidates.map((email) => (
            <label key={email} className="flex items-center gap-2.5 rounded-lg border border-line px-3 py-2.5 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-navy"
                checked={checked.includes(email)}
                onChange={(e) => setChecked(e.target.checked ? [...checked, email] : checked.filter((c) => c !== email))}
              />
              <span className="font-mono text-[13px]">{email}</span>
            </label>
          ))}
        </fieldset>
      )}
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-ink-muted">{target.candidates.length ? "Or add another address" : "Email address"}</span>
        <Input type="email" placeholder="buyer@store.com" value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus={!target.candidates.length} />
        {typedInvalid && <span className="mt-1 block text-xs text-bad-fg">That doesn&apos;t look like an email address.</span>}
      </label>
      <p className="text-xs text-ink-muted">The approved address is saved, so next season this customer is approved automatically.</p>
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={!result.length || typedInvalid}>
          Approve {result.length > 1 ? `${result.length} emails` : "email"}
        </Button>
      </div>
    </form>
  );
}
