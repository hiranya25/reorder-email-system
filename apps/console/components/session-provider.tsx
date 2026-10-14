"use client";

import { createContext, useContext } from "react";
import { setActingUser, type SessionUser } from "@/lib/session";

const SessionContext = createContext<SessionUser | null>(null);

export function SessionProvider({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  setActingUser(user);
  return <SessionContext.Provider value={user}>{children}</SessionContext.Provider>;
}

export function useSessionUser(): SessionUser {
  const user = useContext(SessionContext);
  if (!user) throw new Error("useSessionUser must be used inside <SessionProvider>");
  return user;
}
