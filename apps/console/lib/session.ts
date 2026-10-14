/** The signed-in user as the browser sees it (set by SessionProvider from the server session). */
export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: "admin" | "reviewer" | "viewer";
}

export const ROLE_LABELS: Record<SessionUser["role"], string> = {
  admin: "Admin",
  reviewer: "Reviewer",
  viewer: "Viewer",
};

let acting: SessionUser | undefined;

/** Called by SessionProvider; lets store actions record who did what. */
export function setActingUser(user: SessionUser) {
  acting = user;
}

export function actingUser(): SessionUser | undefined {
  return acting;
}

export function actingUserName(): string {
  return acting?.name ?? "Unknown user";
}
