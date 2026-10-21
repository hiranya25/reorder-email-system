import { expect, test, type Page } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FAKE_MAILCHIMP, go, reviewer, settled, signIn } from "./helpers";

/** Runs the whole campaign on the synthetic sample export; no customer data involved. */

async function download(page: Page, click: () => Promise<void>, name: string): Promise<string> {
  const [dl] = await Promise.all([page.waitForEvent("download"), click()]);
  const path = join(tmpdir(), `${Date.now()}-${name}`);
  await dl.saveAs(path);
  return path;
}

/** Fills the catalog template like the team would: links, stock and a few new-season items. */
function fillCatalog(templatePath: string): string {
  const lines = readFileSync(templatePath, "utf8").replace(/^﻿/, "").trim().split("\r\n");
  const body = lines.slice(1).map((line) => {
    const cells = line.split(",");
    const sku = cells[0]!;
    cells[2] = `https://images.example/${sku}.jpg`;
    cells[3] = `https://store.example/p/${sku}`;
    if (!cells[1]) cells[1] = `Style ${sku}`;
    return cells.join(",");
  });
  for (const cat of ["Bracelets", "Studs", "Necklaces", "Bands", "Hoops", "Rings", "Bangles", "Pendants"])
    for (const k of [1, 2, 3]) body.push(`NEW-${cat.toUpperCase()}-${k},New ${cat} ${k},https://images.example/n.jpg,https://store.example/p/n,${cat},Lab grown,,yes,yes,`);
  const out = join(tmpdir(), `catalog-${Date.now()}.csv`);
  writeFileSync(out, [lines[0], ...body].join("\r\n"));
  return out;
}

test("import → map → products → picks → two approvals → export", async ({ page, browser }) => {
  await page.route("https://images.example/**", (r) => r.fulfill({ status: 404 }));
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await signIn(page);

  // New campaign + import the sample export
  await go(page, "/campaigns");
  await page.getByRole("button", { name: "New campaign" }).click();
  await page.getByLabel("Campaign name").fill("E2E Holiday Reorder");
  await page.getByRole("button", { name: "Create & import data" }).click();
  await page.waitForURL(/\/import$/);
  const base = page.url().replace(/\/import$/, "");
  const sample = await download(page, () => page.getByRole("button", { name: "Download a sample export" }).click(), "sample.csv");
  await page.locator("input[type=file]").setInputFiles(sample);
  await expect(page.getByRole("main").getByText("Check results")).toBeVisible();
  await page.getByRole("button", { name: "Confirm import →" }).click();
  await page.waitForURL(/\/overview$/);
  await expect(page.getByRole("main").getByText("Customers last season")).toBeVisible();

  // Mapping: approve ready, approve the rest that have an email, exclude the others
  await go(page, `${base}/mapping`);
  await page.getByRole("button", { name: "Approve all ready" }).click();
  await page.locator("dialog").getByRole("button", { name: /^Approve \d+$/ }).click();
  await page.getByLabel("Decision").selectOption("pending");
  await page.getByRole("checkbox", { name: "Select all on this page" }).check();
  await page.getByRole("button", { name: /^Approve/ }).nth(1).click();
  await page.getByRole("checkbox", { name: "Select all on this page" }).check();
  await page.getByRole("button", { name: "Exclude", exact: true }).first().click();
  await expect(page.getByRole("main").getByText(/Reviewed (\d+) of \1 accounts/)).toBeVisible();
  // Edits are optimistic; wait for the background saves before reloading.
  await expect(page.getByText("Saving…")).toHaveCount(0);
  // Saved on the server: still there after a reload.
  await page.reload();
  await settled(page);
  await expect(page.getByRole("main").getByText(/Reviewed (\d+) of \1 accounts/)).toBeVisible();

  // Product check: catalog from the template
  await go(page, `${base}/products`);
  const template = await download(page, () => page.getByRole("button", { name: "Download template" }).click(), "catalog-template.csv");
  await page.locator("input[type=file]").setInputFiles(fillCatalog(template));
  await page.getByRole("button", { name: "Use this catalog" }).click();
  await page.getByRole("button", { name: "Confirm product check" }).click();
  await expect(page.getByRole("button", { name: "Checked" })).toBeVisible();

  // Recommendations
  await go(page, `${base}/recommendations`);
  await page.getByRole("button", { name: "Suggest picks" }).click();
  await expect(page.getByRole("main").getByText(/^(\d+) of \1 groups have 3 picks$/)).toBeVisible();

  // Settings: reorder button + brand
  await go(page, "/settings");
  await page.getByLabel("Brand name (email header)").fill("Lumière Wholesale");
  await page.getByLabel("Business address (footer, required for marketing email)").fill("1 Diamond Row, New York, NY");
  await page.getByLabel("Phone (email header)").fill("1-800-555-0100");
  await page.getByLabel(/^Logo link/).fill("https://cdn.example/logo.png");
  await page.getByRole("button", { name: "Save brand" }).click();
  await expect(page.getByRole("main").getByText("Saved").first()).toBeVisible();
  // Phone and logo are kept on the server.
  await page.reload();
  await settled(page);
  await expect(page.getByLabel("Phone (email header)")).toHaveValue("1-800-555-0100");
  await expect(page.getByLabel(/^Logo link/)).toHaveValue("https://cdn.example/logo.png");
  // Back to the text logo, so the preview below shows the brand name.
  await page.getByLabel(/^Logo link/).fill("");
  await page.getByRole("button", { name: "Save brand" }).click();
  await expect(page.getByRole("main").getByText("Saved").first()).toBeVisible();
  await page.getByRole("radio", { name: /An email to the sales team/ }).check();
  await page.getByPlaceholder("orders@yourbrand.com").fill("orders@lumiere.example");
  await page.getByRole("button", { name: "Save reorder button" }).click();
  await page.getByLabel("Test email addresses").fill("team@amipi.com");
  await page.getByRole("button", { name: "Save test list" }).click();
  await expect(page.getByRole("main").getByText("Saved").first()).toBeVisible();

  // Preview shows the brand and a working reorder link
  await go(page, `${base}/preview`);
  const frame = page.getByRole("main").locator("iframe").contentFrame();
  await expect(frame.getByText("Lumière Wholesale", { exact: true }).first()).toBeVisible();
  await expect(frame.getByRole("link", { name: /Yes, Go Ahead/i })).toHaveAttribute("href", /^mailto:orders@lumiere\.example/);

  // First approval (admin): locks the campaign, export still blocked
  await go(page, `${base}/approve`);
  await page.getByRole("button", { name: "Approve (1 of 2)" }).click();
  await page.locator("dialog[open]").getByLabel("Type APPROVE to confirm").fill("approve");
  await page.locator("dialog").getByRole("button", { name: "Approve & lock" }).click();
  await expect(page.getByRole("main").getByText(/waiting for 1 more approval from a different person/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Give approval 2 of 2/ })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Contacts CSV", includeHidden: true })).toBeDisabled();

  // Second approval (reviewer, own browser) — also proves the data lives on the server.
  const ctx = await browser.newContext();
  const r = await ctx.newPage();
  await signIn(r, reviewer());
  await go(r, `${base}/approve`);
  await expect(r.getByText("Approval 1: Owner", { exact: false })).toBeVisible();
  await r.getByRole("button", { name: "Give approval 2 of 2" }).click();
  await r.locator("dialog[open]").getByLabel("Type APPROVE to confirm").fill("APPROVE");
  await r.locator("dialog").getByRole("button", { name: "Approve & lock" }).click();
  await expect(r.getByText("Approved and locked", { exact: true })).toBeVisible();
  // Reviewers can't export or send; those are admin steps.
  await expect(r.getByRole("button", { name: "Contacts CSV", includeHidden: true })).toBeDisabled();
  await expect(r.getByText("Only an admin can send. You can follow the progress here.")).toBeVisible();
  await ctx.close();

  // Admin exports
  await page.reload();
  await settled(page);
  await expect(page.getByRole("main").getByText("Approved and locked", { exact: true })).toBeVisible();
  await page.getByText("Or do it by hand: CSV import into Mailchimp").click();
  const csvPath = await download(page, () => page.getByRole("button", { name: "Contacts CSV" }).click(), "contacts.csv");
  const csv = readFileSync(csvPath, "utf8").replace(/^﻿/, "").trim().split("\r\n");
  expect(csv[0]).toMatch(/^Email Address,RCGREET,RCREP,.*,Tags$/);
  expect(csv.length).toBeGreaterThan(10);
  expect(csv[1]).toMatch(/,reorder-HOLIDAY-2025$/);

  // Send with Mailchimp (a fake Mailchimp in tests). Every address is a subscriber except one
  // that isn't in the audience yet and one that unsubscribed.
  const addresses = [...new Set(csv.slice(1).map((line) => line.split(",")[0]!.toLowerCase()))];
  const [newOne, unsubscribed, ...subscribers] = addresses;
  await page.request.post(`${FAKE_MAILCHIMP}/__reset`);
  await page.request.post(`${FAKE_MAILCHIMP}/__seed`, {
    data: { members: [...subscribers.map((email) => ({ email })), { email: unsubscribed, status: "unsubscribed" }] },
  });
  // The sample has addresses shared by two customers, so there's a second round; this is round 1.
  const card = page.getByRole("region", { name: "Round 1" });
  await card.getByRole("button", { name: /^Update \d+ contacts$/ }).click();
  await expect(card.getByText(`${subscribers.length} ready`)).toBeVisible({ timeout: 30_000 });
  await expect(card.getByText("1 not in audience")).toBeVisible();
  await expect(card.getByText("1 unsubscribed or bounced")).toBeVisible();
  // The admin adds the new address.
  await card.getByLabel(`Add ${newOne}`).check();
  await card.getByRole("button", { name: "Add 1 as subscribed" }).click();
  await expect(card.getByText(`${subscribers.length + 1} ready`)).toBeVisible();
  await card.getByRole("button", { name: "Send test email" }).click();
  await expect(card.getByText(/^Test sent/)).toBeVisible();
  await card.getByRole("button", { name: "Send now" }).click();
  await page.locator("dialog[open]").getByLabel("Type SEND to confirm").fill("send");
  await page.locator("dialog[open]").getByRole("button", { name: "Send now" }).click();
  await expect(card.getByText(/^Sent/).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Reopen for changes" })).toHaveCount(0);

  const fake = (await (await page.request.get(`${FAKE_MAILCHIMP}/__state`)).json()) as {
    mergeFields: string[];
    members: { email: string; status: string; merge: Record<string, string> }[];
    campaigns: { status: string; sentTo: string[]; tests: string[][]; html: string; settings: { subject_line: string; from_name: string; reply_to: string } }[];
  };
  expect(fake.mergeFields).toEqual(expect.arrayContaining(["RCGREET", "RCITEM1", "RCITEM1D", "RCREORDER"]));
  const sent = fake.campaigns[0]!;
  expect(sent.status).toBe("sent");
  expect(sent.sentTo.sort()).toEqual([newOne, ...subscribers].sort());
  expect(sent.tests).toEqual([["team@amipi.com"]]);
  expect(sent.settings).toMatchObject({ subject_line: "Restock your holiday bestsellers", from_name: "AMIPI INC", reply_to: "salesgroup@amipi.com" });
  expect(sent.html).toContain("*|RCGREET|*");
  expect(sent.html).toContain("*|HTML:RCITEM1|*");
  // Every tag in the email is a field that exists in the audience (UNSUB and MC:SUBJECT are Mailchimp's own).
  const used = [...sent.html.matchAll(/\*\|(?:IF:|HTML:)?([A-Z0-9_]+)\|\*/g)].map((t) => t[1]!).filter((t) => !["END", "ELSE", "UNSUB"].includes(t));
  for (const tag of used) expect(fake.mergeFields, tag).toContain(tag);
  expect(fake.members.find((m) => m.email === unsubscribed)).toMatchObject({ status: "unsubscribed", merge: {} });
  expect(fake.members.find((m) => m.email === subscribers[0])!.merge.RCITEM1).toBeTruthy();

  // Locked: mapping can't bulk-approve, overview shows the export
  await go(page, `${base}/mapping`);
  await expect(page.getByRole("main").getByText(/Changes are locked/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve all ready" })).toBeDisabled();
  await go(page, `${base}/overview`);
  await expect(page.locator("ol li").nth(6)).toContainText("CSV exported");

  expect(errors).toEqual([]);
});
