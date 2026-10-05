"use client";

import type { Product } from "@reorder/core";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Input } from "../ui/field";
import { Modal } from "../ui/modal";
import { StatusChip } from "../ui/status-chip";

const LIMIT = 60;

export function ProductThumb({ product, size = 44 }: { product?: Product; size?: number }) {
  return product?.imageUrl ? (
    // Catalog images come from any store host, so next/image's allow-list doesn't fit here.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={product.imageUrl} alt="" width={size} height={size} className="shrink-0 rounded-md border border-line bg-cream object-cover" style={{ width: size, height: size }} />
  ) : (
    <span className="flex shrink-0 items-center justify-center rounded-md border border-dashed border-line bg-canvas text-[10px] text-ink-muted" style={{ width: size, height: size }}>
      No image
    </span>
  );
}

/** Searchable product grid used to pick a recommendation or a replacement. */
export function ProductPicker({
  open,
  title,
  products,
  onClose,
  onPick,
  defaultNewOnly = false,
  exclude = [],
  footer,
}: {
  open: boolean;
  title: string;
  products: Product[];
  onClose: () => void;
  onPick: (product: Product) => void;
  defaultNewOnly?: boolean;
  exclude?: string[];
  footer?: React.ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [newOnly, setNewOnly] = useState(defaultNewOnly);
  const [category, setCategory] = useState("");
  const categories = useMemo(() => [...new Set(products.map((p) => p.category).filter(Boolean) as string[])].sort(), [products]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter(
      (p) =>
        p.inStock !== false &&
        !exclude.includes(p.sku) &&
        (!newOnly || p.isNew) &&
        (!category || p.category === category) &&
        (!q || p.sku.toLowerCase().includes(q) || p.name.toLowerCase().includes(q)),
    );
  }, [products, query, newOnly, category, exclude]);

  return (
    <Modal open={open} onClose={onClose} title={title} wide>
      <div className="flex flex-wrap items-center gap-2">
        <span className="relative min-w-[200px] flex-1">
          <Search size={15} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-muted" />
          <Input className="h-9 pl-8" placeholder="Search name or SKU" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus aria-label="Search products" />
        </span>
        <select aria-label="Category" className="h-9 rounded-lg border border-line bg-white px-2.5 text-sm" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-navy" checked={newOnly} onChange={(e) => setNewOnly(e.target.checked)} />
          New this season only
        </label>
      </div>
      <ul className="mt-4 grid max-h-[60vh] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3">
        {list.slice(0, LIMIT).map((p) => (
          <li key={p.sku}>
            <button
              type="button"
              onClick={() => onPick(p)}
              className={cn("flex w-full flex-col gap-2 rounded-lg border border-line p-2.5 text-left hover:border-navy hover:bg-navy/[0.03]")}
            >
              <ProductThumb product={p} size={120} />
              <span className="line-clamp-2 text-[13px] font-semibold">{p.name || p.sku}</span>
              <span className="flex items-center gap-1.5 font-mono text-[11px] text-ink-muted">
                {p.sku}
                {p.isNew && <StatusChip tone="ok" className="text-[9px]">New</StatusChip>}
              </span>
            </button>
          </li>
        ))}
        {list.length === 0 && <li className="col-span-full py-8 text-center text-sm text-ink-muted">No in-stock products match.</li>}
      </ul>
      {list.length > LIMIT && <p className="mt-2 text-xs text-ink-muted">Showing {LIMIT} of {list.length}. Search to narrow down.</p>}
      {footer && <div className="mt-4 flex justify-end border-t border-line pt-4">{footer}</div>}
    </Modal>
  );
}
