import type { EmailModel } from "./model";

/** Mailchimp merge tags are at most 10 characters and values at most 255. */
export const MERGE_TAG_MAX = 10;
export const MERGE_VALUE_MAX = 255;

function clip(v: string): string {
  return v.length <= MERGE_VALUE_MAX ? v : v.slice(0, MERGE_VALUE_MAX - 1) + "…";
}

/** Values written to each contact for this campaign. Empty slots are blank so *|IF:|* hides them. */
export function mergeFields(m: EmailModel): Record<string, string> {
  const f: Record<string, string> = {
    GREETING: m.greetingName,
    COMPANY: m.company,
    CUST_ID: m.accountId,
    SEASON: m.seasonCode,
    INTRO: m.intro,
    PREHEADER: m.preheader,
    MORECOUNT: m.moreCount > 0 ? String(m.moreCount) : "",
    REPNAME: m.repName ?? "",
    REORDERURL: m.reorderUrl ?? "",
  };
  for (let i = 0; i < 3; i++) {
    const n = i + 1;
    const item = m.items[i];
    f[`ITEM${n}_NAME`] = item?.name ?? "";
    f[`ITEM${n}_META`] = item?.meta ?? "";
    f[`ITEM${n}_SKU`] = item?.sku ?? "";
    f[`ITEM${n}_QTY`] = item ? String(item.qty) : "";
    f[`ITEM${n}_IMG`] = item?.imageUrl ?? "";
    f[`ITEM${n}_URL`] = item?.url ?? "";
    const pick = m.picks[i];
    f[`REC${n}_NAME`] = pick?.name ?? "";
    f[`REC${n}_IMG`] = pick?.imageUrl ?? "";
    f[`REC${n}_URL`] = pick?.url ?? "";
  }
  return Object.fromEntries(Object.entries(f).map(([k, v]) => [k, clip(v)]));
}
