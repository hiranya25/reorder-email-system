import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { AuthShell } from "@/components/auth/auth-shell";
import { SetupForm, VerifyCodeForm } from "@/components/auth/forms";
import { auth, PENDING_COOKIE } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

export default async function VerifyPage() {
  const token = (await cookies()).get(PENDING_COOKIE)?.value;
  const pending = token ? await auth().getPending(token) : undefined;
  if (!token || !pending) redirect("/login");

  if (pending.needsTotpSetup) {
    const { secret, uri } = await auth().startTotpSetup(token);
    const qrSvg = await QRCode.toString(uri, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
    return (
      <AuthShell title="Set up your authenticator" subtitle={`One-time setup for ${pending.email}. After this, sign-in asks for a code from your phone.`}>
        <SetupForm qrSvg={qrSvg} secret={secret} />
      </AuthShell>
    );
  }
  return (
    <AuthShell title="Enter your code" subtitle={`Open your authenticator app and enter the 6-digit code for ${pending.email}.`}>
      <VerifyCodeForm />
    </AuthShell>
  );
}
