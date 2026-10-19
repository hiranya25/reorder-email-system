import { expect, test } from "@playwright/test";
import { admin, freshCode, signIn, totp } from "./helpers";

test("pages require sign-in", async ({ page }) => {
  await page.goto("/campaigns/demo/overview");
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/login$/);
});

test("wrong password and wrong code are refused", async ({ page }) => {
  const a = admin();
  await page.goto("/login");
  await page.getByLabel("Work email").fill(a.email);
  await page.getByLabel("Password").fill("Not-The-Password-123");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("p[role=alert]")).toHaveText("That email and password don't match.");

  await page.getByLabel("Password").fill(a.password);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL(/\/login\/verify$/);
  await page.getByLabel("Authenticator code").fill("000000");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator("p[role=alert]")).toContainText("didn't match");
  // A password alone never opens the console.
  await page.goto("/campaigns");
  await expect(page).toHaveURL(/\/login$/);
});

test("admin invites a reviewer who sets up password and authenticator", async ({ page, browser }) => {
  await signIn(page);
  await page.goto("/settings");
  await page.getByLabel("Invite by email").fill("shruti@amipi.com");
  await page.locator("select[name=role]").selectOption("reviewer");
  await page.getByRole("button", { name: "Create invite link" }).click();
  const link = await page.getByLabel("Invite link").inputValue();
  expect(link).toMatch(/^http:\/\/localhost:3200\/invite\/[\w-]{20,}$/);

  // Outside-domain invites are refused.
  await page.getByLabel("Invite by email").fill("someone@gmail.com");
  await page.getByRole("button", { name: "Create invite link" }).click();
  await expect(page.getByText("Only @amipi.com addresses can be invited.", { exact: true })).toBeVisible();

  // The reviewer accepts in their own browser.
  const ctx = await browser.newContext();
  const r = await ctx.newPage();
  await r.goto(link);
  await r.getByLabel("Your name").fill("Shruti");
  await r.getByLabel("Choose a password").fill("Holiday-Picks-Season-26!");
  await r.getByLabel("Type it again").fill("Holiday-Picks-Season-26!");
  await r.getByRole("button", { name: "Set password and continue" }).click();
  await r.waitForURL(/\/login\/verify$/);
  await expect(r.getByRole("heading", { name: "Set up your authenticator" })).toBeVisible();
  await r.getByText("Can't scan? Enter this key instead").click();
  const secret = (await r.getByTestId("totp-secret").innerText()).replace(/\s/g, "");
  await r.getByLabel("Authenticator code").fill(await freshCode(secret, r));
  await r.getByRole("button", { name: "Turn on and continue" }).click();
  await r.waitForURL(/\/login\/recovery-codes$/);
  await expect(r.getByTestId("recovery-codes").locator("li")).toHaveCount(8);
  await r.getByRole("button", { name: "I've saved them, continue" }).click();
  await r.waitForURL(/\/campaigns$/);
  await expect(r.getByText("Reviewer", { exact: true })).toBeVisible();

  // Reviewers see users but can't invite.
  await r.goto("/settings");
  await expect(r.getByText("Ask an admin to add people or change access.")).toBeVisible();
  await expect(r.getByLabel("Invite by email")).toHaveCount(0);

  // The invite link can't be reused.
  await r.goto(link);
  await expect(r.getByRole("heading", { name: "This link has expired" })).toBeVisible();

  // Admin disables the reviewer: their session ends immediately.
  await page.reload();
  await page.getByRole("row", { name: /shruti@amipi\.com/ }).getByRole("button", { name: "Disable" }).click();
  await expect(page.getByRole("row", { name: /shruti@amipi\.com/ }).getByText("Disabled", { exact: true })).toBeVisible();
  await r.goto("/campaigns");
  await expect(r).toHaveURL(/\/login$/);
  await ctx.close();
  expect(totp(secret)).toMatch(/^\d{6}$/);
});

test("sign out ends the session", async ({ page }) => {
  await signIn(page);
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL(/\/login$/);
  await page.goto("/campaigns");
  await expect(page).toHaveURL(/\/login$/);
});
