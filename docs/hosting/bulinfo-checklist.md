# Bulinfo cPanel — questions to confirm before M1

Send these to Bulinfo support (24/7, 02 9699 100) and record the answers here.

| # | Question | Why we need it | Answer |
|---|---|---|---|
| 1 | Which plan supports running **two Node.js applications** at the same time (API + Next.js web), each on its own subdomain? | Web and API are separate Node apps | |
| 2 | Which **Node.js versions** are available in "Setup Node.js App"? We need the current LTS (22 or 24). | Framework requirements | |
| 3 | Are Node apps managed by **Passenger**? Are idle apps stopped, and after how long? Can we keep the API always running? | Cold starts and background work | |
| 4 | Is **cron** available, and what is the minimum interval (we want every 5 minutes)? | Batch closing, notifications | |
| 5 | **PostgreSQL version**, maximum connections per account, and is remote access possible for running migrations from CI? | Database setup and deploys | |
| 6 | Memory limit **per process** and per account; any limit on number of processes (`NPROC`) and entry processes (`EP`)? | Next.js and API memory use | |
| 7 | **SSH with key authentication** and rsync allowed? | Deploys from GitHub Actions | |
| 8 | Are **outgoing HTTPS requests** allowed to any host (payment provider, couriers, Firebase)? | Integrations | |
| 9 | Free **SSL** (Let's Encrypt / AutoSSL) for the main domain and subdomains? | HTTPS everywhere | |
| 10 | Outgoing email limits (we read ~300/hour) and whether SPF/DKIM/DMARC can be set for our domain. | Order emails reaching inboxes | |
| 11 | Backup policy: frequency, retention, and how to restore a single database. | Disaster recovery | |
| 12 | Server location (country / data centre). | GDPR and latency | |

**Chosen (2026-11-16): PRO, already paid, until 04.10.2027** (D-040). Domain kummie.eu registered
there too; DNS on ns5/ns6.bulinfo.org, MX on the hosting. Questions 1, 2 and 6 matter most for PRO
(two Node apps, Node version, memory per process).

Original recommendation: **MAX (2 GB RAM)** or at least **PRO (1.4 GB)** — START (1 GB) is too
small for two Node apps. Prices on bulinfo.net/en/hosting (checked 2026-11-16, incl. VAT):
PRO €7.33/month, MAX €13.26/month on a 1-year contract.
