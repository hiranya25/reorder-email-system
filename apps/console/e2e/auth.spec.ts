import { expect, test } from "@playwright/test";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { admin, freshCode, setPassword, signIn, viewer } from "./helpers";

test("pages require sign-in", async ({ page }) => {
  await page.goto("/campaigns/demo/overview");
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/login$/);
});

test("wrong password and wrong code are refused", async ({ page }) => {
  const a = admin();
  await page.goto("/login");
  await page.getByLabel("Username or email").fill(a.email);
  await page.getByLabel("Password").fill("Not-The-Password-123");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("p[role=alert]")).toHaveText("That username or email and password don't match.");

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

test("admin adds, edits, disables and deletes a user", async ({ page, browser }) => {
  await signIn(page);
  await page.goto("/settings");
  const add = page.getByRole("form", { name: "Add a user" });
  await add.getByLabel("Full name").fill("Shruti K");
  await add.getByLabel("Username").fill("shruti");
  await add.getByLabel("Email").fill("shruti@amipi.com");
  await add.getByLabel("Role").selectOption("reviewer");
  // The rule shows while typing: 6+ characters with an uppercase, a lowercase and a number.
  await add.getByLabel("Password (optional)").fill("abcdef1");
  await expect(add.getByText("Include at least one uppercase letter (A–Z).")).toBeVisible();
  await add.getByLabel("Password (optional)").fill("Holiday-Picks-Season-26!");
  await expect(add.getByText(/Include at least one/)).toHaveCount(0);
  await add.getByLabel("Type the password again").fill("Holiday-Picks-Season-26!");
  await add.getByRole("button", { name: "Add user" }).click();
  await expect(page.getByText(/Shruti K added\./)).toBeVisible();
  await expect(page.getByRole("row", { name: /shruti@amipi\.com/ }).getByText("Not signed in yet")).toBeVisible();

  // Outside-domain and duplicate usernames are refused.
  await add.getByLabel("Full name").fill("Someone");
  await add.getByLabel("Username").fill("shruti");
  await add.getByLabel("Email").fill("someone@amipi.com");
  await add.getByRole("button", { name: "Add user" }).click();
  await expect(page.getByText("That username is taken.")).toBeVisible();
  await add.getByLabel("Username").fill("");
  await add.getByLabel("Email").fill("someone@gmail.com");
  await add.getByRole("button", { name: "Add user" }).click();
  await expect(page.getByText("Only @amipi.com addresses can be added.")).toBeVisible();

  // Shruti signs in with her username in her own browser and sets up the authenticator.
  const ctx = await browser.newContext();
  const r = await ctx.newPage();
  await r.goto("/login");
  await r.getByLabel("Username or email").fill("Shruti");
  await r.getByLabel("Password").fill("Holiday-Picks-Season-26!");
  await r.getByRole("button", { name: "Continue" }).click();
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

  // Reviewers see users but can't add or change them.
  await r.goto("/settings");
  await expect(r.getByText("Ask an admin to add people or change access.")).toBeVisible();
  await expect(r.getByRole("form", { name: "Add a user" })).toHaveCount(0);

  // Admin renames her username; the old one stops working.
  await page.reload();
  await page.getByRole("button", { name: "Edit shruti@amipi.com" }).click();
  const edit = page.getByRole("form", { name: "Edit Shruti K" });
  await edit.getByLabel("Username").fill("shruti.k");
  await edit.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Shruti K saved.")).toBeVisible();
  await expect(page.getByRole("row", { name: /shruti@amipi\.com/ }).getByText("shruti.k ·")).toBeVisible();

  // Disabling ends her session immediately.
  await page.getByRole("row", { name: /shruti@amipi\.com/ }).getByRole("button", { name: "Disable" }).click();
  await expect(page.getByRole("row", { name: /shruti@amipi\.com/ }).getByText("Disabled", { exact: true })).toBeVisible();
  await r.goto("/campaigns");
  await expect(r).toHaveURL(/\/login$/);
  await ctx.close();

  // Deleting removes the account; the log still names her.
  await page.getByRole("button", { name: "Delete shruti@amipi.com" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete user" }).click();
  await expect(page.getByText("User deleted.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit shruti@amipi.com" })).toHaveCount(0);
  await page.reload();
  await expect(page.getByText("Shruti K (deleted)").first()).toBeVisible();
  // Admins can't delete themselves.
  await expect(page.getByRole("button", { name: `Delete ${admin().email}` })).toHaveCount(0);
});

test("forgot password emails a one-time link", async ({ page }) => {
  const outbox = join(__dirname, ".outbox.jsonl");
  rmSync(outbox, { force: true });
  const v = viewer();
  await page.goto("/login");
  await page.getByRole("link", { name: "Forgot password?" }).click();
  // Both pages have a "Username or email" box: wait for the new page before typing.
  await page.waitForURL(/\/login\/forgot$/);
  await expect(page.getByRole("heading", { name: "Forgot your password?" })).toBeVisible();
  await page.getByLabel("Username or email").fill(v.email);
  await page.getByRole("button", { name: "Email me a link" }).click();
  await expect(page.getByText(/If an account matches, we've emailed a link/)).toBeVisible();
  // Unknown accounts get the same answer and no email.
  await page.goto("/login/forgot");
  await page.getByLabel("Username or email").fill("nobody@amipi.com");
  await page.getByRole("button", { name: "Email me a link" }).click();
  await expect(page.getByText(/If an account matches/)).toBeVisible();

  const mails = readFileSync(outbox, "utf8").trim().split("\n").map((l) => JSON.parse(l) as { to: string; text: string });
  expect(mails).toHaveLength(1);
  expect(mails[0]!.to).toBe(v.email);
  const link = mails[0]!.text.match(/http:\/\/localhost:3200\/reset-password\/[\w-]+/)![0];

  const newPassword = "Fresh-Season-Password-27";
  await page.goto(link);
  await page.getByLabel("New password").fill(newPassword);
  await page.getByLabel("Type it again").fill(newPassword);
  await page.getByRole("button", { name: "Save new password" }).click();
  await page.waitForURL(/\/login\?reset=1$/);
  await expect(page.getByText("Password saved. Sign in with your new password.")).toBeVisible();
  // The link works once.
  await page.goto(link);
  await expect(page.getByRole("heading", { name: "This link has expired" })).toBeVisible();

  // The new password works (still with the authenticator code); keep it for later tests.
  await signIn(page, { ...v, password: newPassword });
  setPassword("viewer", newPassword);
});

test("sign out ends the session", async ({ page }) => {
  await signIn(page);
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL(/\/login$/);
  await page.goto("/campaigns");
  await expect(page).toHaveURL(/\/login$/);
});
