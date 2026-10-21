import { ConsoleShell } from "@/components/console/shell";
import { SettingsView } from "@/components/settings/settings-view";
import { MailchimpSettingsCard } from "@/components/settings/mailchimp-settings-card";
import { UsersCard } from "@/components/settings/users-card";
import { auth, requireUser } from "@/lib/server/auth";
import { serverEnv } from "@/lib/server/env";
import { loadAudit } from "@/lib/server/repo";

const METHOD_LABEL = { microsoft: "Microsoft", google: "Google", password: "Password" } as const;

export default async function SettingsPage() {
  await requireUser();
  const env = serverEnv();
  const [users, audit] = await Promise.all([auth().listUsers(), loadAudit({ limit: 100 })]);
  return (
    <ConsoleShell>
      <SettingsView
        audit={audit}
        mailchimpCard={<MailchimpSettingsCard configured={!!env.mailchimp} fromName={env.mailchimp?.fromName} replyTo={env.mailchimp?.replyTo} />}
        usersCard={
          <UsersCard
            users={users.map((u) => ({
              id: u.id,
              email: u.email,
              username: u.username ?? undefined,
              name: u.name,
              role: u.role,
              disabled: !!u.disabledAt,
              pendingInvite: u.pendingInvite,
              lastLoginAt: u.lastLoginAt?.toISOString(),
              signInMethods: u.signInMethods.map((m) => METHOD_LABEL[m]),
              authenticatorOn: u.totpEnabled,
              linkedAccount: u.signInMethods.some((m) => m !== "password"),
            }))}
            options={{ providers: env.providers.map((p) => p.label), password: env.passwordLogin, authenticator: env.authenticatorCode, domain: env.allowedEmailDomain }}
          />
        }
      />
    </ConsoleShell>
  );
}
