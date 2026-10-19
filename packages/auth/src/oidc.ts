import { createHash } from "node:crypto";
import { randomToken } from "./crypto";

/**
 * "Sign in with Microsoft" and "Sign in with Google" (OpenID Connect, authorization code + PKCE).
 *
 * The ID token comes straight from the provider's token endpoint over TLS, authenticated with our
 * client secret, so its signature doesn't need a separate check (OpenID Connect Core 3.1.3.7).
 * Every claim that matters is still checked: issuer, audience, expiry, nonce, tenant and email.
 */
export type ProviderId = "microsoft" | "google";

export interface ProviderSettings {
  clientId: string;
  clientSecret: string;
  /** Microsoft only: the directory (tenant) ID, a GUID. Sign-in is limited to this one organisation. */
  tenantId?: string;
}

export interface Provider {
  id: ProviderId;
  label: string;
  clientId: string;
  clientSecret: string;
  authorizeUrl: string;
  tokenUrl: string;
  issuers: string[];
  tenantId?: string;
}

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function microsoftProvider(s: ProviderSettings): Provider {
  const tenant = s.tenantId?.trim() ?? "";
  // "common" or "organizations" would let any Microsoft organisation in, and their email claims can't be trusted.
  if (!GUID.test(tenant))
    throw new Error(
      "MICROSOFT_TENANT_ID must be your directory (tenant) ID, a GUID from Microsoft Entra → Overview.",
    );
  const base = `https://login.microsoftonline.com/${tenant}`;
  return {
    id: "microsoft",
    label: "Microsoft",
    clientId: s.clientId,
    clientSecret: s.clientSecret,
    authorizeUrl: `${base}/oauth2/v2.0/authorize`,
    tokenUrl: `${base}/oauth2/v2.0/token`,
    issuers: [`${base}/v2.0`],
    tenantId: tenant.toLowerCase(),
  };
}

export function googleProvider(s: ProviderSettings): Provider {
  return {
    id: "google",
    label: "Google",
    clientId: s.clientId,
    clientSecret: s.clientSecret,
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    issuers: ["https://accounts.google.com", "accounts.google.com"],
  };
}

/** What we keep between sending someone to the provider and their return. */
export interface OidcRequest {
  provider: ProviderId;
  state: string;
  nonce: string;
  codeVerifier: string;
  createdAt: number;
}

export function newOidcRequest(
  provider: ProviderId,
  now = Date.now(),
): OidcRequest {
  return {
    provider,
    state: randomToken(),
    nonce: randomToken(),
    codeVerifier: randomToken(48),
    createdAt: now,
  };
}

function challenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function authorizationUrl(
  p: Provider,
  req: OidcRequest,
  redirectUri: string,
  loginHint?: string,
): string {
  const q = new URLSearchParams({
    client_id: p.clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: "openid email profile",
    state: req.state,
    nonce: req.nonce,
    code_challenge: challenge(req.codeVerifier),
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  if (loginHint) q.set("login_hint", loginHint);
  return `${p.authorizeUrl}?${q}`;
}

/** The person the provider vouched for. */
export interface SsoIdentity {
  provider: ProviderId;
  /** Stable account id at the provider (Microsoft `oid`, Google `sub`). */
  subject: string;
  email: string;
  name: string;
}

export class OidcError extends Error {}

function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const part = jwt.split(".")[1];
  if (!part)
    throw new OidcError("The sign-in provider sent an unreadable response.");
  try {
    return JSON.parse(
      Buffer.from(part, "base64url").toString("utf8"),
    ) as Record<string, unknown>;
  } catch {
    throw new OidcError("The sign-in provider sent an unreadable response.");
  }
}

const str = (v: unknown) => (typeof v === "string" ? v : undefined);

/** Checks the ID token's claims and picks out who signed in. */
export function identityFromClaims(
  p: Provider,
  claims: Record<string, unknown>,
  expect: { nonce: string; allowedDomain: string; now?: number },
): SsoIdentity {
  const now = Math.floor((expect.now ?? Date.now()) / 1000);
  if (!p.issuers.includes(str(claims.iss) ?? ""))
    throw new OidcError("This sign-in came from an unexpected organisation.");
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.includes(p.clientId))
    throw new OidcError("This sign-in was meant for a different app.");
  if (typeof claims.exp !== "number" || claims.exp < now - 60)
    throw new OidcError("The sign-in took too long. Please try again.");
  if (str(claims.nonce) !== expect.nonce)
    throw new OidcError("The sign-in couldn't be verified. Please try again.");

  const domain = expect.allowedDomain.toLowerCase();
  const inDomain = (e: string | undefined) =>
    !!e && (!domain || e.toLowerCase().endsWith(`@${domain}`));
  let email: string | undefined;
  let subject: string | undefined;

  if (p.id === "microsoft") {
    if (str(claims.tid)?.toLowerCase() !== p.tenantId)
      throw new OidcError("Use your company Microsoft account.");
    subject = str(claims.oid);
    // Within our own tenant these are set by the company's Microsoft admin.
    email = [
      str(claims.email),
      str(claims.preferred_username),
      str(claims.upn),
    ].find(inDomain);
  } else {
    if (claims.email_verified !== true)
      throw new OidcError("Your Google email address isn't verified.");
    const hd = str(claims.hd);
    if (hd && domain && hd.toLowerCase() !== domain)
      throw new OidcError(`Use your @${domain} Google account.`);
    subject = str(claims.sub);
    email = inDomain(str(claims.email)) ? str(claims.email) : undefined;
  }

  if (!subject)
    throw new OidcError("The sign-in provider didn't say who you are.");
  if (!email)
    throw new OidcError(
      domain
        ? `Sign in with your @${domain} account.`
        : "Your account has no email address.",
    );
  return {
    provider: p.id,
    subject,
    email: email.toLowerCase(),
    name: str(claims.name)?.trim() ?? "",
  };
}

export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/** Swaps the code from the provider's redirect for the signed-in person. */
export async function completeSignIn(
  p: Provider,
  req: OidcRequest,
  input: {
    code: string;
    state: string;
    redirectUri: string;
    allowedDomain: string;
    now?: number;
    maxAgeMs?: number;
  },
  fetchFn: FetchLike = fetch as unknown as FetchLike,
): Promise<SsoIdentity> {
  const now = input.now ?? Date.now();
  if (req.provider !== p.id || input.state !== req.state)
    throw new OidcError("The sign-in couldn't be verified. Please try again.");
  if (now - req.createdAt > (input.maxAgeMs ?? 10 * 60_000))
    throw new OidcError("The sign-in took too long. Please try again.");
  const res = await fetchFn(p.tokenUrl, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: input.code,
      redirect_uri: input.redirectUri,
      client_id: p.clientId,
      client_secret: p.clientSecret,
      code_verifier: req.codeVerifier,
    }).toString(),
  });
  const body = (await res.json().catch(() => ({}))) as { id_token?: unknown };
  if (!res.ok || typeof body.id_token !== "string")
    throw new OidcError(
      `${p.label} didn't complete the sign-in (${res.status}). Please try again.`,
    );
  return identityFromClaims(p, decodeJwtPayload(body.id_token), {
    nonce: req.nonce,
    allowedDomain: input.allowedDomain,
    now,
  });
}
