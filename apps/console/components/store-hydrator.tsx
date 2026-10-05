"use client";

import { useEffect } from "react";
import { useConsoleStore } from "@/lib/store";

/** Loads persisted campaigns after mount so server and client HTML match. */
export function StoreHydrator() {
  useEffect(() => {
    void useConsoleStore.persist.rehydrate();
  }, []);
  return null;
}
