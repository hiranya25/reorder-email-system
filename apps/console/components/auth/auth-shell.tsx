import { Gem } from "lucide-react";

/** Centered card used by the sign-in, verify and invite screens. */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: React.ReactNode; children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-[420px]">
        <div className="mb-6 flex items-center justify-center gap-3">
          <Gem className="text-gold" size={28} strokeWidth={1.75} aria-hidden />
          <div className="leading-tight">
            <div className="text-[17px] font-semibold">Reorder Console</div>
            <div className="text-xs text-ink-muted">AMIPI restock email system</div>
          </div>
        </div>
        <section className="rounded-xl border border-line bg-white p-6 shadow-sm">
          <h1 className="text-[20px] font-bold tracking-tight">{title}</h1>
          {subtitle && <div className="mt-1 text-[14px] text-ink-muted">{subtitle}</div>}
          <div className="mt-5">{children}</div>
        </section>
      </div>
    </main>
  );
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-lg bg-bad-bg px-3 py-2.5 text-[13px] text-bad-fg">
      {message}
    </p>
  );
}
