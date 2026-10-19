import { AuthShell } from "@/components/auth/auth-shell";
import { ResetPasswordForm } from "@/components/auth/forms";
import { ButtonLink } from "@/components/ui/button";
import { auth } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({ params }: PageProps<"/reset-password/[token]">) {
  const { token } = await params;
  const reset = await auth().getPasswordReset(token);
  if (!reset) {
    return (
      <AuthShell title="This link has expired" subtitle="Password links work once, for 1 hour. Ask for a new one.">
        <ButtonLink href="/login/forgot" variant="secondary" className="w-full">
          Send a new link
        </ButtonLink>
      </AuthShell>
    );
  }
  return (
    <AuthShell title="Choose a new password" subtitle="You'll sign in with it and your authenticator code. You're signed out on every other device.">
      <ResetPasswordForm token={token} email={reset.username ? `${reset.username} · ${reset.email}` : reset.email} />
    </AuthShell>
  );
}
