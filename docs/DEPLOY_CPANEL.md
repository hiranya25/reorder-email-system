# Deploying the Reorder Console on InMotion cPanel

The console runs as a **Node.js app** (cPanel "Setup Node.js App") with a **PostgreSQL** database. You need cPanel and SSH access. Expect about 30 minutes the first time; later updates are one command.

**Requirements:** Node.js **22** (20.9 is the minimum) in *Setup Node.js App*, PostgreSQL 10 or newer, and a subdomain with SSL.

Below, `CPUSER` is your cPanel username and `reorder.nobulldiamond.com` is the console's address. Replace both.

---

## 1. Subdomain and SSL
1. cPanel → **Domains** → **Create a New Domain** → `reorder.nobulldiamond.com`.
2. cPanel → **SSL/TLS Status** → tick the new domain → **Run AutoSSL**. Wait until it shows a valid certificate.

## 2. Database
1. cPanel → **PostgreSQL Databases**.
2. **Create New Database:** `reorder` (cPanel names it `CPUSER_reorder`).
3. **Add New User:** `reorder` with a long generated password (cPanel names it `CPUSER_reorder`).
4. **Add User to Database:** that user and database, **ALL PRIVILEGES**.

Your connection string is:
```
postgres://CPUSER_reorder:PASSWORD@localhost:5432/CPUSER_reorder
```
If the password has symbols like `@ : / ? #`, URL-encode them (e.g. `@` → `%40`).

## 3. Get the code onto the server (SSH)
```bash
ssh CPUSER@your-server
cd ~
# The repository is private: add this server's key as a read-only Deploy key first
#   ssh-keygen -t ed25519 -C "cpanel-reorder"   (press Enter for no passphrase)
#   cat ~/.ssh/id_ed25519.pub   -> GitHub repo -> Settings -> Deploy keys -> Add (read-only)
git clone git@github.com:hiranya25/reorder-email-system.git
```

## 4. Settings file (secrets)
Create `~/.reorder.env`, readable only by you:
```bash
cat > ~/.reorder.env <<'ENV'
DATABASE_URL=postgres://CPUSER_reorder:PASSWORD@localhost:5432/CPUSER_reorder
APP_SECRET=PASTE_OUTPUT_OF_openssl_rand_-base64_48
APP_URL=https://reorder.nobulldiamond.com
ALLOWED_EMAIL_DOMAIN=amipi.com
# Sign in with Microsoft (step 4a). Leave out until you have them.
MICROSOFT_TENANT_ID=
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
# Sign in with Google (step 4b). Leave out until you have them.
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
ENV
chmod 600 ~/.reorder.env
openssl rand -base64 48   # copy this into APP_SECRET above
```
Remove any line you leave empty. **APP_SECRET** encrypts the sign-in state and any authenticator secrets. Keep it safe and never change it; changing it means everyone has to set up their authenticator again. Never commit this file or paste it into chat or email.

## 4a. Sign in with Microsoft (Microsoft 365 / Entra ID)
Done once by whoever administers AMIPI's Microsoft 365, about 10 minutes.
1. Go to **entra.microsoft.com** → **Identity → Applications → App registrations → New registration**.
2. Name: `Reorder Console`. Supported account types: **Accounts in this organizational directory only (single tenant)**.
3. Redirect URI: platform **Web**, `https://reorder.nobulldiamond.com/auth/microsoft/callback`. Click **Register**.
4. On the app's **Overview**, copy **Application (client) ID** → `MICROSOFT_CLIENT_ID`, and **Directory (tenant) ID** → `MICROSOFT_TENANT_ID`.
5. **Certificates & secrets → New client secret** (24 months). Copy the **Value** right away → `MICROSOFT_CLIENT_SECRET`. Put a reminder in the calendar to renew it before it expires.
6. **API permissions**: the default `User.Read` is enough. If your organisation requires it, click **Grant admin consent**.

## 4b. Sign in with Google
For anyone whose @amipi.com email is on a Google account, about 10 minutes.
1. Go to **console.cloud.google.com** → create a project `Reorder Console`.
2. **APIs & Services → OAuth consent screen**: user type **Internal** if amipi.com is a Google Workspace domain, otherwise **External**; app name `Reorder Console`; support email salesgroup@amipi.com. Scopes: `openid`, `email`, `profile` only. For **External**, click **Publish app** so it's not limited to test users.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**: type **Web application**; authorised redirect URI `https://reorder.nobulldiamond.com/auth/google/callback`.
4. Copy **Client ID** → `GOOGLE_CLIENT_ID` and **Client secret** → `GOOGLE_CLIENT_SECRET`.

Once at least one of these is set, the email + password + authenticator sign-in turns off. To keep it as well (for example while moving over), add `PASSWORD_LOGIN=on`.

Either way, only people invited from **Settings → Users and roles** (or with `pnpm create-admin`) can get in, and only with an @amipi.com address. The first sign-in ties their console account to that Microsoft or Google account. If someone needs to switch accounts, an admin uses **Reset sign-in**.

## 5. Create the Node.js app
cPanel → **Setup Node.js App** → **Create Application**:

| Field | Value |
|---|---|
| Node.js version | highest available, at least 20.9 (22 recommended) |
| Application mode | Production |
| Application root | `reorder-email-system/apps/console` |
| Application URL | `reorder.nobulldiamond.com` |
| Application startup file | `app.js` |

Under **Environment variables**, add the same values as in `~/.reorder.env` (`DATABASE_URL`, `APP_SECRET`, `APP_URL`, `ALLOWED_EMAIL_DOMAIN`, and the `MICROSOFT_…` / `GOOGLE_…` ones you have). Click **Create**.

> Don't use the page's "Run NPM Install" button. The project uses pnpm and the deploy script installs everything.

At the top of the app's page, cPanel shows a command like `source /home/CPUSER/nodevenv/reorder-email-system/apps/console/22/bin/activate && cd …`. Copy it; it puts the right Node.js on your SSH path.

## 6. First deploy
```bash
source /home/CPUSER/nodevenv/reorder-email-system/apps/console/22/bin/activate
cd ~/reorder-email-system
./scripts/deploy.sh
```
The script pulls `main`, installs, builds, copies static files, updates the database and restarts the app.

> If the build stops with "Killed" or out of memory, the hosting plan's memory limit is too low for building. Ask InMotion to raise it, or we can switch to building in GitHub and uploading the result.

## 7. First admin
```bash
set -a; . ~/.reorder.env; set +a
pnpm create-admin you@amipi.com
```
It prints a one-time link. Open it and click **Continue with Microsoft** (or Google) with that same email. Without Microsoft/Google set up, you choose a password and scan the QR code with an authenticator app instead. Then invite everyone else from **Settings → Users and roles**; invited people can also simply click the sign-in button on the login page.

If every admin is ever locked out, run the same command with `--force`.

## Updating later
```bash
source /home/CPUSER/nodevenv/reorder-email-system/apps/console/22/bin/activate
cd ~/reorder-email-system && ./scripts/deploy.sh
```

## Troubleshooting
- **"Missing server settings"** on the site: the environment variables in step 5 are missing. Add them and click **Restart**.
- **Blank page or 503:** cPanel → Setup Node.js App → your app → **Restart**, then check the app's `stderr.log` (in `apps/console`).
- **Microsoft says "AADSTS50011 … redirect URI":** the redirect URI in step 4a doesn't exactly match `APP_URL` + `/auth/microsoft/callback`.
- **Google says "redirect_uri_mismatch":** same for step 4b (`/auth/google/callback`).
- **"You don't have access yet":** the person hasn't been invited, or was invited with a different email. Invite them from Settings.
- **"…is linked to a different Microsoft/Google account":** they used another account before. An admin clicks **Reset sign-in** and sends the new link.
- **Can't sign in after changing APP_SECRET:** put the old value back, or reset each user from Settings.
