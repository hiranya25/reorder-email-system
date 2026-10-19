"use client";

import { Check, Copy, Download } from "lucide-react";
import { useActionState, useState } from "react";
import { acceptInviteAction, confirmSetupAction, finishRecoveryCodesAction, loginAction, verifyCodeAction, type FormState } from "@/app/login/actions";
import { downloadText } from "@/lib/download";
import { Button } from "../ui/button";
import { Field, Input } from "../ui/field";
import { FormError } from "./auth-shell";

const initial: FormState = {};

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initial);
  return (
    <form action={action} className="space-y-4">
      <FormError message={state.error} />
      <Field label="Work email">
        <Input name="email" type="email" autoComplete="username" required autoFocus={!state.email} placeholder="you@amipi.com" defaultValue={state.email} />
      </Field>
      <Field label="Password">
        <Input name="password" type="password" autoComplete="current-password" required autoFocus={!!state.email} />
      </Field>
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Checking…" : "Continue"}
      </Button>
      <p className="text-center text-[12px] text-ink-muted">Forgot your password or lost your phone? Ask an admin to reset your sign-in.</p>
    </form>
  );
}

function CodeInput() {
  return (
    <Input
      name="code"
      inputMode="numeric"
      autoComplete="one-time-code"
      required
      autoFocus
      maxLength={12}
      placeholder="123456"
      className="h-12 text-center font-mono text-[22px] tracking-[0.3em]"
      aria-label="Authenticator code"
    />
  );
}

export function VerifyCodeForm() {
  const [state, action, pending] = useActionState(verifyCodeAction, initial);
  return (
    <form action={action} className="space-y-4">
      <FormError message={state.error} />
      <CodeInput />
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Checking…" : "Sign in"}
      </Button>
      <p className="text-center text-[12px] text-ink-muted">No phone? Enter one of your recovery codes instead (like k3f9-2m7q).</p>
    </form>
  );
}

export function SetupForm({ qrSvg, secret }: { qrSvg: string; secret: string }) {
  const [state, action, pending] = useActionState(confirmSetupAction, initial);
  return (
    <form action={action} className="space-y-4 text-[14px]">
      <ol className="list-decimal space-y-1.5 pl-5">
        <li>Open an authenticator app on your phone (Microsoft Authenticator or Google Authenticator).</li>
        <li>Add an account and scan this QR code.</li>
        <li>Enter the 6-digit code the app shows.</li>
      </ol>
      <div className="mx-auto w-48 rounded-lg border border-line bg-white p-2" aria-label="QR code for your authenticator app" dangerouslySetInnerHTML={{ __html: qrSvg }} />
      <details className="text-[12px] text-ink-muted">
        <summary className="cursor-pointer">Can&apos;t scan? Enter this key instead</summary>
        <p className="mt-1 font-mono text-[13px] break-all text-ink" data-testid="totp-secret">
          {secret.match(/.{1,4}/g)?.join(" ")}
        </p>
      </details>
      <FormError message={state.error} />
      <CodeInput />
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Checking…" : "Turn on and continue"}
      </Button>
    </form>
  );
}

export function RecoveryCodes({ codes, email }: { codes: string[]; email: string }) {
  const [copied, setCopied] = useState(false);
  const text = `AMIPI Reorder Console recovery codes for ${email}\nEach code works once.\n\n${codes.join("\n")}\n`;
  return (
    <div className="space-y-4 text-[14px]">
      <p className="flex items-center gap-2 font-semibold text-ok-fg">
        <Check size={18} /> Authenticator set up
      </p>
      <p>
        Save these <strong>recovery codes</strong> somewhere safe, like a password manager. Each one signs you in once if you lose your phone. They won&apos;t be shown again.
      </p>
      <ul className="grid grid-cols-2 gap-2 rounded-lg bg-canvas p-3 font-mono text-[14px]" data-testid="recovery-codes">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            void navigator.clipboard?.writeText(codes.join("\n"));
            setCopied(true);
          }}
        >
          <Copy size={14} /> {copied ? "Copied" : "Copy"}
        </Button>
        <Button variant="secondary" size="sm" onClick={() => downloadText("reorder-console-recovery-codes.txt", text, "text/plain")}>
          <Download size={14} /> Download
        </Button>
      </div>
      <form action={finishRecoveryCodesAction}>
        <Button type="submit" size="lg" className="w-full">
          I&apos;ve saved them, continue
        </Button>
      </form>
    </div>
  );
}

export function InviteForm({ token, email, name }: { token: string; email: string; name: string }) {
  const [state, action, pending] = useActionState(acceptInviteAction.bind(null, token), initial);
  return (
    <form action={action} className="space-y-4">
      <FormError message={state.error} />
      <Field label="Work email">
        <Input value={email} readOnly className="bg-canvas" autoComplete="username" />
      </Field>
      <Field label="Your name">
        <Input name="name" defaultValue={state.name ?? name} required autoFocus maxLength={80} autoComplete="name" />
      </Field>
      <Field label="Choose a password" hint="At least 12 characters. A short sentence works well.">
        <Input name="password" type="password" required minLength={12} autoComplete="new-password" />
      </Field>
      <Field label="Type it again">
        <Input name="confirm" type="password" required minLength={12} autoComplete="new-password" />
      </Field>
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Saving…" : "Set password and continue"}
      </Button>
    </form>
  );
}
