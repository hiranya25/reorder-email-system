import { expect, test } from "@playwright/test";
import { signIn, viewer } from "./helpers";

test("viewers can look but not change anything", async ({ page }) => {
  await signIn(page, viewer());
  await expect(page.getByText("View-only access")).toBeVisible();
  await expect(page.getByRole("button", { name: "New campaign" })).toHaveCount(0);

  await page.goto("/campaigns/demo/mapping");
  const row = page.getByRole("row").filter({ has: page.getByRole("button", { name: "Approve", exact: true }) }).first();
  await row.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.locator("p", { hasText: "view-only access" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("main").getByText(/^Reviewed 0 of/)).toBeVisible();

  await page.goto("/settings");
  await expect(page.getByRole("main").getByText("Only admins can change these settings.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save brand" })).toBeDisabled();
});
