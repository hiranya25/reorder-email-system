import { describe, expect, it } from "vitest";
import {
  authorizationUrl,
  completeSignIn,
  googleProvider,
  identityFromClaims,
  microsoftProvider,
  newOidcRequest,
  type FetchLike,
} from "./oidc";

const TENANT = "11111111-2222-3333-4444-555555555555";
const ms = microsoftProvider({
  clientId: "ms-client",
  clientSecret: "ms-secret",
  tenantId: TENANT,
});
const google = googleProvider({
  clientId: "g-client",
  clientSecret: "g-secret",
});
const NOW = Date.parse("2026-10-20T10:00:00Z");
const exp = NOW / 1000 + 600;
const expect_ = { nonce: "n1", allowedDomain: "amipi.com", now: NOW };

const msClaims = (over: Record<string, unknown> = {}) => ({
  iss: `https://login.microsoftonline.com/${TENANT}/v2.0`,
  aud: "ms-client",
  exp,
  nonce: "n1",
  tid: TENANT,
  oid: "ms-oid-1",
  preferred_username: "Shreya@amipi.com",
  name: "Shreya Patel",
  ...over,
});
const gClaims = (over: Record<string, unknown> = {}) => ({
  iss: "https://accounts.google.com",
  aud: "g-client",
  exp,
  nonce: "n1",
  sub: "g-sub-1",
  email: "shruti@amipi.com",
  email_verified: true,
  hd: "amipi.com",
  name: "Shruti",
  ...over,
});

const jwt = (claims: object) =>
  `e30.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.sig`;

describe("Microsoft sign-in", () => {
  it("only works for one organisation", () => {
    expect(() =>
      microsoftProvider({
        clientId: "x",
        clientSecret: "y",
        tenantId: "common",
      }),
    ).toThrow(/tenant/i);
    expect(() =>
      microsoftProvider({ clientId: "x", clientSecret: "y" }),
    ).toThrow(/tenant/i);
  });

  it("accepts a company account and uses the stable object id", () => {
    expect(identityFromClaims(ms, msClaims(), expect_)).toEqual({
      provider: "microsoft",
      subject: "ms-oid-1",
      email: "shreya@amipi.com",
      name: "Shreya Patel",
    });
  });

  it("refuses other tenants, apps, old or replayed tokens and outside emails", () => {
    expect(() =>
      identityFromClaims(
        ms,
        msClaims({ tid: "99999999-2222-3333-4444-555555555555" }),
        expect_,
      ),
    ).toThrow(/company Microsoft/);
    expect(() =>
      identityFromClaims(
        ms,
        msClaims({ iss: "https://login.microsoftonline.com/other/v2.0" }),
        expect_,
      ),
    ).toThrow(/organisation/);
    expect(() =>
      identityFromClaims(ms, msClaims({ aud: "someone-else" }), expect_),
    ).toThrow(/different app/);
    expect(() =>
      identityFromClaims(ms, msClaims({ exp: NOW / 1000 - 3600 }), expect_),
    ).toThrow(/too long/);
    expect(() =>
      identityFromClaims(ms, msClaims({ nonce: "other" }), expect_),
    ).toThrow(/verified/);
    expect(() =>
      identityFromClaims(
        ms,
        msClaims({ preferred_username: "shreya@gmail.com" }),
        expect_,
      ),
    ).toThrow(/@amipi\.com/);
    expect(() =>
      identityFromClaims(ms, msClaims({ oid: undefined }), expect_),
    ).toThrow(/who you are/);
  });

  it("falls back to the email claim when the username isn't an amipi address", () => {
    const id = identityFromClaims(
      ms,
      msClaims({
        preferred_username: "shreya@amipi.onmicrosoft.com",
        email: "shreya@amipi.com",
      }),
      expect_,
    );
    expect(id.email).toBe("shreya@amipi.com");
  });
});

describe("Google sign-in", () => {
  it("accepts a verified company address", () => {
    expect(identityFromClaims(google, gClaims(), expect_)).toEqual({
      provider: "google",
      subject: "g-sub-1",
      email: "shruti@amipi.com",
      name: "Shruti",
    });
    expect(
      identityFromClaims(
        google,
        gClaims({ hd: undefined, iss: "accounts.google.com" }),
        expect_,
      ).email,
    ).toBe("shruti@amipi.com");
  });

  it("refuses unverified, other-domain and other-workspace accounts", () => {
    expect(() =>
      identityFromClaims(google, gClaims({ email_verified: false }), expect_),
    ).toThrow(/verified/);
    expect(() =>
      identityFromClaims(
        google,
        gClaims({ email: "shruti@gmail.com", hd: undefined }),
        expect_,
      ),
    ).toThrow(/@amipi\.com/);
    expect(() =>
      identityFromClaims(google, gClaims({ hd: "evil.com" }), expect_),
    ).toThrow(/@amipi\.com/);
  });
});

describe("the sign-in round trip", () => {
  it("sends PKCE and state, then swaps the code for the person", async () => {
    const req = { ...newOidcRequest("google", NOW), nonce: "n1" };
    const url = new URL(
      authorizationUrl(
        google,
        req,
        "https://reorder.example/auth/google/callback",
        "shruti@amipi.com",
      ),
    );
    expect(url.origin + url.pathname).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth",
    );
    expect(url.searchParams.get("state")).toBe(req.state);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).not.toBe(req.codeVerifier);
    expect(url.searchParams.get("login_hint")).toBe("shruti@amipi.com");

    let sent: URLSearchParams | undefined;
    const fetchFn: FetchLike = async (u, init) => {
      expect(u).toBe("https://oauth2.googleapis.com/token");
      sent = new URLSearchParams(init.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({ id_token: jwt(gClaims()) }),
      };
    };
    const id = await completeSignIn(
      google,
      req,
      {
        code: "c0de",
        state: req.state,
        redirectUri: "https://reorder.example/auth/google/callback",
        allowedDomain: "amipi.com",
        now: NOW + 1000,
      },
      fetchFn,
    );
    expect(id.email).toBe("shruti@amipi.com");
    expect(sent?.get("code_verifier")).toBe(req.codeVerifier);
    expect(sent?.get("client_secret")).toBe("g-secret");
  });

  it("refuses a wrong state, a stale request and a failed exchange", async () => {
    const req = { ...newOidcRequest("google", NOW), nonce: "n1" };
    const ok: FetchLike = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ id_token: jwt(gClaims()) }),
    });
    const input = {
      code: "c",
      state: req.state,
      redirectUri: "r",
      allowedDomain: "amipi.com",
      now: NOW,
    };
    await expect(
      completeSignIn(google, req, { ...input, state: "forged" }, ok),
    ).rejects.toThrow(/verified/);
    await expect(
      completeSignIn(google, req, { ...input, now: NOW + 11 * 60_000 }, ok),
    ).rejects.toThrow(/too long/);
    await expect(completeSignIn(ms, req, input, ok)).rejects.toThrow(
      /verified/,
    );
    const bad: FetchLike = async () => ({
      ok: false,
      status: 400,
      json: async () => ({ error: "invalid_grant" }),
    });
    await expect(completeSignIn(google, req, input, bad)).rejects.toThrow(
      /Google didn't complete/,
    );
  });
});
