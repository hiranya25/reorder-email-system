"use client";

import { LogOut, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { StepStatus } from "@reorder/core";
import { CAMPAIGN_NAV } from "@/lib/nav";
import { ROLE_LABELS } from "@/lib/session";
import { cn } from "@/lib/utils";
import { useSessionUser } from "../session-provider";
import { Logo } from "./logo";

function NavLink({ href, active, dim, children }: { href: string; active: boolean; dim?: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "block rounded-lg px-3 py-2.5 text-[14px] transition-colors",
        active ? "bg-sidebar-active font-semibold text-white" : "hover:bg-white/5",
        !active && (dim ? "text-sidebar-muted" : "text-white/85"),
      )}
    >
      {children}
    </Link>
  );
}

export function Sidebar({ campaignId, steps, onNavigate }: { campaignId?: string; steps?: StepStatus[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  const user = useSessionUser();
  const stepState = (key?: string) => steps?.find((s) => s.key === key)?.state;

  return (
    <div className="flex h-full flex-col bg-sidebar px-4 py-6" onClick={(e) => (e.target as HTMLElement).closest("a") && onNavigate?.()}>
      <Link href="/campaigns" className="px-2">
        <Logo />
      </Link>

      <nav className="mt-10 flex-1 space-y-1" aria-label="Main">
        {campaignId ? (
          <>
            <div className="mb-2 px-3 text-[11px] font-medium tracking-[0.12em] text-sidebar-muted uppercase">Campaign</div>
            {CAMPAIGN_NAV.map((item) => {
              const href = `/campaigns/${campaignId}/${item.slug}`;
              const state = stepState(item.step);
              const dim = item.step !== undefined && (state === "not_started" || state === "blocked");
              return (
                <NavLink key={item.slug} href={href} active={pathname === href} dim={dim}>
                  {item.label}
                </NavLink>
              );
            })}
          </>
        ) : (
          <NavLink href="/campaigns" active={pathname === "/campaigns"}>
            Campaigns
          </NavLink>
        )}
      </nav>

      <div className="flex items-center gap-3 border-t border-white/10 px-2 pt-4">
        <span className="flex size-8 items-center justify-center rounded-full bg-gold text-sm font-semibold text-sidebar">
          {user.name.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-sm font-semibold text-white">{user.name}</div>
          <div className="text-xs text-sidebar-muted">{ROLE_LABELS[user.role]}</div>
        </div>
        <Link href="/settings" aria-label="Settings" className="rounded p-1.5 text-sidebar-muted hover:bg-white/5 hover:text-white">
          <Settings size={17} />
        </Link>
        <form action="/logout" method="post">
          <button type="submit" aria-label="Sign out" title="Sign out" className="rounded p-1.5 text-sidebar-muted hover:bg-white/5 hover:text-white">
            <LogOut size={17} />
          </button>
        </form>
      </div>
    </div>
  );
}
