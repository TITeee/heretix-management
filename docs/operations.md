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
| `AUTH_URL` | yes | `http://localhost:3000` | The URL users open |
| `DATABASE_URL` | without Docker | (set by Compose) | PostgreSQL connection string |
| `POSTGRES_PASSWORD` | with Docker | `changeme` | Password of the Compose database |
| `HERETIX_API_URL` | | `http://host.docker.internal:5000` with Compose, `http://localhost:5000` without | heretix-api URL. The defaults reach a heretix-api on the same host; set it for one elsewhere. With Docker it is resolved inside the container, where `localhost` is the container itself. **Settings → Vulnerability API** overrides it |
| `HERETIX_API_KEY` | | | heretix-api key. Settings overrides it |
| `ANTHROPIC_API_KEY` | | | Key for AI Insight. **Settings → AI** overrides it |
| `CRON_REFRESH` | | `0 12 * * *` | When the metadata refresh runs (cron, UTC) |
| `CRON_SCAN` | | `0 13 * * *` | When every asset is scanned (cron, UTC) |
| `SEED_EMAIL` / `SEED_PASSWORD` / `SEED_NAME` | | `admin@example.com` / `changeme` / `Administrator` | The admin user `seed` creates |

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

- **Unique asset hostnames** (`add_asset_hostname_unique`): the upgrade adds a unique constraint on `Asset.hostname`, and fails rather than corrupting data if two assets share one. Check before upgrading, and rename or delete the duplicates:

  ```sql
  SELECT hostname, count(*) FROM "Asset" GROUP BY hostname HAVING count(*) > 1;
  ```

- **Severity tier for SLA** (2026-10): SLA due dates now follow the alert's severity tier instead of its raw CVSS score. Existing due dates keep their old value until an admin runs **Settings → SLA → Recalculate**.

- **Distro rating and fix status** (2026-09 / 10): existing alerts get them on their next scan.

## Scheduled jobs

On start, the server registers two daily jobs:

| Job | Default (UTC) | What it does |
|---|---|---|
| Refresh Metadata | 12:00 | Re-fetches CVSS, severity, EPSS, and KEV for open and in-progress alerts |
| Scan | 13:00 | Scans every asset ([alerts.md](alerts.md#scanning)) |

The scheduler assumes a single server process. A scan interrupted by a restart is marked failed on the next start.

## Settings

| Tab | Contents |
|---|---|
| Vulnerability API | heretix-api URL and key, connection test |
| Notifications | Slack webhook, triggers (new detections, severity changes, new KEV), minimum severity, asset-tag filter, test message |
| AI | Anthropic API key and model for AI Insight, connection test |
| SLA | On/off, hours or days per severity tier and for KEV, Recalculate |
| Access Tokens | Tokens for CI uploads (admin only; see [importing-assets.md](importing-assets.md#uploading-from-ci)) |
| About | Version |

## Users and audit log

- **Users** (admin only): add, edit, and delete users. Roles are **Admin** and **Operator**; only admins manage users, access tokens, and the audit log.
- **Audit Log** (admin only): the last 500 events: sign-ins (including failures), user management, settings changes, asset imports, scans and edits, and access tokens created, revoked, or deleted.

## Logging

Scan progress (started, completed, failed) and authentication events are written to stdout as JSON lines. With Docker, read them with `docker compose logs app`.
