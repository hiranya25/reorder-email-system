import { AuthShell } from "@/components/auth/auth-shell";
import { InviteForm } from "@/components/auth/forms";
import { OrDivider, SsoButtons } from "@/components/auth/sso-buttons";
import { ButtonLink } from "@/components/ui/button";
import { auth } from "@/lib/server/auth";
import { serverEnv } from "@/lib/server/env";

export const dynamic = "force-dynamic";

export default async function InvitePage({
  params,
}: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const invite = await auth().getInvite(token);
  if (!invite) {
    return (
      <AuthShell
        title="This link has expired"
        subtitle="Invite links work once and expire after 3 days. Ask an admin to send you a new one."
      >
        <ButtonLink href="/login" variant="secondary" className="w-full">
          Go to sign in
        </ButtonLink>
      </AuthShell>
    );
  }
  const env = serverEnv();
  const providers = env.providers.map((p) => ({ id: p.id, label: p.label }));
  const role =
    invite.role === "admin"
      ? "an Admin"
      : invite.role === "reviewer"
        ? "a Reviewer"
        : "a Viewer";
  return (
    <AuthShell
      title="Welcome to the Reorder Console"
      subtitle={`You've been invited as ${role}.`}
    >
      {providers.length > 0 && (
        <>
          <p className="mb-4 text-[14px]">
            Continue with the account for <strong>{invite.email}</strong>.
            You&apos;ll use the same button every time you sign in.
          </p>
          <SsoButtons
            providers={providers}
            hint={invite.email}
            verb="Continue"
          />
        </>
      )}
      {providers.length > 0 && env.passwordLogin && <OrDivider />}
      {env.passwordLogin && (
        <InviteForm token={token} email={invite.email} name={invite.name} />
      )}
    </AuthShell>
  );
}
