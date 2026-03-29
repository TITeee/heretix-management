# heretix-management

A vulnerability management console that imports server package information collected by [heretix-cli](../heretix-cli) and uses heretix-api to detect, track, and manage vulnerabilities.

[日本語版 README](./README.ja.md)

## Tech Stack

| Role | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| UI | Tailwind CSS + shadcn/ui (base-ui) |
| Charts | Recharts |
| Table | TanStack Table |
| Auth | Auth.js v5 (NextAuth) — Credentials Provider |
| ORM | Prisma 7 |
| DB | PostgreSQL |
| Package Manager | pnpm |

## Features

- **Dashboard** — Two-tab layout: Overview / Tags
  - **Overview** — Total assets & alerts, severity summary, tag severity donut charts (Production / Development / Staging with color indicators), 8-week alert trend, Top 10 vulnerable assets & packages, KEV (Known Exploited Vulnerabilities) highlights
  - **Tags** — Cards for packages and assets linked to tags, color-coded by severity. Critical Packages cards (click to navigate to alert list), Production / Development / Staging asset cards (with Host / Docker Image icons, click to navigate to alert list)
- **Asset Management** — Import `inventory.json` (incremental updates), asset list & detail views, edit & delete
- **Manual Asset Registration** — Register network devices and firewalls directly via GUI
- **Manual Package Management** — Add, edit, and delete software installed outside the package manager. The Advisory tab supports Fortinet and Palo Alto Networks products via dropdown selection
- **Package Change History** — View added/updated/removed package history per asset at import time
- **Vulnerability Scanning** — Detect vulnerabilities via heretix-api batch search and record alerts (creates new Alerts only; does not update or auto-resolve existing Alerts)
- **Alert Management** — Status tracking (Open / In Progress / Resolved / Ignored), filters (Asset / Status / Severity, multi-value), bulk status update via checkbox selection
- **Auto-resolve Alerts** — Automatically marks old-version alerts as resolved when a package is upgraded during import
- **Alert Metadata Refresh** — Re-fetches the latest CVSS score, severity, EPSS, and KEV data from heretix-api for all open/in-progress Alerts (does not create new Alerts)
- **Refresh Run Log** — Records execution history only when changes occur. View run timestamp, update count, and before/after details via the **View History** button on the Alerts page
- **Alert Detail Panel** — Click a row to open a slide-over panel with Overview (basic info, memo, resolution reason), NVD tab (CVSS details, CWE, CISA KEV, reference links), OSV tab (description, affected versions, references), and Timeline tab (response history)
- **Alert Timeline** — Automatically records detection, status changes, memo saves, CVSS score changes, severity changes, and KEV additions in the Timeline tab
- **Vulnerability Search** — Search directly by package name, version, and ecosystem
- **User Management** — Add, edit, and delete users (admin role only)
- **Settings** — Configure heretix-api URL and API token, connection test
- **Scheduled Jobs** — On server start, node-cron registers daily jobs: Refresh Metadata (default 12:00 UTC) → Run Scan for all assets (default 13:00 UTC). Override with `CRON_REFRESH` / `CRON_SCAN` environment variables
- **Structured Logging** — Scan progress (started, completed, failed) and auth events (login success/failure) are logged as JSON to stdout. Collect with `docker logs` in Docker deployments

## Setup

### Prerequisites

- Node.js 20+
- pnpm
- PostgreSQL (with `heretix_management` database created)
- [heretix-api](../heretix-api) running (default: `http://localhost:5000`)

### Environment Variables

Create `.env.local`:

```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/heretix_management?schema=public"
AUTH_SECRET="your-secret-key"
AUTH_URL="http://localhost:3000"
# heretix-api URL and token can also be configured via the Settings page in the UI
HERETIX_API_URL="http://localhost:5000"
HERETIX_API_KEY="your-api-token"
# Scheduled job times (cron syntax, UTC). Defaults: refresh 12:00, scan 13:00
CRON_REFRESH="0 12 * * *"
CRON_SCAN="0 13 * * *"
```

### Install and Run

```bash
# Install dependencies
pnpm install

# Generate Prisma client
pnpm exec prisma generate

# Apply DB schema
pnpm exec prisma db push

# Create admin user (first time only)
pnpm seed
# Default: admin@example.com / changeme
# Custom: SEED_EMAIL=you@example.com SEED_PASSWORD=yourpass pnpm seed

# Start development server
pnpm dev
```

Open `http://localhost:3000` and log in.

## Docker Deployment

### Prerequisites

- Docker
- Docker Compose

### Setup

Create `.env` in the project root:

```env
# Required
AUTH_SECRET="your-secret-key"   # Generate with: openssl rand -base64 32
AUTH_URL="http://your-server-ip:3000"  # Set to the actual server IP/domain
POSTGRES_PASSWORD="changeme"

# Optional (can also be set via Settings page)
HERETIX_API_URL="http://localhost:5000"
HERETIX_API_KEY=""

# Scheduled jobs (cron syntax, UTC). Defaults: refresh 12:00, scan 13:00
CRON_REFRESH="0 12 * * *"
CRON_SCAN="0 13 * * *"
```

### Build and Run

```bash
docker compose build
docker compose up -d
docker compose logs -f app
```

Database migrations are applied automatically on container start.

### Initial Setup (first time only)

```bash
# Create admin user
docker compose exec app node_modules/.bin/tsx prisma/seed.ts
# Default: admin@example.com / changeme
# Custom: SEED_EMAIL=you@example.com SEED_PASSWORD=yourpass docker compose exec app node_modules/.bin/tsx prisma/seed.ts
```

### Useful Commands

```bash
# Stop
docker compose down

# Stop and delete database volume (full reset)
docker compose down -v

# View logs
docker compose logs -f app
```

## Usage

### 1. Registering Assets

**Servers & VMs (via heretix-cli):**
1. Go to **Assets** → **Import inventory.json** in the sidebar
2. Upload the `inventory.json` generated by heretix-cli
3. Packages are imported incrementally (only additions, updates, and removals are processed on re-import)
4. Manually added packages are preserved across re-imports

**Network Devices & Firewalls (manual registration):**
1. Go to **Assets** → **Add Manually** in the sidebar
2. Enter Name, Hostname, and Type, then click **Create Asset**
3. On the asset detail page, click **Add Package** → **Advisory tab**
   - Select Vendor (Fortinet / Palo Alto Networks) and product from the dropdown, then enter the version
4. Click **Run Scan** to detect vulnerabilities (uses heretix-api Vendor Advisory data)
5. After a firmware update, click **Edit** on the package to change the version and re-scan

### 2. Adding Manual Packages

1. Click **Add Package** in the top-right of the package table on the asset detail page
2. Select a tab and fill in the details:
   - **General** — Package name, version, and ecosystem (Linux, npm, PyPI, etc.)
   - **Advisory** — Select Vendor (Fortinet / Palo Alto Networks) and product from the dropdown, enter version (for network devices and firewalls)
   - **CPE** — Enter a CPE 2.3 string directly
3. Packages with a `manual` badge can be edited or deleted
4. Click the badge in the Alerts column to navigate to the alert list for that package

### 3. Vulnerability Scanning

1. Open the asset detail page
2. Click **Run Scan**
3. heretix-api checks all packages (including manually added ones) and generates alerts

### 4. Managing Alerts

1. Check the alert list under **Alerts** in the sidebar
2. Use **filters** (Asset / Status / Severity) to narrow down results (multiple values supported)
3. Select multiple alerts via checkboxes → bulk status update available
4. Click an alert row to open the detail panel:
   - **Overview** tab — Basic info, status change, memo, auto-resolution reason
   - **NVD** tab — CVSS detailed scores, CWE, CISA KEV info, reference links
   - **OSV** tab — Description, affected versions, reference links
5. Track progress by changing status: `Open` → `In Progress` → `Resolved` / `Ignored`
6. Click **Refresh Metadata** to sync the latest data from heretix-api

> **Run Scan vs. Refresh Metadata:**
> | | Run Scan | Refresh Metadata |
> |---|---|---|
> | Target | Packages of a specific asset | All Alerts (open / in_progress) |
> | Action | Batch search packages via heretix-api | Re-fetch each Alert by externalId |
> | Result | **Creates** new Alerts | **Updates** score, severity, etc. of existing Alerts |
> | Use case | Detecting new vulnerabilities | Keeping up with CVE score revisions, KEV additions, etc. |

### 5. Vulnerability Search

Use **Search** in the sidebar to search directly by package name, version, and ecosystem.

## Directory Structure

```
heretix-management/
├── app/
│   ├── (console)/              # Authenticated console screens
│   │   ├── layout.tsx          # Sidebar + topbar
│   │   ├── page.tsx            # Dashboard (Overview / Tags tabs)
│   │   ├── assets/             # Asset list, detail, import, manual registration
│   │   ├── alerts/             # Alert list
│   │   ├── users/              # User management (admin only)
│   │   ├── search/             # Vulnerability search
│   │   └── settings/           # Settings
│   ├── api/                    # API routes
│   │   ├── assets/
│   │   ├── alerts/
│   │   ├── users/
│   │   ├── search/
│   │   └── settings/
│   └── login/                  # Login page
├── components/
│   ├── ui/                     # shadcn/ui components (including severity-badge)
│   ├── layout/                 # Sidebar & topbar
│   ├── data-table/             # Shared DataTable & facet filters
│   ├── dashboard/              # Dashboard chart components (critical-packages-card, production-assets-card, etc.)
│   └── assets/                 # Asset column definitions
├── instrumentation.ts          # Initializes scheduler on server start
├── lib/
│   ├── auth.ts                 # Auth.js configuration
│   ├── db.ts                   # Prisma client
│   ├── severity.ts             # Severity & status color constants and helpers
│   ├── heretix-api.ts          # heretix-api client
│   ├── logger.ts               # Structured JSON log utility
│   ├── scan.ts                 # Scan logic (shared by route handler & scheduler)
│   ├── refresh.ts              # Metadata refresh logic (shared)
│   └── scheduler.ts            # node-cron schedule definitions
├── prisma/
│   ├── schema.prisma
│   └── seed.ts
└── middleware.ts               # Auth guard
```

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/assets` | List assets |
| POST | `/api/assets` | Create/update asset (inventory.json incremental import) |
| GET | `/api/assets/[id]` | Asset detail |
| PATCH | `/api/assets/[id]` | Update asset info (name / hostname / osName / osVersionId) |
| DELETE | `/api/assets/[id]` | Delete asset |
| POST | `/api/assets/[id]/scan` | Run vulnerability scan |
| POST | `/api/assets/[id]/packages` | Add manual package |
| PATCH | `/api/assets/[id]/packages/[pkgId]` | Edit manual package |
| DELETE | `/api/assets/[id]/packages/[pkgId]` | Delete manual package |
| GET | `/api/alerts` | List alerts |
| PATCH | `/api/alerts/[id]` | Update alert status / memo |
| GET | `/api/alerts/[id]/events` | List alert event history |
| POST | `/api/alerts/refresh` | Bulk refresh alert metadata from heretix-api |
| GET | `/api/alerts/refresh-log` | List Refresh Metadata run history |
| GET | `/api/search` | Vulnerability search (heretix-api proxy) |
| GET | `/api/settings` | Get settings |
| PATCH | `/api/settings` | Update settings |
| POST | `/api/settings/test` | Test heretix-api connectivity |
| GET | `/api/users` | List users (admin only) |
| POST | `/api/users` | Create user (admin only) |
| PATCH | `/api/users/[id]` | Update user (admin only) |
| DELETE | `/api/users/[id]` | Delete user (admin only) |
