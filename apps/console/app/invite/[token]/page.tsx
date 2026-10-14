import { AuthShell } from "@/components/auth/auth-shell";
import { InviteForm } from "@/components/auth/forms";
import { ButtonLink } from "@/components/ui/button";
import { auth } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const invite = await auth().getInvite(token);
  if (!invite) {
    return (
      <AuthShell title="This link has expired" subtitle="Invite links work once and expire after 3 days. Ask an admin to send you a new one.">
        <ButtonLink href="/login" variant="secondary" className="w-full">
          Go to sign in
        </ButtonLink>
      </AuthShell>
    );
  }
  return (
    <AuthShell title="Welcome to the Reorder Console" subtitle={`You've been invited as ${invite.role === "admin" ? "an Admin" : invite.role === "reviewer" ? "a Reviewer" : "a Viewer"}.`}>
      <InviteForm token={token} email={invite.email} name={invite.name} />
    </AuthShell>
  );
}
