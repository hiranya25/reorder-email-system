import { ConsoleShell } from "@/components/console/shell";
import { SettingsView } from "@/components/settings/settings-view";
import { UsersCard } from "@/components/settings/users-card";
import { auth, requireUser } from "@/lib/server/auth";
import { serverEnv } from "@/lib/server/env";
import { loadAudit } from "@/lib/server/repo";

const METHOD_LABEL = { microsoft: "Microsoft", google: "Google", password: "Password" } as const;

export default async function SettingsPage() {
  const me = await requireUser();
  const [users, invites, audit] = await Promise.all([
    auth().listUsers(),
    me.role === "admin" ? auth().listOpenInvites() : Promise.resolve([]),
    loadAudit({ limit: 100 }),
  ]);
  return (
    <ConsoleShell>
      <SettingsView
        audit={audit}
        usersCard={
          <UsersCard
            users={users.map((u) => ({
              id: u.id,
              email: u.email,
              name: u.name,
              role: u.role,
              disabled: !!u.disabledAt,
              pendingInvite: u.pendingInvite,
              lastLoginAt: u.lastLoginAt?.toISOString(),
              signInMethods: u.signInMethods.map((m) => METHOD_LABEL[m]),
            }))}
            options={{ providers: serverEnv().providers.map((p) => p.label), password: serverEnv().passwordLogin, domain: serverEnv().allowedEmailDomain }}
            invites={invites.map((i) => ({ email: i.email, role: i.role, expiresAt: i.expiresAt.toISOString() }))}
          />
        }
      />
    </ConsoleShell>
  );
}
