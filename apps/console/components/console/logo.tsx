import { Gem } from "lucide-react";

export function Logo() {
  return (
    <div className="flex items-center gap-3">
      <Gem className="text-gold" size={26} strokeWidth={1.75} aria-hidden />
      <div className="leading-tight">
        <div className="text-[15px] font-semibold text-white">Reorder Console</div>
        <div className="text-xs text-sidebar-muted">Restock email system</div>
      </div>
    </div>
  );
}
