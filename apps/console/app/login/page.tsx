import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/forms";
import { currentUser } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await currentUser()) redirect("/campaigns");
  return (
    <AuthShell title="Sign in" subtitle="Use your @amipi.com email.">
      <LoginForm />
    </AuthShell>
  );
}
