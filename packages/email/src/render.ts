import type { EmailModel } from "./model";

const C = {
  navy: "#1e2a44",
  gold: "#b08d57",
  label: "#7a5c2e",
  ink: "#1f2937",
  muted: "#6b7280",
  line: "#e5e7eb",
  cream: "#f2ede4",
  pick: "#eceff5",
  footer: "#f3f4f6",
};
const FONT = "Helvetica, Arial, sans-serif";
const SERIF = "Georgia, 'Times New Roman', serif";

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Only http(s) and mailto links make it into the email. */
function safeUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  return /^(https?:|mailto:)/i.test(url.trim()) ? url.trim() : undefined;
}

/**
 * How values reach the HTML. Preview fills real values; the Mailchimp template
 * writes merge tags and wraps optional parts in *|IF:…|* blocks.
 */
interface Slots {
  text: (value: string | undefined, tag: string) => string;
  url: (value: string | undefined, tag: string) => string | undefined;
  /** Renders `html` only when the slot has content. */
  when: (present: boolean, tag: string, html: string) => string;
  /** Preview-only placeholder (e.g. "Product image from catalog"); never in the template. */
  preview: boolean;
}

const previewSlots: Slots = {
  text: (v) => escapeHtml(v ?? ""),
  url: (v) => safeUrl(v),
  when: (present, _tag, html) => (present ? html : ""),
  preview: true,
};

const mergeSlots: Slots = {
  text: (_v, tag) => `*|${tag}|*`,
  url: (_v, tag) => `*|${tag}|*`,
  when: (_present, tag, html) => `*|IF:${tag}|*${html}*|END:IF|*`,
  preview: false,
};

function imageCell(url: string | undefined, alt: string, placeholder: string, bg: string): string {
  if (url) {
    return `<img src="${url}" width="180" alt="${alt}" style="display:block;width:100%;max-width:180px;height:auto;border:0;background:${bg};" />`;
  }
  return `<div style="height:180px;background:${bg};color:${C.muted};font:13px/1.4 ${FONT};text-align:center;display:table;width:100%;"><span style="display:table-cell;vertical-align:middle;padding:0 12px;">${placeholder}</span></div>`;
}

function sectionLabel(text: string): string {
  return `<tr><td style="padding:28px 0 14px;font:bold 12px/1 ${FONT};letter-spacing:2px;text-transform:uppercase;color:${C.label};">${text}</td></tr>`;
}

/** Three equal columns that stack on phones. Hidden slots collapse. */
function cardRow(cards: string[]): string {
  const cells = cards
    .map((card, i) => `<td class="stack" valign="top" width="33%" style="width:33%;padding:0 ${i < 2 ? "6px" : "0"} 0 ${i > 0 ? "6px" : "0"};">${card}</td>`)
    .join("");
  return `<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${cells}</tr></table></td></tr>`;
}

function itemCard(m: EmailModel, i: number, s: Slots): string {
  const n = i + 1;
  const item = m.items[i];
  const name = s.text(item?.name, `ITEM${n}_NAME`);
  const href = s.url(item?.url, `ITEM${n}_URL`);
  const img = s.url(item?.imageUrl, `ITEM${n}_IMG`);
  const body = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${C.line};margin-bottom:12px;">
<tr><td>${imageCell(img, name, s.preview ? "Product image<br/>from catalog" : "", C.cream)}</td></tr>
<tr><td style="padding:12px;font:15px/1.3 ${FONT};color:${C.ink};">
<div style="font-weight:bold;">${href ? `<a href="${href}" style="color:${C.ink};text-decoration:none;">${name}</a>` : name}</div>
${s.when(!!item?.meta, `ITEM${n}_META`, `<div style="margin-top:6px;font-size:13px;color:${C.muted};">${s.text(item?.meta, `ITEM${n}_META`)}</div>`)}
<div style="margin-top:4px;font:12px/1.3 'Courier New',monospace;color:${C.muted};">${s.text(item?.sku, `ITEM${n}_SKU`)}</div>
<div style="margin-top:10px;font-size:13px;font-weight:bold;">You ordered ${s.text(item ? String(item.qty) : undefined, `ITEM${n}_QTY`)}</div>
</td></tr></table>`;
  return n === 1 ? body : s.when(!!item, `ITEM${n}_NAME`, body);
}

function pickCard(m: EmailModel, i: number, s: Slots): string {
  const n = i + 1;
  const pick = m.picks[i];
  const chosen = !!pick?.name;
  const name = chosen || !s.preview ? s.text(pick?.name, `REC${n}_NAME`) : "[New style name]";
  const href = s.url(pick?.url, `REC${n}_URL`);
  const img = s.url(pick?.imageUrl, `REC${n}_IMG`);
  const body = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${C.line};margin-bottom:12px;">
<tr><td>${imageCell(img, name, s.preview ? `New-season pick ${n}<br/>(not chosen yet)` : "", C.pick)}</td></tr>
<tr><td style="padding:12px;font:15px/1.3 ${FONT};color:${C.ink};">
<div style="font-weight:bold;">${name}</div>
<div style="margin-top:6px;font-size:14px;"><a href="${href ?? "#"}" style="color:${C.ink};font-weight:bold;">View style &rarr;</a></div>
</td></tr></table>`;
  return s.preview ? body : s.when(true, `REC${n}_NAME`, body);
}

function render(m: EmailModel, s: Slots): string {
  const reorderHref = s.url(m.reorderUrl, "REORDERURL") ?? "#";
  const brand = escapeHtml(m.brand.brandName);
  const more = s.when(
    m.moreCount > 0,
    "MORECOUNT",
    `<tr><td style="padding:2px 0 0;font:14px/1.5 ${FONT};color:${C.muted};">+ ${s.text(String(m.moreCount), "MORECOUNT")} more products from last season</td></tr>`,
  );
  const rep = s.preview
    ? m.repName
      ? `${escapeHtml(m.repName)}, your account rep,`
      : "your account rep"
    : `*|IF:REPNAME|**|REPNAME|*, your account rep,*|ELSE:|*your account rep*|END:IF|*`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light only" />
<meta name="supported-color-schemes" content="light" />
<title>${s.text(m.subject, "MC:SUBJECT")}</title>
<style>
  body { margin:0; padding:0; background:${C.footer}; }
  a { color:${C.ink}; }
  @media only screen and (max-width:620px) {
    .container { width:100% !important; }
    .pad { padding-left:20px !important; padding-right:20px !important; }
    .stack { display:block !important; width:100% !important; padding:0 !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${C.footer};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${s.text(m.preheader, "PREHEADER")}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.footer};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:#ffffff;">
<tr><td align="center" style="background:${C.navy};padding:30px 24px;font:24px/1 ${SERIF};letter-spacing:6px;color:${C.gold};">${brand}</td></tr>
<tr><td class="pad" style="padding:32px 28px 8px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td style="font:bold 20px/1.3 ${FONT};color:${C.ink};">Hi ${s.text(m.greetingName, "GREETING")},</td></tr>
<tr><td style="padding-top:8px;font:16px/1.5 ${FONT};color:#374151;">${s.text(m.intro, "INTRO")}</td></tr>
${sectionLabel("You ordered these last season")}
${cardRow([0, 1, 2].map((i) => itemCard(m, i, s)))}
${more}
<tr><td align="center" style="padding:24px 0 8px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="background:${C.gold};"><a href="${reorderHref}" style="display:inline-block;padding:16px 34px;font:bold 15px/1 ${FONT};letter-spacing:2px;color:#ffffff;text-decoration:none;text-transform:uppercase;">Reorder these items &rarr;</a></td>
</tr></table>
</td></tr>
<tr><td align="center" style="padding:6px 0 28px;font:13px/1.4 ${FONT};color:${C.muted};border-bottom:1px solid ${C.line};">Opens your cart with the same items and quantities. Edit before checkout.</td></tr>
${sectionLabel("New this season, picked for you")}
${cardRow([0, 1, 2].map((i) => pickCard(m, i, s)))}
<tr><td style="padding:20px 0 28px;font:15px/1.5 ${FONT};color:#374151;">Questions or custom quantities? Just reply and ${rep} will take care of it.</td></tr>
</table>
</td></tr>
<tr><td align="center" style="background:${C.footer};padding:20px 24px;font:12px/1.6 ${FONT};color:${C.muted};">
${escapeHtml(m.brand.companyName)} &middot; ${escapeHtml(m.brand.address)}<br/>
You're receiving this because you're a wholesale customer. <a href="${s.preview ? "#" : "*|UNSUB|*"}" style="color:${C.muted};">Unsubscribe</a>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

/** The exact email one customer receives. */
export function renderPreviewHtml(m: EmailModel): string {
  return render(m, previewSlots);
}

/** Saved Mailchimp template: same layout, with merge tags for every personal value. */
export function renderMailchimpTemplate(m: EmailModel): string {
  return render(m, mergeSlots);
}
