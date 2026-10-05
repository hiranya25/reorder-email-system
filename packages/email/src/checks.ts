import type { EmailModel } from "./model";

export interface EmailCheck {
  level: "ok" | "warn" | "bad";
  text: string;
}

/** Gmail clips messages above this size, hiding the end of the email. */
export const GMAIL_CLIP_BYTES = 102 * 1024;
const LONG_NAME = 48;

export function emailChecks(m: EmailModel, ctx: { approved: boolean; htmlBytes: number; catalogUploaded: boolean }): EmailCheck[] {
  const checks: EmailCheck[] = [];
  if (!m.to.length) checks.push({ level: "bad", text: "No email address yet. Add one on Customer mapping." });
  else if (!ctx.approved) checks.push({ level: "warn", text: "Email address not approved yet on Customer mapping." });

  checks.push(
    m.greetingFromEmail
      ? { level: "ok", text: `Personal email on file, greeting uses "${m.greetingName}"` }
      : { level: "ok", text: `No first name in the email address, greeting uses "${m.greetingName}"` },
  );

  if (m.items.length === 0) {
    checks.push({ level: "bad", text: "No products with a description to show. This customer will be skipped." });
  } else {
    const n = m.totalProducts;
    checks.push({
      level: "ok",
      text: n > m.items.length ? `${n} products last season, showing the top ${m.items.length} by quantity` : `${n} product${n === 1 ? "" : "s"} last season, all shown`,
    });
  }
  const { noName, outOfStock, hidden } = m.leftOut;
  const left = [
    noName && `${noName} with no description`,
    outOfStock && `${outOfStock} out of stock`,
    hidden && `${hidden} hidden on Product check`,
  ].filter(Boolean);
  if (left.length) checks.push({ level: "warn", text: `Left out: ${left.join(", ")}` });
  if (m.replacedCount) checks.push({ level: "ok", text: `${m.replacedCount} discontinued product${m.replacedCount === 1 ? "" : "s"} replaced by ${m.replacedCount === 1 ? "its" : "their"} replacement` });
  const long = m.items.find((i) => i.name.length > LONG_NAME);
  if (long) checks.push({ level: "warn", text: `Long product name may wrap: "${long.name}"` });
  if (!ctx.catalogUploaded) checks.push({ level: "warn", text: "Product images and links missing until the catalog is uploaded" });
  else {
    const noImage = m.items.filter((i) => !i.imageUrl).length;
    if (noImage) checks.push({ level: "warn", text: `${noImage} product${noImage === 1 ? " has" : "s have"} no image in the catalog` });
  }
  const picks = m.picks.filter((p) => p.name).length;
  if (picks === 0) checks.push({ level: "warn", text: "New-season picks not chosen yet" });
  else if (picks < 3) checks.push({ level: "warn", text: `Only ${picks} of 3 new-season picks apply (others already bought, out of stock or not chosen)` });
  else checks.push({ level: "ok", text: `3 new-season picks from "${m.segment}"` });
  if (!m.reorderUrl) checks.push({ level: "warn", text: "Reorder link not set yet (what the button opens is still to be decided)" });
  checks.push(
    ctx.htmlBytes > GMAIL_CLIP_BYTES
      ? { level: "bad", text: `Email is ${Math.round(ctx.htmlBytes / 1024)} KB; Gmail clips above 102 KB` }
      : { level: "ok", text: `Email size ${Math.max(1, Math.round(ctx.htmlBytes / 1024))} KB, under Gmail's 102 KB limit` },
  );
  return checks;
}
