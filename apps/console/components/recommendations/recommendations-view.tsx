"use client";

import { formatNumber, picksFor, PICK_SLOTS, segmentOf, suggestPicks, type CustomerRecord, type Product } from "@reorder/core";
import { Plus, Search, Sparkles, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useConsoleStore } from "@/lib/store";
import { useCurrentCampaign } from "../console/campaign-shell";
import { LockBanner } from "../console/lock-banner";
import { PageHeader } from "../console/page-header";
import { ProductPicker, ProductThumb } from "../products/product-picker";
import { Button, ButtonLink } from "../ui/button";
import { Card, CardHeader } from "../ui/card";
import { Input } from "../ui/field";
import { Modal } from "../ui/modal";

type Target = { kind: "segment"; key: string; slot: number } | { kind: "customer"; accountId: string; slot: number };

function Slots({ skus, catalog, onPick, onClear }: { skus: string[]; catalog: Map<string, Product>; onPick: (slot: number) => void; onClear: (slot: number) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2.5">
      {Array.from({ length: PICK_SLOTS }, (_, i) => {
        const p = skus[i] ? catalog.get(skus[i]!) : undefined;
        return p ? (
          <div key={i} className="relative rounded-lg border border-line p-2">
            <button type="button" onClick={() => onPick(i)} className="block w-full text-left" title="Change product">
              <ProductThumb product={p} size={88} />
              <span className="mt-1.5 line-clamp-2 block text-[12px] leading-snug font-semibold">{p.name || p.sku}</span>
              <span className="block truncate font-mono text-[10px] text-ink-muted">{p.sku}</span>
            </button>
            <button type="button" aria-label={`Remove ${p.name}`} onClick={() => onClear(i)} className="absolute top-1 right-1 rounded-full bg-white/90 p-0.5 text-ink-muted shadow-sm hover:text-bad-fg">
              <X size={14} />
            </button>
          </div>
        ) : (
          <button
            key={i}
            type="button"
            onClick={() => onPick(i)}
            className="flex min-h-[150px] flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-line text-[12px] font-semibold text-ink-muted hover:border-navy hover:text-navy"
          >
            <Plus size={18} /> Pick {i + 1}
          </button>
        );
      })}
    </div>
  );
}

export function RecommendationsView() {
  const { campaign, importRecord, catalog, catalogUploaded, products, picks, segments, edits } = useCurrentCampaign();
  const setPicks = useConsoleStore((s) => s.setPicks);
  const [target, setTarget] = useState<Target>();
  const [addOverride, setAddOverride] = useState(false);
  const [customerQuery, setCustomerQuery] = useState("");
  const [whoQuery, setWhoQuery] = useState("");

  const customers = useMemo(() => importRecord?.result.customers ?? [], [importRecord]);
  const byId = useMemo(() => new Map(customers.map((c) => [c.accountId, c])), [customers]);
  const done = segments.filter((s) => s.filled === PICK_SLOTS || s.overridden === s.customers).length;

  const update = (t: Target, sku: string) =>
    setPicks(campaign.id, (p) => {
      if (t.kind === "segment") {
        const slots = Array.from({ length: PICK_SLOTS }, (_, i) => p.bySegment[t.key]?.[i] ?? "");
        slots[t.slot] = sku;
        return { ...p, bySegment: { ...p.bySegment, [t.key]: slots } };
      }
      const slots = Array.from({ length: PICK_SLOTS }, (_, i) => p.byCustomer[t.accountId]?.[i] ?? "");
      slots[t.slot] = sku;
      return { ...p, byCustomer: { ...p.byCustomer, [t.accountId]: slots } };
    });

  const suggestAll = () =>
    setPicks(campaign.id, (p) => {
      const bySegment = { ...p.bySegment };
      for (const s of segments) bySegment[s.key] = suggestPicks(s.key, bySegment[s.key] ?? [], products, edits);
      return { ...p, bySegment };
    });

  const removeOverride = (accountId: string) =>
    setPicks(campaign.id, (p) => {
      const byCustomer = { ...p.byCustomer };
      delete byCustomer[accountId];
      return { ...p, byCustomer };
    });

  const whoRows = useMemo(() => {
    const q = whoQuery.trim().toLowerCase();
    return customers
      .filter((c) => !q || c.name.toLowerCase().includes(q) || c.accountId.includes(q) || segmentOf(c).toLowerCase().includes(q))
      .slice(0, 25)
      .map((c) => {
        const own = picks.byCustomer[c.accountId];
        const chosen = (own ?? picks.bySegment[segmentOf(c)] ?? []).filter(Boolean).length;
        const got = picksFor(c, picks, catalog, edits);
        return { c, own: !!own, chosen, got };
      });
  }, [customers, picks, catalog, edits, whoQuery]);

  const crumbs = [{ label: campaign.name, href: `/campaigns/${campaign.id}/overview` }, { label: "Step 4" }];
  const pickerTitle = target?.kind === "segment" ? `Pick ${target.slot + 1} for ${target.key}` : target ? `Pick ${target.slot + 1} for ${byId.get(target.accountId)?.name}` : "";

  if (!importRecord || !catalogUploaded) {
    return (
      <>
        <PageHeader crumbs={crumbs} title="Recommendations" subtitle="Pick 3 new-season products for each customer group." />
        <Card className="max-w-xl">
          <p className="font-semibold">{importRecord ? "Upload the product catalog first" : "Import sales data first"}</p>
          <p className="mt-1 text-sm text-ink-muted">Recommendations are chosen from the catalog&apos;s new-season, in-stock products.</p>
          <ButtonLink href={`/campaigns/${campaign.id}/${importRecord ? "products" : "import"}`} className="mt-4">
            {importRecord ? "Go to Product check" : "Import sales data"}
          </ButtonLink>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        crumbs={crumbs}
        title="Recommendations"
        subtitle="Pick 3 new-season products for each customer group. A customer never gets a product they already bought."
        actions={
          <Button size="lg" variant="secondary" onClick={suggestAll} title="Fill empty slots with new-season items from each group's category">
            <Sparkles size={16} className="text-gold" /> Suggest picks
          </Button>
        }
      />
      <LockBanner />

      <Card className="mb-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2 text-[14px]">
          <span className="font-semibold">
            {done} of {segments.length} groups have 3 picks
          </span>
          <span className="text-[12px] text-ink-muted">Groups = each customer&apos;s main lab grown / natural mix and top category last season</span>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-track">
          <div className="h-full rounded-full bg-navy" style={{ width: `${(done / Math.max(1, segments.length)) * 100}%` }} />
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        {segments.map((s) => (
          <Card key={s.key}>
            <CardHeader
              title={s.key}
              subtitle={`${formatNumber(s.customers)} customer${s.customers === 1 ? "" : "s"}${s.overridden ? ` · ${s.overridden} with their own picks` : ""}`}
              aside={s.filled === PICK_SLOTS ? <span className="font-semibold text-ok-fg">Done</span> : `${s.filled} of 3`}
            />
            <Slots skus={s.picks} catalog={catalog} onPick={(slot) => setTarget({ kind: "segment", key: s.key, slot })} onClear={(slot) => update({ kind: "segment", key: s.key, slot }, "")} />
          </Card>
        ))}
      </div>

      <Card className="mt-5">
        <CardHeader
          title="Customer overrides"
          subtitle="Give a specific customer their own 3 picks instead of their group's."
          aside={
            <Button size="sm" variant="secondary" onClick={() => setAddOverride(true)}>
              <Plus size={14} /> Add customer
            </Button>
          }
        />
        {Object.keys(picks.byCustomer).length === 0 ? (
          <p className="text-[13px] text-ink-muted">No overrides. Every customer gets their group&apos;s picks.</p>
        ) : (
          <div className="grid gap-5 lg:grid-cols-2">
            {Object.entries(picks.byCustomer).map(([accountId, skus]) => {
              const c = byId.get(accountId);
              return (
                <div key={accountId} className="rounded-lg border border-line p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div>
                      <div className="text-[14px] font-semibold">{c?.name ?? accountId}</div>
                      <div className="text-[12px] text-ink-muted">
                        Acct {accountId} · group {c ? segmentOf(c) : "—"}
                      </div>
                    </div>
                    <button type="button" className="text-[12px] text-ink-muted underline underline-offset-2" onClick={() => removeOverride(accountId)}>
                      Use group picks
                    </button>
                  </div>
                  <Slots skus={skus} catalog={catalog} onPick={(slot) => setTarget({ kind: "customer", accountId, slot })} onClear={(slot) => update({ kind: "customer", accountId, slot }, "")} />
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card className="mt-5">
        <CardHeader title="Who gets which picks" subtitle="What each customer's email will show after skipping products they already bought." />
        <span className="relative mb-3 block max-w-xs">
          <Search size={15} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-muted" />
          <Input className="h-9 pl-8" placeholder="Customer, account or group" value={whoQuery} onChange={(e) => setWhoQuery(e.target.value)} aria-label="Search customers" />
        </span>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-[13px]">
            <thead className="border-y border-line bg-canvas/60 text-[11px] font-semibold tracking-wide text-ink-muted uppercase">
              <tr>
                <th className="px-3 py-2.5">Customer</th>
                <th className="px-3 py-2.5">Group</th>
                <th className="px-3 py-2.5">New-season picks in their email</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {whoRows.map(({ c, own, chosen, got }) => (
                <tr key={c.accountId}>
                  <td className="px-3 py-2.5">
                    <div className="font-semibold">{c.name}</div>
                    <div className="text-[11px] text-ink-muted">Acct {c.accountId}</div>
                  </td>
                  <td className="px-3 py-2.5">{own ? <span className="font-semibold">Own picks</span> : segmentOf(c)}</td>
                  <td className="px-3 py-2.5">
                    {got.length ? got.map((p) => p.name || p.sku).join(" · ") : <span className="text-ink-muted">None yet</span>}
                    {chosen > got.length && <span className="ml-2 text-[11px] text-warn-fg">{chosen - got.length} skipped (already bought or unavailable)</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[12px] text-ink-muted">Showing up to 25 customers. Search to find others.</p>
      </Card>

      <ProductPicker
        key={target ? JSON.stringify(target) : "closed"}
        open={!!target}
        title={pickerTitle}
        products={products}
        defaultNewOnly={products.some((p) => p.isNew)}
        onClose={() => setTarget(undefined)}
        onPick={(p) => {
          if (target) update(target, p.sku);
          setTarget(undefined);
        }}
      />

      <Modal open={addOverride} onClose={() => setAddOverride(false)} title="Give a customer their own picks">
        <Input placeholder="Search customer or account" value={customerQuery} onChange={(e) => setCustomerQuery(e.target.value)} autoFocus aria-label="Search customer" />
        <ul className="mt-3 max-h-[50vh] space-y-1 overflow-y-auto">
          {customers
            .filter((c: CustomerRecord) => !picks.byCustomer[c.accountId])
            .filter((c) => !customerQuery || c.name.toLowerCase().includes(customerQuery.toLowerCase()) || c.accountId.includes(customerQuery))
            .slice(0, 30)
            .map((c) => (
              <li key={c.accountId}>
                <button
                  type="button"
                  className="w-full rounded-lg px-3 py-2 text-left hover:bg-canvas"
                  onClick={() => {
                    setPicks(campaign.id, (p) => ({ ...p, byCustomer: { ...p.byCustomer, [c.accountId]: [...(p.bySegment[segmentOf(c)] ?? ["", "", ""])] } }));
                    setAddOverride(false);
                    setCustomerQuery("");
                  }}
                >
                  <span className="text-[14px] font-semibold">{c.name}</span>
                  <span className="ml-2 text-[12px] text-ink-muted">
                    Acct {c.accountId} · {segmentOf(c)}
                  </span>
                </button>
              </li>
            ))}
        </ul>
      </Modal>
    </>
  );
}
