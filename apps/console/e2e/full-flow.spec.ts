import { expect, test, type Page } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

test("import → map → products → picks → approve → export", async ({ page }) => {
  await page.route("https://images.example/**", (r) => r.fulfill({ status: 404 }));
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  // New campaign + import the sample export
  await page.goto("/campaigns");
  await page.getByRole("button", { name: "New campaign" }).click();
  await page.getByLabel("Campaign name").fill("E2E Holiday Reorder");
  await page.getByRole("button", { name: "Create & import data" }).click();
  await page.waitForURL(/\/import$/);
  const base = page.url().replace(/\/import$/, "");
  const sample = await download(page, () => page.getByRole("button", { name: "Download a sample export" }).click(), "sample.csv");
  await page.locator("input[type=file]").setInputFiles(sample);
  await expect(page.getByText("Check results")).toBeVisible();
  await page.getByRole("button", { name: "Confirm import →" }).click();
  await page.waitForURL(/\/overview$/);
  await expect(page.getByText("Customers last season")).toBeVisible();

  // Mapping: approve ready, approve the rest that have an email, exclude the others
  await page.goto(`${base}/mapping`);
  await page.getByRole("button", { name: "Approve all ready" }).click();
  await page.locator("dialog").getByRole("button", { name: /^Approve \d+$/ }).click();
  await page.getByLabel("Decision").selectOption("pending");
  await page.getByRole("checkbox", { name: "Select all on this page" }).check();
  await page.getByRole("button", { name: /^Approve/ }).nth(1).click();
  await page.getByRole("checkbox", { name: "Select all on this page" }).check();
  await page.getByRole("button", { name: "Exclude", exact: true }).first().click();
  await expect(page.getByText(/Reviewed (\d+) of \1 accounts/)).toBeVisible();

  // Product check: catalog from the template
  await page.goto(`${base}/products`);
  const template = await download(page, () => page.getByRole("button", { name: "Download template" }).click(), "catalog-template.csv");
  await page.locator("input[type=file]").setInputFiles(fillCatalog(template));
  await page.getByRole("button", { name: "Use this catalog" }).click();
  await page.getByRole("button", { name: "Confirm product check" }).click();
  await expect(page.getByRole("button", { name: "Checked" })).toBeVisible();

  // Recommendations
  await page.goto(`${base}/recommendations`);
  await page.getByRole("button", { name: "Suggest picks" }).click();
  await expect(page.getByText(/^(\d+) of \1 groups have 3 picks$/)).toBeVisible();

  // Settings: reorder button + brand
  await page.goto("/settings");
  await page.getByLabel("Brand name (email header)").fill("Lumière Wholesale");
  await page.getByLabel("Business address (footer, required for marketing email)").fill("1 Diamond Row, New York, NY");
  await page.getByRole("button", { name: "Save brand" }).click();
  await page.getByRole("radio", { name: /An email to the sales team/ }).check();
  await page.getByPlaceholder("orders@yourbrand.com").fill("orders@lumiere.example");
  await page.getByRole("button", { name: "Save reorder button" }).click();

  // Preview shows the brand and a working reorder link
  await page.goto(`${base}/preview`);
  const frame = page.frameLocator("iframe");
  await expect(frame.getByText("Lumière Wholesale")).toBeVisible();
  await expect(frame.getByRole("link", { name: /Reorder these items/i })).toHaveAttribute("href", /^mailto:orders@lumiere\.example/);

  // Approve, lock, export
  await page.goto(`${base}/approve`);
  await page.getByRole("button", { name: "Approve & lock" }).click();
  await page.getByLabel("Type APPROVE to confirm").fill("approve");
  await page.locator("dialog").getByRole("button", { name: "Approve & lock" }).click();
  await expect(page.getByText(/Approved and locked by/)).toBeVisible();
  const csvPath = await download(page, () => page.getByRole("button", { name: "Contacts CSV" }).click(), "contacts.csv");
  const csv = readFileSync(csvPath, "utf8").replace(/^﻿/, "").trim().split("\r\n");
  expect(csv[0]).toMatch(/^Email Address,GREETING,COMPANY,CUST_ID,SEASON,.*,Tags$/);
  expect(csv.length).toBeGreaterThan(10);
  expect(csv[1]).toMatch(/,reorder-HOLIDAY-2025$/);

  // Locked: mapping can't bulk-approve, overview shows the export
  await page.goto(`${base}/mapping`);
  await expect(page.getByText(/Changes are locked/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve all ready" })).toBeDisabled();
  await page.goto(`${base}/overview`);
  await expect(page.locator("ol li").nth(6)).toContainText("CSV exported");

  expect(errors).toEqual([]);
});
