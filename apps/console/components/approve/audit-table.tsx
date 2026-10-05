import type { AuditEntry } from "@/lib/store";

export function AuditTable({ entries, showCampaign, campaignName }: { entries: AuditEntry[]; showCampaign?: boolean; campaignName?: (id: string) => string }) {
  if (entries.length === 0) return <p className="text-[13px] text-ink-muted">Nothing recorded yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-[13px]">
        <thead className="border-y border-line bg-canvas/60 text-[11px] font-semibold tracking-wide text-ink-muted uppercase">
          <tr>
            <th className="px-3 py-2.5">When</th>
            <th className="px-3 py-2.5">Who</th>
            {showCampaign && <th className="px-3 py-2.5">Campaign</th>}
            <th className="px-3 py-2.5">What</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {entries.map((e) => (
            <tr key={e.id}>
              <td className="px-3 py-2.5 whitespace-nowrap text-ink-muted">{new Date(e.at).toLocaleString()}</td>
              <td className="px-3 py-2.5">{e.by}</td>
              {showCampaign && <td className="px-3 py-2.5">{e.campaignId ? (campaignName?.(e.campaignId) ?? e.campaignId) : "—"}</td>}
              <td className="px-3 py-2.5">
                <span className="font-medium">{e.action}</span>
                {e.detail && <span className="text-ink-muted"> · {e.detail}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
