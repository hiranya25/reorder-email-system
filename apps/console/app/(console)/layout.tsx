import { SessionProvider } from "@/components/session-provider";
import { requireUser } from "@/lib/server/auth";

// Every console page needs the database-backed session, so nothing here is prerendered.
export const dynamic = "force-dynamic";

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return <SessionProvider user={{ id: user.id, name: user.name, email: user.email, role: user.role }}>{children}</SessionProvider>;
}
