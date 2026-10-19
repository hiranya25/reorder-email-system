"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { encrypt } from "@reorder/auth";
import { assertPasswordLogin, auth, clearCookie, formError, PENDING_COOKIE, RECOVERY_COOKIE, requestMeta, SESSION_COOKIE, SESSION_SECONDS, setCookie } from "@/lib/server/auth";
import { serverEnv } from "@/lib/server/env";
import { canSendMail, passwordResetMail, sendMail } from "@/lib/server/mail";

export interface FormState {
  error?: string;
  /** Typed values to put back after an error (React resets the form after each submit). */
  email?: string;
  name?: string;
  /** Forgot password: the email step is done. */
  sent?: boolean;
}

const PENDING_SECONDS = 10 * 60;

export async function loginAction(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "");
  try {
    assertPasswordLogin();
    const { sessionToken } = await auth().login(email, String(form.get("password") ?? ""), await requestMeta());
    await setCookie(PENDING_COOKIE, sessionToken, PENDING_SECONDS);
  } catch (e) {
    return { error: formError(e), email };
  }
  redirect("/login/verify");
}

async function pendingToken(): Promise<string> {
  return (await cookies()).get(PENDING_COOKIE)?.value ?? "";
}

export async function verifyCodeAction(_: FormState, form: FormData): Promise<FormState> {
  try {
    assertPasswordLogin();
    const { sessionToken } = await auth().verifyLogin(await pendingToken(), String(form.get("code") ?? ""), await requestMeta());
    await setCookie(SESSION_COOKIE, sessionToken, SESSION_SECONDS);
    await clearCookie(PENDING_COOKIE);
  } catch (e) {
    return { error: formError(e) };
  }
  redirect("/campaigns");
}

/**
 * First sign-in: checks the first authenticator code. The recovery codes ride in a short-lived
 * encrypted cookie to the next page, which shows them once.
 */
export async function confirmSetupAction(_: FormState, form: FormData): Promise<FormState> {
  try {
    assertPasswordLogin();
    const { sessionToken, recoveryCodes } = await auth().confirmTotpSetup(await pendingToken(), String(form.get("code") ?? ""), await requestMeta());
    await setCookie(SESSION_COOKIE, sessionToken, SESSION_SECONDS);
    await setCookie(RECOVERY_COOKIE, encrypt(JSON.stringify(recoveryCodes), serverEnv().appSecret), 10 * 60);
    await clearCookie(PENDING_COOKIE);
  } catch (e) {
    return { error: formError(e) };
  }
  redirect("/login/recovery-codes");
}

export async function finishRecoveryCodesAction() {
  await clearCookie(RECOVERY_COOKIE);
  redirect("/campaigns");
}

export async function acceptInviteAction(token: string, _: FormState, form: FormData): Promise<FormState> {
  const password = String(form.get("password") ?? "");
  const name = String(form.get("name") ?? "");
  if (password !== String(form.get("confirm") ?? "")) return { error: "The two passwords don't match.", name };
  try {
    assertPasswordLogin();
    const { sessionToken } = await auth().acceptInvite(token, { name, password }, await requestMeta());
    await setCookie(PENDING_COOKIE, sessionToken, PENDING_SECONDS);
  } catch (e) {
    return { error: formError(e), name };
  }
  redirect("/login/verify");
}

/** Always answers the same way, so the page doesn't reveal which accounts exist. */
export async function forgotPasswordAction(_: FormState, form: FormData): Promise<FormState> {
  const identifier = String(form.get("email") ?? "").trim();
  if (!serverEnv().passwordLogin) return { error: "Sign in with Microsoft or Google instead; there's no console password to reset." };
  if (!canSendMail()) return { error: "Password reset by email isn't set up yet. Ask an admin to set a new password for you.", email: identifier };
  if (!identifier) return { error: "Enter your username or email." };
  try {
    const link = await auth().requestPasswordReset(identifier);
    if (link) {
      await sendMail(passwordResetMail({ to: link.email, name: link.name, link: `${serverEnv().appUrl}/reset-password/${link.token}`, minutes: 60 }));
    }
  } catch (e) {
    console.error("Password reset email failed", e);
    return { error: "We couldn't send the email just now. Try again in a few minutes, or ask an admin.", email: identifier };
  }
  return { sent: true };
}

export async function resetPasswordAction(token: string, _: FormState, form: FormData): Promise<FormState> {
  const password = String(form.get("password") ?? "");
  if (password !== String(form.get("confirm") ?? "")) return { error: "The two passwords don't match." };
  try {
    assertPasswordLogin();
    await auth().resetPassword(token, password);
  } catch (e) {
    return { error: formError(e) };
  }
  redirect("/login?reset=1");
}
