/** Shown the moment a link is clicked, while the next page loads. */
export function PageSkeleton({ label = "Loading…" }: { label?: string }) {
  const bar = "animate-pulse rounded-md bg-line/70";
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-5">
      <span className="sr-only">{label}</span>
      <div className="space-y-2">
        <div className={`${bar} h-3 w-40`} />
        <div className={`${bar} h-7 w-72`} />
        <div className={`${bar} h-4 w-96 max-w-full`} />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-xl border border-line bg-white p-5">
            <div className={`${bar} h-3 w-24`} />
            <div className={`${bar} mt-3 h-7 w-16`} />
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-line bg-white p-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className={`${bar} mb-3 h-4`} style={{ width: `${90 - i * 9}%` }} />
        ))}
      </div>
    </div>
  );
}
