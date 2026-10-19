"use server";

import type { Role } from "@reorder/db";
import { revalidatePath } from "next/cache";
import { auth, formError, requireUser } from "@/lib/server/auth";
import { serverEnv } from "@/lib/server/env";

export interface UserActionState {
  error?: string;
  /** Short confirmation, e.g. "Shreya added." */
  done?: string;
}

const ROLES: Role[] = ["admin", "reviewer", "viewer"];

const field = (form: FormData, name: string) => String(form.get(name) ?? "");

function role(form: FormData): Role | undefined {
  const r = field(form, "role") as Role;
  return ROLES.includes(r) ? r : undefined;
}

/** Admin adds someone with their name, username, email, role and (optional) password. */
export async function createUserAction(_: UserActionState, form: FormData): Promise<UserActionState> {
  const admin = await requireUser(["admin"]);
  const r = role(form);
  if (!r) return { error: "Choose a role." };
  const password = field(form, "password");
  if (password !== field(form, "confirm")) return { error: "The two passwords don't match." };
  try {
    const u = await auth().createUser(admin.id, { name: field(form, "name"), username: field(form, "username"), email: field(form, "email"), role: r, password });
    revalidatePath("/settings");
    const code = serverEnv().authenticatorCode ? "; they set up the authenticator at first sign-in" : "";
    return { done: `${u.name} added. Share their username and password in person or by Teams${code}.` };
  } catch (e) {
    return { error: formError(e) };
  }
}

export async function updateUserAction(userId: string, _: UserActionState, form: FormData): Promise<UserActionState> {
  const admin = await requireUser(["admin"]);
  const r = role(form);
  if (!r) return { error: "Choose a role." };
  const password = field(form, "password");
  if (password !== field(form, "confirm")) return { error: "The two passwords don't match." };
  try {
    const u = await auth().updateUser(admin.id, userId, {
      name: field(form, "name"),
      username: field(form, "username"),
      email: field(form, "email"),
      role: r,
      password,
      resetAuthenticator: form.get("resetAuthenticator") === "on",
      unlinkAccounts: form.get("unlinkAccounts") === "on",
    });
    revalidatePath("/settings");
    return { done: `${u.name} saved.` };
  } catch (e) {
    return { error: formError(e) };
  }
}

export async function deleteUserAction(userId: string): Promise<UserActionState> {
  const admin = await requireUser(["admin"]);
  try {
    await auth().deleteUser(admin.id, userId);
    revalidatePath("/settings");
    return { done: "User deleted." };
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
