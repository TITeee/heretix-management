# Operations

## Running with Docker

The [README's quick start](../README.md#quick-start) covers the first start. Day to day:

```bash
docker compose up -d --build   # start, or rebuild after an update
docker compose logs -f app     # follow the logs
docker compose down            # stop
docker compose down -v         # stop and delete the database volume (full reset)
```

The container runs `prisma migrate deploy` before starting the server, so a schema change in an update is applied on the next start.

## Running without Docker

Needs Node.js 22 (as in the Docker image), pnpm, PostgreSQL 15+ with a `heretix_management` database, and a running heretix-api.

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Create `.env.local` (variables below):

   ```env
   DATABASE_URL="postgresql://postgres:password@localhost:5432/heretix_management?schema=public"
   AUTH_SECRET="your-secret-key"
   AUTH_URL="http://localhost:3000"
   HERETIX_API_URL="http://localhost:5000"
   HERETIX_API_KEY="your-api-key"
   ```

3. Create the database schema, the admin user, and the default tags:

   ```bash
   pnpm exec prisma generate
   pnpm exec prisma db push
   pnpm seed
   ```

4. Start it at `http://localhost:3000`:

   ```bash
   pnpm dev                   # development
   pnpm build && pnpm start   # production
   ```

## Environment variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `AUTH_SECRET` | yes | | Session signing key (`openssl rand -base64 32`) |
| `AUTH_URL` | yes | `http://localhost:3000` | The URL users open. Behind a TLS proxy, its `https://` address ([tls-proxy.md](tls-proxy.md)) |
| `BIND_ADDRESS` | | `0.0.0.0` | With Docker, the address the app port is published on. `127.0.0.1` leaves it to a reverse proxy on the same host |
| `DATABASE_URL` | without Docker | (set by Compose) | PostgreSQL connection string |
| `POSTGRES_PASSWORD` | with Docker | `changeme` | Password of the Compose database |
| `HERETIX_API_URL` | | `http://host.docker.internal:5000` with Compose, `http://localhost:5000` without | heretix-api URL. The defaults reach a heretix-api on the same host; set it for one elsewhere. With Docker it is resolved inside the container, where `localhost` is the container itself. **Settings → Vulnerability API** overrides it |
| `HERETIX_API_KEY` | | | heretix-api key. Settings overrides it |
| `HERETIX_API_BATCH_TIMEOUT_MS` | | `300000` (5 minutes) | How long a scan waits for one heretix-api batch search. A large host (an RHEL server with its kernels) can take minutes when heretix-api's database has to read from disk |
| `HERETIX_API_REFRESH_PER_MINUTE` | | `900` | How many vulnerabilities the metadata refresh looks up in a minute. heretix-api allows each client 1,200 requests a minute (its `RATE_LIMIT_MAX`) and everything heretix-management sends shares that budget; a refresh that took all of it left the alert detail panel failing until it finished, so the default keeps a quarter free. A refresh of 11,000 vulnerabilities then takes about 12 minutes. Raise it together with `RATE_LIMIT_MAX`; `0` turns the pacing off |
| `ANTHROPIC_API_KEY` | | | Key for AI Insight. **Settings → AI** overrides it |
| `CRON_REFRESH` | | `0 12 * * *` | When the metadata refresh runs (cron, UTC) |
| `CRON_SCAN` | | `45 */3 * * *` | When every asset is scanned (cron, UTC): every three hours at :45 by default |
| `SCAN_STALE_HOURS` | | `36` | Without a successful scan for this long, the dashboard says the scheduler may not be running |
| `SEED_EMAIL` / `SEED_PASSWORD` / `SEED_NAME` | | `admin@example.com` / (generated, printed once) / `Administrator` | The admin user `seed` creates. `SEED_PASSWORD` must be at least 12 characters |
| `MAX_IMPORT_BODY_MB` | | `50` | Largest SBOM, CSV or VEX upload accepted, in MB; a larger one is refused with 413. A heretix-cli SBOM is about 1.1 KB a package. Other requests are limited to 1 MB |

heretix-api's URL and key are read from Settings first, so they can be changed without a restart. Slack, SLA, and the AI model are configured in Settings only.

## Upgrading

With Docker, pull and rebuild:

```bash
git pull
docker compose up -d --build
```

Migrations run on start. Re-running the seed is not needed.

Without Docker:

```bash
git pull
pnpm install
pnpm exec prisma generate
pnpm exec prisma db push
pnpm seed      # updates the default tags: adds new ones, unmarks retired ones
pnpm build && pnpm start
```

### Notes for specific upgrades

- **inventory.json ends** (0.4.0): importing the `inventory.json` of older heretix-cli versions is rejected (400), from the console and from the API. Assets and alerts already imported are not affected. Update heretix-cli and collect a CycloneDX SBOM; re-importing it under the same hostname updates the asset.

- **Unique asset hostnames** (`add_asset_hostname_unique`): the upgrade adds a unique constraint on `Asset.hostname`, and fails rather than corrupting data if two assets share one. Check before upgrading, and rename or delete the duplicates:

  ```sql
  SELECT hostname, count(*) FROM "Asset" GROUP BY hostname HAVING count(*) > 1;
  ```

- **Severity tier for SLA** (2026-10): SLA due dates now follow the alert's severity tier instead of its raw CVSS score. Existing due dates keep their old value until an admin runs **Settings → SLA → Recalculate**.

- **Distro rating and fix status** (2026-09 / 10): existing alerts get them on their next scan.

## Scheduled jobs

On start, the server registers two scheduled jobs:

| Job | Default (UTC) | What it does |
|---|---|---|
| Refresh Metadata | 12:00 | Re-fetches CVSS, severity, EPSS, and KEV for open and in-progress alerts |
| Scan | every three hours at :45 (00:45, 03:45, ... 21:45) | Scans every asset ([alerts.md](alerts.md#scanning)); skipped if a Rescan All from the Assets page is still running |

The refresh runs once a day, after heretix-api has imported KEV and EPSS (09:00 and 10:00 UTC by default), since those change at most daily and it makes one request per vulnerability. A scan is cheap, one request per 1,000 packages, so it runs often: heretix-api imports NVD every two hours and the vendor advisories, CVE Records and Microsoft's documents through the day until 18:30, and a scan at :45 sees what the import before it brought, so a new finding becomes an alert within about three hours of heretix-api having it. Scans keep off the minutes heretix-api imports in, and the 12:45 scan follows the 12:00 refresh. Change `CRON_SCAN` to scan less often; keep it clear of `CRON_REFRESH`.

**Pausing automatic scans.** Settings → Vulnerability API → **Pause Automatic Scans** stops the scheduled scan and the scan after an upload with `?scan=true` (the import itself still happens), without a restart. Use it while heretix-api is being restored from a backup or loaded again: until its data is complete, alerts look gone to a scan, which starts their grace period and, after about three days, closes them. Scans started by hand (Run Scan, Rescan All, editing a package) still run. Every page shows a banner while scans are paused, and each skipped scheduled scan is logged. The setting is kept in the database, so restoring heretix-management from a backup brings back whatever it was when the backup was taken: check it after a restore.

The scheduler assumes a single server process. A scan interrupted by a restart is marked failed on the next start.

### When heretix-api answers 429

heretix-api limits each client address to 1,200 requests a minute (`RATE_LIMIT_MAX` in its configuration), and heretix-management, which reaches it from one address, shares that budget between the refresh, scans and the console. The refresh keeps to `HERETIX_API_REFRESH_PER_MINUTE` so that the alert detail panel, a search or a VEX export still gets an answer while it runs. The refresh and the scan's CPE searches wait out a 429 and ask again; the console's own lookups do not, so they would show an error if the budget were used up. A heretix-api log full of `429` during a refresh at the default setting means something else is also using the address.

### When scans or the refresh fail

A failed scan leaves the asset's alerts as they were, and a failed refresh leaves their CVSS, severity, EPSS, and KEV as they were (so SLA due dates may be out of date), so the failure goes unseen unless it is shown:

- **Dashboard**: a notice appears at the top while any asset's latest scan failed (with the error and the assets), or when no scan has succeeded for `SCAN_STALE_HOURS`. The second case catches a server that is down or a scheduler that never started, which leave no failed scan to show. It stays quiet on an installation that has never scanned. The same notice reports the metadata refresh when its latest run failed (it stopped with an error, or half or more of its lookups to heretix-api failed; a lookup or two failing is only logged) or when it has not run for `SCAN_STALE_HOURS`, with the time of the last good refresh.
- **Asset page and Assets list**: *Last Scan* / *Last Scanned* is the time of the last scan that completed (taken from the scan jobs, not from the inventory's own timestamp), with a note when the latest attempt failed.
- **Slack**: when Slack is on, a scheduled scan that failed for any asset sends one message per run, with the errors grouped, and another if the run could not start at all. These ignore the tag and severity filters. A scheduled metadata refresh that failed in that sense sends one message too. Scans and refreshes started by hand or from CI are not announced; they show their error to whoever ran them.

## Troubleshooting

### The console does not answer

```bash
docker compose ps                                              # db and app are both up
curl -s -o /dev/null -w "%{http_code}\n" localhost:3000/login  # 200
docker compose logs -f app                                     # what the app says
```

On first start, the container creates the database schema before the console answers on port 3000, and on an update it applies new migrations first.

### Test Connection fails

**Settings → Vulnerability API → Test Connection** checks that heretix-management reaches heretix-api with its key. When it fails, check that:

- heretix-api answers: `curl http://localhost:5000/health` on its server.
- the key is heretix-api's `API_KEY` (not `ADMIN_API_KEY`).
- with heretix-api on another server, `HERETIX_API_URL` points there and its port 5000 is reachable. A URL with `localhost` never works from inside the container; with heretix-api on the same server, leave `HERETIX_API_URL` unset (it defaults to `http://host.docker.internal:5000`).

### The admin password was lost

The seed prints the generated password only once and stores only its hash. Delete the admin user and run the seed again; this removes only that user:

```bash
docker compose exec db psql -U postgres heretix_management -c "DELETE FROM \"User\" WHERE email = 'admin@example.com';"
docker compose exec app node_modules/.bin/tsx prisma/seed.ts
```

To choose the password, or the address, instead of a generated one, set `SEED_PASSWORD` (at least 12 characters) and `SEED_EMAIL` for that command. Another admin can also set a new password by editing the user on the **Users** page.

## Settings

| Tab | Contents |
|---|---|
| Vulnerability API | heretix-api URL and key, connection test |
| Notifications | Slack webhook, triggers (new detections, severity changes, new KEV, reopened alerts), minimum severity, asset-tag filter, test message |
| AI | Anthropic API key, model (a list of Claude models, or any model ID) and reply language for AI Insight, connection test |
| SLA | On/off, hours or days per severity tier and for KEV, Recalculate |
| Access Tokens | Tokens for CI uploads (admin only; see [importing-assets.md](importing-assets.md#uploading-from-ci)) |
| About | Version |

## Users and audit log

- **Users** (admin only): add, edit, and delete users. Roles are **Admin** and **Operator**; only admins manage users, access tokens, and the audit log.
- **Audit Log** (admin only): the last 500 events: sign-ins (including failures), user management, settings changes, asset imports, scans and edits, and access tokens created, revoked, or deleted.

## Logging

Scan progress (started, completed, failed) and authentication events are written to stdout as JSON lines. With Docker, read them with `docker compose logs app`.
