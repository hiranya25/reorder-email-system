import { ConsoleShell } from "@/components/console/shell";
import { SettingsView } from "@/components/settings/settings-view";
import { UsersCard } from "@/components/settings/users-card";
import { auth, requireUser } from "@/lib/server/auth";

export default async function SettingsPage() {
  const me = await requireUser();
  const [users, invites] = await Promise.all([auth().listUsers(), me.role === "admin" ? auth().listOpenInvites() : Promise.resolve([])]);
  return (
    <ConsoleShell>
      <SettingsView
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
            }))}
            invites={invites.map((i) => ({ email: i.email, role: i.role, expiresAt: i.expiresAt.toISOString() }))}
          />
        }
      />
    </ConsoleShell>
  );
}
