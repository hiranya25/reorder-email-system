import { expect, test } from "@playwright/test";
import { reviewer } from "./helpers";

test("with the code turned off, the password alone signs in", async ({ page }) => {
  const r = reviewer();
  await page.goto("/login");
  await expect(page.getByText(/Lost your phone/)).toHaveCount(0);
  await page.getByLabel("Username or email").fill(r.email);
  await page.getByLabel("Password").fill("not-the-password-123");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("p[role=alert]")).toHaveText("That username or email and password don't match.");
  await page.getByLabel("Password").fill(r.password);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL(/\/campaigns$/);
  await expect(page.getByText(r.name, { exact: true })).toBeVisible();
  // There's no code step to reach.
  await page.goto("/login/verify");
  await expect(page).toHaveURL(/\/campaigns$|\/login$/);
});
