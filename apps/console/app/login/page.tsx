import { decrypt } from "@reorder/auth";
import { redirect } from "next/navigation";
import { AuthShell, FormError } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/forms";
import { OrDivider, SsoButtons } from "@/components/auth/sso-buttons";
import { currentUser } from "@/lib/server/auth";
import { serverEnv } from "@/lib/server/env";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await currentUser()) redirect("/campaigns");
  const env = serverEnv();
  const { e } = await searchParams;
  let error: string | undefined;
  try {
    error = typeof e === "string" && e ? decrypt(e, env.appSecret) : undefined;
  } catch {
    error = undefined;
  }
  const providers = env.providers.map((p) => ({ id: p.id, label: p.label }));
  return (
    <AuthShell
      title="Sign in"
      subtitle={`Use your @${env.allowedEmailDomain} work account.`}
    >
      <div className="space-y-4">
        <FormError message={error} />
        <SsoButtons providers={providers} />
      </div>
      {providers.length > 0 && env.passwordLogin && <OrDivider />}
      {env.passwordLogin && <LoginForm />}
      {providers.length > 0 && (
        <p className="mt-4 text-center text-[12px] text-ink-muted">
          Only people an admin has invited can sign in. Use whichever account
          your @{env.allowedEmailDomain} email is on.
        </p>
      )}
      {!providers.length && !env.passwordLogin && (
        <p className="text-[14px] text-ink-muted">
          Sign-in isn&apos;t set up yet. See docs/DEPLOY_CPANEL.md.
        </p>
      )}
    </AuthShell>
  );
}
