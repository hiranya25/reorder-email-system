import type { EmailItem, EmailModel, EmailPick } from "./model";

/** Mailchimp merge tags are at most 10 characters and values at most 255. */
export const MERGE_TAG_MAX = 10;
export const MERGE_VALUE_MAX = 255;

/**
 * Groups of audience fields. Mailchimp audiences have a limited number of fields, so only "core"
 * is always created; the others are added the first time a campaign has something to put in them.
 */
export type MergeFieldGroup = "core" | "itemImages" | "picks" | "pickImages";

export interface MergeFieldDef {
  tag: string;
  /** Label shown in Mailchimp's audience settings. */
  name: string;
  group: MergeFieldGroup;
  /** Holds a small piece of HTML, used as *|HTML:TAG|* in the email. */
  html?: boolean;
}

const N = [1, 2, 3] as const;

/**
 * Every per-customer field the reorder email uses (10 always, up to 19). All start with RC so
 * they're easy to spot in Mailchimp. Product names carry their link, and details their SKU and
 * quantity, so each product needs only two fields.
 */
export const MERGE_FIELD_DEFS: MergeFieldDef[] = [
  { tag: "RCGREET", name: "Reorder: greeting name", group: "core" },
  { tag: "RCREP", name: "Reorder: account rep", group: "core" },
  { tag: "RCREORDER", name: "Reorder: button link", group: "core" },
  { tag: "RCMORE", name: "Reorder: more products", group: "core" },
  ...N.flatMap((n): MergeFieldDef[] => [
    { tag: `RCITEM${n}`, name: `Reorder: product ${n}`, group: "core", html: true },
    { tag: `RCITEM${n}D`, name: `Reorder: product ${n} details`, group: "core", html: true },
  ]),
  ...N.map((n): MergeFieldDef => ({ tag: `RCITEM${n}I`, name: `Reorder: product ${n} image`, group: "itemImages" })),
  ...N.map((n): MergeFieldDef => ({ tag: `RCREC${n}`, name: `Reorder: new pick ${n}`, group: "picks", html: true })),
  ...N.map((n): MergeFieldDef => ({ tag: `RCREC${n}I`, name: `Reorder: new pick ${n} image`, group: "pickImages" })),
];

export const NAVY = "#2b3a67";
const MUTED = "#6b7280";

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Only http(s) and mailto links make it into the email. */
export function safeUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  return /^(https?:|mailto:)/i.test(url.trim()) ? url.trim() : undefined;
}

/** "B401300-14WD · You ordered 10" */
export function itemQtyLine(item: { sku: string; qty: number }): string {
  return `${item.sku} · You ordered ${item.qty}`;
}

/** Fits a name into what's left of the 255 characters, keeping the HTML around it intact. */
function fitName(name: string, room: number): string {
  let text = name;
  while (escapeHtml(text).length > room && text.length > 1) text = text.slice(0, -2) + "…";
  return escapeHtml(text);
}

function linked(name: string, url: string | undefined, suffix = ""): string {
  const href = safeUrl(url);
  const open = href ? `<a href="${escapeHtml(href)}" style="color:${NAVY};text-decoration:none;">` : "";
  const close = href ? "</a>" : "";
  // Too long with the link: drop the link rather than cut the address.
  if (href && open.length + close.length + suffix.length + 4 > MERGE_VALUE_MAX) return linked(name, undefined, suffix);
  return `${open}${fitName(name, MERGE_VALUE_MAX - open.length - close.length - suffix.length)}${suffix}${close}`;
}

/** A product's name, linked to its page when there is one. Same HTML in the preview and in Mailchimp. */
export function itemNameHtml(item: Pick<EmailItem, "name" | "url">): string {
  return linked(item.name, item.url);
}

/** "Natural · 14K white gold" (italic) over "SKU · You ordered N" (small). */
export function itemDetailHtml(item: Pick<EmailItem, "meta" | "sku" | "qty">): string {
  const qty = `<span style="font-size:12px;color:${MUTED};">${escapeHtml(itemQtyLine(item))}</span>`;
  if (!item.meta) return qty;
  const room = MERGE_VALUE_MAX - qty.length - "<i></i><br/>".length;
  return `<i>${fitName(item.meta, room)}</i><br/>${qty}`;
}

/** A new-season pick's name, linked to its page. */
export function pickHtml(pick: EmailPick): string {
  return pick.name ? linked(pick.name, pick.url, safeUrl(pick.url) ? " &rarr;" : "") : "";
}

function clip(v: string): string {
  return v.length <= MERGE_VALUE_MAX ? v : v.slice(0, MERGE_VALUE_MAX - 1) + "…";
}

/** Values written to each contact for this campaign. Empty slots are blank so *|IF:|* hides them. */
export function mergeFields(m: EmailModel): Record<string, string> {
  const f: Record<string, string> = {
    RCGREET: clip(m.greetingName),
    RCREP: clip(m.repName ?? ""),
    // A cut link would break; drop an overlong one instead.
    RCREORDER: (m.reorderUrl ?? "").length <= MERGE_VALUE_MAX ? (m.reorderUrl ?? "") : "",
    RCMORE: m.moreCount > 0 ? String(m.moreCount) : "",
  };
  for (const n of N) {
    const item = m.items[n - 1];
    f[`RCITEM${n}`] = item ? itemNameHtml(item) : "";
    f[`RCITEM${n}D`] = item ? itemDetailHtml(item) : "";
    const image = safeUrl(item?.imageUrl) ?? "";
    f[`RCITEM${n}I`] = image.length <= MERGE_VALUE_MAX ? image : "";
    const pick = m.picks[n - 1];
    f[`RCREC${n}`] = pick ? pickHtml(pick) : "";
    const pickImage = safeUrl(pick?.imageUrl) ?? "";
    f[`RCREC${n}I`] = pickImage.length <= MERGE_VALUE_MAX ? pickImage : "";
  }
  return f;
}

/** Which optional field groups a set of emails actually uses (core is always needed). */
export function groupsInUse(emails: EmailModel[]): Set<MergeFieldGroup> {
  const used = new Set<MergeFieldGroup>(["core"]);
  for (const m of emails) {
    const f = mergeFields(m);
    for (const def of MERGE_FIELD_DEFS) if (def.group !== "core" && f[def.tag]) used.add(def.group);
  }
  return used;
}
