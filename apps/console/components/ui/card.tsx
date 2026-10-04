import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <section className={cn("rounded-xl border border-line bg-white p-5", className)} {...props} />;
}

export function CardHeader({
  title,
  subtitle,
  aside,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div>
        <h2 className="text-[17px] font-semibold tracking-tight">{title}</h2>
        {subtitle && <p className="mt-1 text-[13px] text-ink-muted">{subtitle}</p>}
      </div>
      {aside && <div className="shrink-0 text-[13px] text-ink-muted">{aside}</div>}
    </div>
  );
}
