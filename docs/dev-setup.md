# Local development setup (Windows, PowerShell)

Everything below runs in **Windows PowerShell** (no bash needed). Docker is **not** required.

## 1. Tools

| Tool | Version | Check |
|---|---|---|
| Node.js | **26 LTS** (see `.nvmrc`); 24.11+ also works | `node -v` |
| pnpm | 12 (pinned in `package.json` → `packageManager`) | `pnpm -v` |
| PostgreSQL | 17, installed natively, running on `localhost:5432` | Services → `postgresql-x64-17` |
| Git | any recent | `git --version` |

pnpm comes with Node through Corepack:

```powershell
corepack enable
pnpm -v
```

## 2. Database

The API reads its connection from `DATABASE_URL` in `apps/api/.env`.
Local setup: database **`kummie`**, user **`postgres`**, on `localhost:5432`.

If the database does not exist yet, create it in pgAdmin (Databases → Create → `kummie`) or with
`psql` (installed with PostgreSQL, usually not on `PATH`):

```powershell
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -h localhost -c "CREATE DATABASE kummie;"
```

Then create the env file and put the `postgres` password in it:

```powershell
Copy-Item apps/api/.env.example apps/api/.env
notepad apps/api/.env
```

Replace `CHANGE_ME` in `DATABASE_URL=postgres://postgres:CHANGE_ME@localhost:5432/kummie`.
If the password contains special characters, URL-encode them (`@` → `%40`, `#` → `%23`,
`:` → `%3A`, `/` → `%2F`, `%` → `%25`). `.env` is git-ignored — never commit it.

Optional for the other apps (only needed from M1 on):

```powershell
Copy-Item apps/web/.env.example apps/web/.env.local
Copy-Item apps/admin/.env.example apps/admin/.env.local
```

## 3. Install, migrate, run

```powershell
pnpm install
pnpm --filter api db:migrate   # M0 has no tables yet; this only creates Drizzle's bookkeeping table
pnpm dev                       # web :3000, admin :5173, api :3001
```

Check the API and the database:

```powershell
Invoke-RestMethod http://localhost:3001/health
```

Expected: `status: ok`, `db: ok`. `db: not_configured` means `DATABASE_URL` is missing;
`db: error` means PostgreSQL refused the connection (wrong password, service stopped, wrong
database name) — the API log shows the reason.

| App | URL |
|---|---|
| Storefront (Next.js) | http://localhost:3000 → redirects to `/bg` |
| Typography review (D-003) | http://localhost:3000/dev/typography |
| Admin | http://localhost:5173 |
| API health | http://localhost:3001/health |

### Staff accounts (admin sign-in)

The staff API starts only when `apps/api/.env` has `DATABASE_URL` **and** `STAFF_SECRET_KEY`
(32 random bytes, base64 — it encrypts the 2FA secrets; never change it once accounts exist):

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Paste the output as `STAFF_SECRET_KEY=...` into `apps/api/.env`, restart `pnpm dev`, then create
your own account (the password is asked for in the terminal and is not shown):

```powershell
pnpm --filter api staff:create --email you@example.com --name "Your Name" --role admin
```

Open http://localhost:5173, sign in, and scan the QR code with an authenticator app (Google
Authenticator, Microsoft Authenticator, 1Password …) on the first sign-in. `ADMIN_ORIGINS` lists
the addresses the admin may call the API from (default: `http://localhost:5173`).

### Customer accounts and e-mails (local)

Sign-up, e-mail confirmation and password reset work locally without a mail server: every e-mail
is written as a text file to `apps/api/mail-outbox/` (git-ignored — the files contain personal
data, delete them when done). Open the newest file and paste its link into the browser.

1. Run `pnpm --filter api db:migrate` once (creates the customer and job tables).
2. Open http://localhost:3000/bg/signup, sign up, then open the link from the newest file in
   `apps/api/mail-outbox/`.
3. E-mails are sent right after the request; anything that failed is retried by
   `pnpm --filter api tick` (on the server: the cPanel cron every 5 minutes).

The shop must be listed in `WEB_ORIGINS` in `apps/api/.env` (default: http://localhost:3000), and
`NEXT_PUBLIC_API_URL` in `apps/web/.env.local` must point to the API (default: http://localhost:3001).
The minimum age for an account is the `accounts.minimumAge` setting (default 14, M1 spec A2).

### Checkout and test payments (local)

Add a product on a product page, open the cart and go to the checkout. Payment opens the test page
of the fake provider on the API (http://localhost:3001/fake-pay/…) with **Pay** and **Decline**;
nothing is charged. After paying, the order page shows step 1 of 7 and the confirmation e-mail
appears in `apps/api/mail-outbox/` (guests: its link carries the order key).

Set `FAKE_PAYMENT_SECRET` in `apps/api/.env` (any long random string) so open test payments keep
working after the API restarts; `API_URL` is the address the browser uses for the API.

## 4. Checks (a task is done only when all four pass)

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

**Database tests.** The API's PostgreSQL tests run only when `TEST_DATABASE_URL` points to a
database whose name ends in `_test` — they **wipe it** first. Locally that is `kummie_test` on the
same server (created once, next to `kummie`):

```powershell
$env:TEST_DATABASE_URL = "postgres://postgres:YOUR_PASSWORD@localhost:5432/kummie_test"
pnpm --filter api test
Remove-Item Env:TEST_DATABASE_URL
```

CI runs them in a separate job with a PostgreSQL 17 container.

## 5. Other commands

```powershell
pnpm --filter api tick          # run-once background worker (cPanel cron, every 5 minutes)
pnpm --filter api tick:daily    # daily jobs, e.g. the VAT rate check against EU TEDB (cron, 06:00)
pnpm --filter api db:generate   # write a new SQL migration after changing src/db/schema.ts
pnpm --filter api db:migrate    # apply pending migrations to the database in apps/api/.env
pnpm --filter api db:seed       # groups, categories and the demo products (safe to run again)
pnpm --filter web dev           # one app only
pnpm format                     # Prettier
```

## 6. Mobile (Expo)

```powershell
pnpm --filter mobile start      # Expo dev server; scan the QR code with Expo Go (Android)
pnpm --filter mobile android    # open on a connected device / emulator
pnpm --filter mobile typecheck
```

Add native packages with `npx expo install <package>` inside `apps/mobile` (see
`apps/mobile/AGENTS.md`), not with `pnpm add`.

## 7. Optional: Docker

Machines with Docker Desktop can run PostgreSQL 17 and Mailpit instead of a native install:

```powershell
docker compose up -d
```

Then use `DATABASE_URL=postgres://postgres:postgres@localhost:5432/kummie`. Mailpit's web UI is
http://localhost:8025. Nothing in the repo depends on Docker.

## Troubleshooting

- **Port already in use** — another dev server is running; stop it or change the port
  (`PORT` in `apps/api/.env`; `--port` in the web/admin `dev` scripts).
- **`ERR_PNPM_IGNORED_BUILDS`** — a new dependency wants to run an install script. Review it, then
  `pnpm approve-builds <package>` (this records it under `allowBuilds` in `pnpm-workspace.yaml`).
- **Bulgarian text in a different font** — expected for now: the brand fonts have no Cyrillic
  (D-003), so Cyrillic falls back to a system font until the owner chooses replacements.
