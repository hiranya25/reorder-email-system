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
  if (m.undescribedCount > 0) {
    checks.push({ level: "warn", text: `${m.undescribedCount} product${m.undescribedCount === 1 ? " has" : "s have"} no description and ${m.undescribedCount === 1 ? "is" : "are"} left out` });
  }
  const long = m.items.find((i) => i.name.length > LONG_NAME);
  if (long) checks.push({ level: "warn", text: `Long product name may wrap: "${long.name}"` });
  if (!ctx.catalogUploaded) checks.push({ level: "warn", text: "Product images and links missing until the catalog is uploaded" });
  if (m.picks.filter((p) => p.name).length < 3) checks.push({ level: "warn", text: "New-season picks not chosen yet" });
  if (!m.reorderUrl) checks.push({ level: "warn", text: "Reorder link not set yet (what the button opens is still to be decided)" });
  checks.push(
    ctx.htmlBytes > GMAIL_CLIP_BYTES
      ? { level: "bad", text: `Email is ${Math.round(ctx.htmlBytes / 1024)} KB; Gmail clips above 102 KB` }
      : { level: "ok", text: `Email size ${Math.max(1, Math.round(ctx.htmlBytes / 1024))} KB, under Gmail's 102 KB limit` },
  );
  return checks;
}
