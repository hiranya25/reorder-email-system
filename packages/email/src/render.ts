import type { EmailModel } from "./model";

/** AMIPI house style, taken from the template the sales team already sends. */
const C = {
  yellow: "#ffd400",
  navy: "#2b3a67",
  red: "#c8232c",
  ink: "#222222",
  text: "#333333",
  muted: "#6b7280",
  line: "#e5e7eb",
  card: "#f7f5f0",
  footer: "#2e3550",
  page: "#f3f4f6",
};
const FONT = "Lato, 'Helvetica Neue', Helvetica, Arial, sans-serif";
const SCRIPT = "'Playfair Display', Georgia, 'Times New Roman', serif";

const TAGLINE = "Your favorite diamond guys!";

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
  /** Image sources; the preview also accepts inline data:image URIs (demo catalog). */
  img: (value: string | undefined, tag: string) => string | undefined;
  /** Renders `html` only when the slot has content. */
  when: (present: boolean, tag: string, html: string) => string;
  /** Preview-only placeholder (e.g. "Product image from catalog"); never in the template. */
  preview: boolean;
}

const previewSlots: Slots = {
  text: (v) => escapeHtml(v ?? ""),
  url: (v) => safeUrl(v),
  img: (v) => (v && /^data:image\/(png|jpe?g|gif|webp|svg\+xml)[;,]/i.test(v) ? escapeHtml(v) : safeUrl(v)),
  when: (present, _tag, html) => (present ? html : ""),
  preview: true,
};

const mergeSlots: Slots = {
  text: (_v, tag) => `*|${tag}|*`,
  url: (_v, tag) => `*|${tag}|*`,
  img: (_v, tag) => `*|${tag}|*`,
  when: (_present, tag, html) => `*|IF:${tag}|*${html}*|END:IF|*`,
  preview: false,
};

/** The logo image when there's a public link, otherwise an AMIPI-style text wordmark. */
function logo(m: EmailModel, size: "large" | "small"): string {
  const name = escapeHtml(m.brand.brandName);
  const src = safeUrl(m.brand.logoUrl);
  const width = size === "large" ? 220 : 120;
  if (src) return `<img src="${escapeHtml(src)}" width="${width}" alt="${name}" style="display:block;width:${width}px;max-width:100%;height:auto;border:0;" />`;
  const big = size === "large" ? 40 : 24;
  const small = size === "large" ? 12 : 8;
  return `<div style="font:bold ${big}px/1 ${FONT};letter-spacing:1px;color:${C.navy};">${name}</div><div style="padding-top:3px;font:italic bold ${small}px/1.2 Georgia,serif;color:${C.red};">${TAGLINE}</div>`;
}

/** One product, centered like the lines in the original template. */
function itemBlock(m: EmailModel, i: number, s: Slots): string {
  const n = i + 1;
  const item = m.items[i];
  const name = s.text(item?.name, `ITEM${n}_NAME`);
  const href = s.url(item?.url, `ITEM${n}_URL`);
  const img = s.img(item?.imageUrl, `ITEM${n}_IMG`);
  const image = s.when(
    !!img,
    `ITEM${n}_IMG`,
    `<div style="padding-bottom:10px;"><img src="${img ?? ""}" width="160" alt="${name}" style="display:inline-block;width:160px;max-width:100%;height:auto;border:0;" /></div>`,
  );
  const title = href ? `<a href="${href}" style="color:${C.navy};text-decoration:none;">${name}</a>` : name;
  const body = `<tr><td align="center" style="padding:10px 0;">
${image}
<div style="font:19px/1.35 ${FONT};color:${C.navy};">${title}</div>
${s.when(!!item?.meta, `ITEM${n}_META`, `<div style="padding-top:4px;font:italic 15px/1.4 ${FONT};color:${C.text};">${s.text(item?.meta, `ITEM${n}_META`)}</div>`)}
<div style="padding-top:4px;font:12px/1.4 ${FONT};color:${C.muted};">${s.text(item?.sku, `ITEM${n}_SKU`)} &middot; You ordered ${s.text(item ? String(item.qty) : undefined, `ITEM${n}_QTY`)}</div>
</td></tr>`;
  return n === 1 ? body : s.when(!!item, `ITEM${n}_NAME`, body);
}

function pickCard(m: EmailModel, i: number, s: Slots): string {
  const n = i + 1;
  const pick = m.picks[i];
  const chosen = !!pick?.name;
  const name = chosen || !s.preview ? s.text(pick?.name, `REC${n}_NAME`) : "[New style name]";
  const href = s.url(pick?.url, `REC${n}_URL`) ?? "#";
  const img = s.img(pick?.imageUrl, `REC${n}_IMG`);
  const placeholder = !s.preview ? "" : chosen ? "Image missing<br/>in catalog" : `New-season pick ${n}<br/>(not chosen yet)`;
  const image = img
    ? `<img src="${img}" width="150" alt="${name}" style="display:block;width:100%;max-width:150px;height:auto;border:0;margin:0 auto;" />`
    : placeholder
      ? `<div style="height:120px;background:${C.card};color:${C.muted};font:12px/1.4 ${FONT};text-align:center;display:table;width:100%;"><span style="display:table-cell;vertical-align:middle;padding:0 10px;">${placeholder}</span></div>`
      : "";
  const card = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:0 0 14px;">
${image}
<div style="padding-top:8px;font:15px/1.3 ${FONT};color:${C.navy};">${name}</div>
<div style="padding-top:4px;font:bold 13px/1.3 ${FONT};"><a href="${href}" style="color:${C.red};text-decoration:none;">View style &rarr;</a></div>
</td></tr></table>`;
  const cell = `<td class="stack" valign="top" width="33%" style="width:33%;padding:0 6px;">${card}</td>`;
  return s.preview ? cell : `*|IF:REC${n}_NAME|*${cell}*|END:IF|*`;
}

function render(m: EmailModel, s: Slots): string {
  const reorderHref = s.url(m.reorderUrl, "REORDERURL") ?? "#";
  const phone = m.brand.phone?.trim();
  const telHref = phone ? `tel:${phone.replace(/[^\d+]/g, "")}` : "";
  const more = s.when(
    m.moreCount > 0,
    "MORECOUNT",
    `<tr><td align="center" style="padding:8px 0 0;font:13px/1.5 ${FONT};color:${C.text};">+ ${s.text(String(m.moreCount), "MORECOUNT")} more products from last season</td></tr>`,
  );
  const picks = `<tr><td align="center" style="padding:30px 0 14px;font:bold 13px/1 ${FONT};letter-spacing:2px;text-transform:uppercase;color:${C.navy};">New this season, picked for you</td></tr>
<tr><td style="padding-bottom:16px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${[0, 1, 2].map((i) => pickCard(m, i, s)).join("")}</tr></table></td></tr>`;
  const pickSection = s.preview ? picks : `*|IF:REC1_NAME|*${picks}*|END:IF|*`;
  const signer = s.preview ? escapeHtml(m.repName ?? `${m.brand.brandName} Sales Team`) : `*|IF:REPNAME|**|REPNAME|**|ELSE:|*${escapeHtml(m.brand.brandName)} Sales Team*|END:IF|*`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light only" />
<meta name="supported-color-schemes" content="light" />
<title>${s.text(m.subject, "MC:SUBJECT")}</title>
<style>
  body { margin:0; padding:0; background:${C.page}; }
  a { color:${C.navy}; }
  @media only screen and (max-width:620px) {
    .container { width:100% !important; }
    .pad { padding-left:22px !important; padding-right:22px !important; }
    .stack { display:block !important; width:100% !important; padding:0 !important; }
    .head td { display:block !important; width:100% !important; text-align:center !important; padding:6px 0 !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${C.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${s.text(m.preheader, "PREHEADER")}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.page};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:#ffffff;">
<tr><td style="background:${C.yellow};border-top:4px solid #e6be00;padding:18px 28px;">
<table role="presentation" class="head" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td align="right" valign="middle" style="width:60%;padding-right:24px;">${logo(m, "large")}</td>
<td align="left" valign="middle" style="font:15px/1 ${FONT};color:${C.ink};white-space:nowrap;">${phone ? `&#128222; <a href="${telHref}" style="color:${C.ink};text-decoration:none;">${escapeHtml(phone)}</a>` : ""}</td>
</tr></table>
</td></tr>
<tr><td class="pad" style="padding:34px 66px 8px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td style="font:16px/1.4 ${FONT};color:${C.ink};">Hi ${s.text(m.greetingName, "GREETING")},</td></tr>
<tr><td style="padding:18px 0 14px;font:15px/1.55 ${FONT};color:${C.ink};">${s.text(m.intro, "INTRO")}</td></tr>
${[0, 1, 2].map((i) => itemBlock(m, i, s)).join("\n")}
${more}
<tr><td align="center" style="padding:26px 0 14px;font:18px/1.4 ${FONT};color:${C.navy};">Would you like us to place a reorder for you?</td></tr>
<tr><td align="center" style="padding:0 0 30px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="background:${C.red};border-radius:24px;"><a href="${reorderHref}" style="display:inline-block;padding:13px 26px;font:bold 15px/1 ${FONT};color:#ffffff;text-decoration:none;border-radius:24px;">&#128722; Yes, Go Ahead</a></td>
</tr></table>
</td></tr>
${pickSection}
<tr><td style="border-top:2px dotted ${C.ink};font-size:0;line-height:0;padding-top:24px;">&nbsp;</td></tr>
<tr><td style="font:16px/1.5 ${FONT};color:${C.text};">Regards,<br/>Your Diamond Concierge @${escapeHtml(m.brand.brandName)}</td></tr>
<tr><td style="padding:16px 0 18px;font:italic 20px/1.3 ${SCRIPT};color:${C.text};">${signer}</td></tr>
<tr><td style="padding:0 0 30px;">${logo(m, "small")}</td></tr>
</table>
</td></tr>
<tr><td align="center" style="background:${C.footer};padding:20px 24px;font:12px/1.6 ${FONT};color:#d1d5db;">
${escapeHtml(m.brand.companyName)} &middot; ${escapeHtml(m.brand.address)}<br/>
You're receiving this because you're a wholesale customer. <a href="${s.preview ? "#" : "*|UNSUB|*"}" style="color:#ffffff;">Unsubscribe</a>
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
