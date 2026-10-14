# Deploying the Reorder Console on InMotion cPanel

The console runs as a **Node.js app** (cPanel "Setup Node.js App") with a **PostgreSQL** database. You need cPanel and SSH access. Expect about 30 minutes the first time; later updates are one command.

**Requirements:** Node.js **20.9 or newer** (22 recommended) in *Setup Node.js App*, PostgreSQL 10 or newer, and a subdomain with SSL.

Below, `CPUSER` is your cPanel username and `reorder.amipi.com` is the console's address. Replace both.

---

## 1. Subdomain and SSL
1. cPanel → **Domains** → **Create a New Domain** → `reorder.amipi.com`.
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
APP_URL=https://reorder.amipi.com
ALLOWED_EMAIL_DOMAIN=amipi.com
ENV
chmod 600 ~/.reorder.env
openssl rand -base64 48   # copy this into APP_SECRET above
```
**APP_SECRET** encrypts the authenticator secrets. Keep it safe and never change it; changing it means everyone has to set up their authenticator again. Never commit this file or paste it into chat or email.

## 5. Create the Node.js app
cPanel → **Setup Node.js App** → **Create Application**:

| Field | Value |
|---|---|
| Node.js version | highest available, at least 20.9 (22 recommended) |
| Application mode | Production |
| Application root | `reorder-email-system/apps/console` |
| Application URL | `reorder.amipi.com` |
| Application startup file | `app.js` |

Under **Environment variables**, add the same four values as in `~/.reorder.env` (`DATABASE_URL`, `APP_SECRET`, `APP_URL`, `ALLOWED_EMAIL_DOMAIN`). Click **Create**.

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
It prints a one-time link. Open it, choose a password, and scan the QR code with an authenticator app (Microsoft Authenticator or Google Authenticator). Then invite everyone else from **Settings → Users and roles**.

If every admin is ever locked out, run the same command with `--force`.

## Updating later
```bash
source /home/CPUSER/nodevenv/reorder-email-system/apps/console/22/bin/activate
cd ~/reorder-email-system && ./scripts/deploy.sh
```

## Troubleshooting
- **"Missing server settings"** on the site: the environment variables in step 5 are missing. Add them and click **Restart**.
- **Blank page or 503:** cPanel → Setup Node.js App → your app → **Restart**, then check the app's `stderr.log` (in `apps/console`).
- **Can't sign in after changing APP_SECRET:** put the old value back, or reset each user from Settings.
