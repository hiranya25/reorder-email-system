import type { ProviderId } from "@reorder/auth";

function MicrosoftLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden>
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}

function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
      />
    </svg>
  );
}

const LOGO: Record<ProviderId, () => React.JSX.Element> = {
  microsoft: MicrosoftLogo,
  google: GoogleLogo,
};

/** "Sign in with Microsoft" / "Sign in with Google". Plain links, so they work without JavaScript. */
export function SsoButtons({
  providers,
  hint,
  verb = "Sign in",
}: {
  providers: { id: ProviderId; label: string }[];
  hint?: string;
  verb?: string;
}) {
  if (!providers.length) return null;
  return (
    <div className="space-y-2.5">
      {providers.map((p) => {
        const Logo = LOGO[p.id];
        const href = `/auth/${p.id}/start${hint ? `?hint=${encodeURIComponent(hint)}` : ""}`;
        return (
          <a
            key={p.id}
            href={href}
            className="flex h-11 w-full items-center justify-center gap-3 rounded-lg border border-line bg-white text-[15px] font-semibold text-ink shadow-sm transition-colors hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
          >
            <Logo />
            {verb} with {p.label}
          </a>
        );
      })}
    </div>
  );
}

export function OrDivider() {
  return (
    <div
      className="my-5 flex items-center gap-3 text-[12px] text-ink-muted"
      aria-hidden
    >
      <span className="h-px flex-1 bg-line" />
      or
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}
