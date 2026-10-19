import { SessionProvider } from "@/components/session-provider";
import { requireUser } from "@/lib/server/auth";
import { loadWorkspace } from "@/lib/server/repo";
import { ConsoleStoreProvider } from "@/lib/store";

// Every console page reads the signed-in user and live data, so nothing here is prerendered.
export const dynamic = "force-dynamic";

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const workspace = await loadWorkspace();
  return (
    <SessionProvider user={{ id: user.id, name: user.name, email: user.email, role: user.role }}>
      <ConsoleStoreProvider snapshot={workspace}>{children}</ConsoleStoreProvider>
    </SessionProvider>
  );
}
