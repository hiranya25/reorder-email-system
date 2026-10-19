import { decrypt } from "@reorder/auth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { RecoveryCodes } from "@/components/auth/forms";
import { currentUser, RECOVERY_COOKIE } from "@/lib/server/auth";
import { serverEnv } from "@/lib/server/env";

export const dynamic = "force-dynamic";

export default async function RecoveryCodesPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const raw = (await cookies()).get(RECOVERY_COOKIE)?.value;
  let codes: string[] = [];
  try {
    codes = raw ? (JSON.parse(decrypt(raw, serverEnv().appSecret)) as string[]) : [];
  } catch {
    codes = [];
  }
  if (!codes.length) redirect("/campaigns");
  return (
    <AuthShell title="Save your recovery codes">
      <RecoveryCodes codes={codes} email={user.email} />
    </AuthShell>
  );
}
