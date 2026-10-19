import { expect, test } from "@playwright/test";

test("sign-in offers Microsoft and Google and sends people there safely", async ({ page }) => {
  await page.goto("/login");
  const google = page.getByRole("link", { name: "Sign in with Google" });
  const microsoft = page.getByRole("link", { name: "Sign in with Microsoft" });
  await expect(google).toBeVisible();
  await expect(microsoft).toBeVisible();

  // Stop at the provider's door; no real account is used.
  for (const [link, host, path] of [
    [google, "accounts.google.com", "/o/oauth2/v2/auth"],
    [microsoft, "login.microsoftonline.com", "/11111111-2222-3333-4444-555555555555/oauth2/v2.0/authorize"],
  ] as const) {
    const href = await link.getAttribute("href");
    const res = await page.request.get(href!, { maxRedirects: 0 });
    expect(res.status()).toBe(307);
    const to = new URL(res.headers()["location"]!);
    expect(to.host).toBe(host);
    expect(to.pathname).toBe(path);
    expect(to.searchParams.get("redirect_uri")).toMatch(/^http:\/\/localhost:3200\/auth\/(google|microsoft)\/callback$/);
    expect(to.searchParams.get("code_challenge_method")).toBe("S256");
    expect(to.searchParams.get("state")).toBeTruthy();
    expect(res.headers()["set-cookie"]).toMatch(/rc_oidc=.*HttpOnly/i);
  }
});

test("a forged or stale return from the provider is refused", async ({ page }) => {
  await page.goto("/auth/google/callback?code=abc&state=forged");
  await expect(page).toHaveURL(/\/login\?e=/);
  await expect(page.locator("p[role=alert]")).toContainText("Please try again");
  await page.goto("/auth/microsoft/callback?error=access_denied");
  await expect(page.locator("p[role=alert]")).toHaveText("Sign-in was cancelled.");
  // Text in the address bar can't put words on the sign-in page.
  await page.goto("/login?e=Call%20555-0100%20to%20unlock");
  await expect(page.locator("p[role=alert]")).toHaveCount(0);
  await page.goto("/campaigns");
  await expect(page).toHaveURL(/\/login$/);
});
