"use server";

import type { Role } from "@reorder/db";
import { revalidatePath } from "next/cache";
import { auth, formError, requireUser } from "@/lib/server/auth";
import { serverEnv } from "@/lib/server/env";

export interface UserActionState {
  error?: string;
  /** One-time invite link to hand to the person. */
  link?: string;
  email?: string;
}

const ROLES: Role[] = ["admin", "reviewer", "viewer"];

function inviteLink(token: string) {
  return `${serverEnv().appUrl}/invite/${token}`;
}

export async function inviteUserAction(_: UserActionState, form: FormData): Promise<UserActionState> {
  const admin = await requireUser(["admin"]);
  const role = String(form.get("role")) as Role;
  if (!ROLES.includes(role)) return { error: "Choose a role." };
  const email = String(form.get("email") ?? "");
  try {
    const { token } = await auth().createInvite({ email, role, createdBy: admin.id });
    revalidatePath("/settings");
    return { link: inviteLink(token), email: email.trim().toLowerCase() };
  } catch (e) {
    return { error: formError(e) };
  }
}

export async function resetUserAction(userId: string): Promise<UserActionState> {
  const admin = await requireUser(["admin"]);
  try {
    const { token } = await auth().resetUser(admin.id, userId);
    revalidatePath("/settings");
    return { link: inviteLink(token) };
  } catch (e) {
    return { error: formError(e) };
  }
}

export async function setRoleAction(userId: string, role: Role): Promise<UserActionState> {
  const admin = await requireUser(["admin"]);
  if (!ROLES.includes(role)) return { error: "Choose a role." };
  try {
    await auth().setRole(admin.id, userId, role);
    revalidatePath("/settings");
    return {};
  } catch (e) {
    return { error: formError(e) };
  }
}

export async function setDisabledAction(userId: string, disabled: boolean): Promise<UserActionState> {
  const admin = await requireUser(["admin"]);
  try {
    await auth().setDisabled(admin.id, userId, disabled);
    revalidatePath("/settings");
    return {};
  } catch (e) {
    return { error: formError(e) };
  }
}
