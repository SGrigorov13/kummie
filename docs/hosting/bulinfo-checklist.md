# Bulinfo cPanel — questions and answers

Questions sent to Bulinfo support (24/7, 02 9699 100); answers received **2026-11-22** and checked
ourselves where marked.

| # | Question | Why we need it | Answer |
|---|---|---|---|
| 1 | Which plan supports running **two Node.js applications** at the same time (API + Next.js web), each on its own subdomain? | Web and API are separate Node apps | ✅ **Yes** — two projects can run at the same time on PRO. |
| 2 | Which **Node.js versions** are available in "Setup Node.js App"? We need the current LTS (22 or 24). | Framework requirements | ⚠️ Not answered ("depends on the application"). **Owner checks the version list in cPanel → Setup Node.js App.** We build for Node 24; Node 22 is the fallback (see below). |
| 3 | Are Node apps managed by **Passenger**? Are idle apps stopped, and after how long? Can we keep the API always running? | Cold starts and background work | ✅ Idle projects are **not stopped**. The web server is **LiteSpeed** (seen on 2026-11-17: `lsws` error pages), which runs Node apps through its own Node.js support. |
| 4 | Is **cron** available, and what is the minimum interval (we want every 5 minutes)? | Batch closing, notifications | ✅ Cron available, **no execution-time limit**; resources count against the account. Every 5 minutes is fine (each `tick` run is short). |
| 5 | **PostgreSQL version**, maximum connections per account, and is remote access possible for running migrations from CI? | Database setup and deploys | ✅ **PostgreSQL 16.15**, up to **100 connections**. Migrations run on the server over SSH as a deploy step (no remote DB access needed). CI now tests on PostgreSQL 16 (D-059). |
| 6 | Memory limit **per process** and per account; any limit on number of processes (`NPROC`) and entry processes (`EP`)? | Next.js and API memory use | ✅ **1.4 GB RAM** and **100 processes** for the **whole account** (shared by web, API, cron, mail). Budget: web ≈ 250–350 MB, API ≈ 150–200 MB, `tick` ≈ 100 MB for seconds — fits; DB pool stays at 5 per app. |
| 7 | **SSH with key authentication** and rsync allowed? | Deploys from GitHub Actions | ✅ **Yes**, after **2FA is enabled in cPanel** and Bulinfo is asked to activate SSH (owner). |
| 8 | Are **outgoing HTTPS requests** allowed to any host (payment provider, couriers, Firebase)? | Integrations | ✅ No restrictions on Bulinfo's side; the other side may need our server IP allowed (e.g. the bank's vPOS). Server IP: **87.121.18.11**. |
| 9 | Free **SSL** (Let's Encrypt / AutoSSL) for the main domain and subdomains? | HTTPS everywhere | ✅ Checked 2026-11-17: valid Let's Encrypt certificates on kummie.eu, www, api, admin, mail; http → https redirects on. |
| 10 | Outgoing email limits (we read ~300/hour) and whether SPF/DKIM/DMARC can be set for our domain. | Order emails reaching inboxes | ✅ Mailboxes hello@, support@, contact@; SPF, DKIM and DMARC (`p=none`) set; test e-mail arrived in the inbox (2026-11-17). |
| 11 | Backup policy: frequency, retention, and how to restore a single database. | Disaster recovery | ✅ Restores (databases and files) through **cPanel → JetBackup 5**. We still add our own nightly `pg_dump` copied off the server (M1 Task 12). |
| 12 | Server location (country / data centre). | GDPR and latency | Not asked yet — Bulinfo is a Bulgarian provider; to confirm for the privacy notice (M6). |

**Chosen (2026-11-16): PRO, already paid, until 04.10.2027** (D-040). Domain kummie.eu registered
there too; DNS on ns5/ns6.bulinfo.org, MX on the hosting.

## Owner actions before the first upload

1. **cPanel → Setup Node.js App → Create Application:** open the "Node.js version" list, note the
   versions offered (do not create anything yet) and send them over. If 24 is there, we use it;
   if the newest is 22, the build targets 22.
2. **cPanel → Two-Factor Authentication:** turn it on (authenticator app), then ask Bulinfo support
   to activate SSH for the account.
3. Later, together: create the PostgreSQL database and user in cPanel, add the GitHub deploy key,
   set the cron lines and the Node apps' environment variables.

## Notes

- Node: the project currently requires Node ≥ 24.11 (`package.json` engines, `.nvmrc`). Nothing in
  the code needs more than Node 22 except that setting; if Bulinfo offers only 22, the engines and
  the build target are lowered and CI checks both.
- PostgreSQL 16 vs 17: local development stays on 17; every migration uses features available
  since PostgreSQL 13 or earlier, and CI runs the database tests on 16 to match production.
