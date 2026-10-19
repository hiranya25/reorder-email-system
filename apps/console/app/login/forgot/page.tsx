import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotPasswordForm } from "@/components/auth/forms";
import { serverEnv } from "@/lib/server/env";

export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Forgot your password?"
      subtitle={`Enter your username or email and we'll email you a link to choose a new one.${serverEnv().authenticatorCode ? " Your authenticator stays the same." : ""}`}
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
