# heretix-management

A vulnerability management console that imports server package information collected by [heretix-cli](../heretix-cli) and uses heretix-api to detect, track, and manage vulnerabilities.

[日本語版 README](./README.ja.md)

![Alert Management](docs/alerts.png)

## Features

- **Dashboard** — Two-tab layout: Overview / Tags
  - **Overview** — Total assets & alerts, severity summary (with direct/indirect dependency breakdown), tag severity donut charts (Internet Facing / Public Endpoint), 8-week alert trend, Top 10 vulnerable assets & packages, KEV highlights
  - **Tags** — Cards for packages and assets linked to tags, color-coded by severity
- **Asset Management** — Import `inventory.json` or **CycloneDX BOM** (incremental updates, PURL parsing with scoped npm / Go module / OS package support), asset list & detail views, edit & delete
- **Dependency Graph** *(Beta)* — Visual dependency graph on the Asset detail page (Dependency Graph tab). Shows vulnerable packages (red) and their upstream dependents (configurable 1–8 hops), with automatic layout via dagre. Available for packages with lockfile-based dependency data (npm/pnpm fully supported; Go and PyPI partially). Works with SBOM or inventory.json from heretix-cli, and with standard CycloneDX SBOMs from tools such as Syft, trivy, and cdxgen
- **Manual Asset Registration** — Register network devices and firewalls directly via GUI
- **Tags** — Create color-coded tags for assets or packages (e.g. "Internet Facing", "Public Endpoint"), assign them from the asset/package detail pages, and view aggregated severity counts per tag on the Tags page and Dashboard
- **Manual Package Management** — Add, edit, and delete software installed outside the package manager. The Advisory tab supports Fortinet, Palo Alto Networks, Cisco, Sophos, SonicWall, Broadcom/VMware, Oracle, Splunk, Apache HTTP Server, Nginx, Apache Tomcat, and Zabbix products via dropdown selection
- **Package Change History** — View added/updated/removed package history per asset at import time
- **Vulnerability Scanning** — Detect vulnerabilities via heretix-api batch search and record alerts (creates new Alerts only; does not update or auto-resolve existing Alerts). Malicious package detection (`MAL-` alerts) is also supported via [ossf/malicious-packages](https://github.com/ossf/malicious-packages)
- **Alert Management** — Status tracking (Open / In Progress / Resolved / Ignored), filters (Asset / Status / Severity / Tags / **Dependency** (Direct/Indirect), multi-value), bulk status update, **export to CSV / JSON** (reflects active filters). Note: Direct/Indirect classification requires either lockfile-based dependency data (npm/pnpm primarily) or an explicit direct-dependency marker in the SBOM (heretix-cli's own `cdx:direct` property). Third-party OS-package SBOM sources — e.g. Syft's dpkg/apt cataloger — don't record this at all: their `bom.dependencies` graph has no entry for the scanned image/container itself, so there's nothing to infer "directly installed" from, and every OS package comes back unclassified rather than guessed at. Manually added packages are unclassified too
- **Auto-resolve Alerts** — Automatically marks old-version alerts as resolved when a package is upgraded during import
- **SLA / Due Date** — Configurable SLA thresholds by CVSS severity (Critical / High / Medium / Low), with a fixed override for CISA KEV alerts. Each Alert's due date is calculated automatically on detection and recalculated when CVSS or KEV status changes. The Alerts table shows a **Due** column and filter (Overdue / Urgent / Warning / OK), and the Alert Detail panel shows the due date with status coloring. SLA tracking can be disabled entirely in Settings, which hides the Due column and filter
- **Alert Metadata Refresh** — Re-fetches the latest CVSS score, severity, EPSS, and KEV data from heretix-api for all open/in-progress Alerts (does not create new Alerts)
- **Alert Activity** — View all alert events (detections, status changes, metadata updates) across all assets in a single table. Filter by event type or asset. Accessible via the **Activity** button on the Alerts page
- **Alert Detail Panel** — Click a row to open a slide-over panel with Overview (basic info, memo, resolution reason), NVD, OSV, Advisory, **Dependents** *(Beta)* (interactive graph showing packages that depend on the vulnerable package, with dependency paths), and Timeline tabs
- **Alert Timeline** — Automatically records detection, status changes, memo saves (with author name and memo content), CVSS score changes, severity changes, KEV additions, and VEX justification changes in the Timeline tab
- **VEX (Vulnerability Exploitability eXchange)** *(Beta)* — CycloneDX VEX support for producer and consumer workflows:
  - **Export** (`GET /api/vex`, **Export VEX** button): Outputs ignored alerts as CycloneDX 1.6 VEX JSON. Compatible with `trivy image myapp --vex vex.json`
  - **Import** (`POST /api/vex/import`, **Import VEX** button): Ingest a CycloneDX VEX document and auto-apply status changes to matching alerts. Records a `vex_imported` event in the Timeline for audit trail. Affected versions are read from the PURL (`pkg:npm/lodash@4.17.20`) or from `affects[].versions[]`; VERS ranges (`vers:npm/>=4.0.0|<4.17.21`) are reported back rather than evaluated, since misjudging one would silently ignore an exploitable finding
  - **Ignoring an alert requires a reason**, because `ignored` covers more ground than VEX's `not_affected` and an unlabelled decision would drop out of the export with nothing left to find it by:

    | Reason | Meaning | Exported as |
    |---|---|---|
    | **Not affected** | Vulnerable code is present but cannot be exploited here. Requires a CycloneDX justification (`code_not_reachable`, `code_not_present`, etc.) | `state: not_affected` + justification |
    | **False positive** | The finding itself is wrong, e.g. the scanner matched the wrong package or version | `state: false_positive` |
    | **Accepted risk** | Exploitable, but the team decided not to act | Not exported, kept internally |

    Accepted risk is withheld from the document on purpose: its faithful encoding (`state: exploitable` + `response: will_not_fix`) gives a consumer nothing actionable while stopping the finding from being suppressed in their scans.
  - **Prior judgment reuse**: when the same finding (vulnerability + package + version + ecosystem) has already been judged on another asset, that judgment is shown on the alert with a one-click **Apply this judgment** button. Judgments are never applied automatically, because only `code_not_present` and `protected_by_compiler` describe the build itself. The other seven justifications describe the deployment (network placement, runtime protections, configuration, reachability from the calling code), so the panel warns when reuse needs re-verification and flags assets whose tags differ
- **Vulnerability Search** — Search by package name / version / ecosystem, CVE/OSV ID, CPE 2.3 string, or **Advisory mode** (Vendor Advisory search for Fortinet, Palo Alto Networks, Cisco, Sophos, SonicWall, Broadcom/VMware, Oracle, Splunk, Apache HTTP Server, Nginx, Apache Tomcat, and Zabbix products)
- **User Management** — Add, edit, and delete users (admin role only)
- **Audit Log** — Admin-only page showing the last 500 events: login, user management, settings changes, asset operations. Accessible from the sidebar (admin only)
- **Settings** — Tabbed configuration: **API** (heretix-api URL/token, connection test), **Notifications** (Slack webhook — notify on new detections, severity changes, or new KEV alerts, filterable by minimum severity and asset tags, with a test-send button), **SLA** (enable/disable and configure thresholds), **About** (version info)
- **Scheduled Jobs** — On server start, node-cron registers daily jobs: Refresh Metadata (default 12:00 UTC) → Run Scan for all assets (default 13:00 UTC). Override with `CRON_REFRESH` / `CRON_SCAN` environment variables
- **Structured Logging** — Scan progress (started, completed, failed) and auth events (login success/failure) are logged as JSON to stdout. Collect with `docker logs` in Docker deployments

## Setup

### Option A: Docker (recommended)

**Prerequisites:** Docker, Docker Compose

1. Create `.env` in the project root:
   ```env
   # Required
   AUTH_SECRET="your-secret-key"   # Generate with: openssl rand -base64 32
   AUTH_URL="http://your-server-ip:3000"  # Set to the actual server IP/domain
   POSTGRES_PASSWORD="changeme"

   # Optional (can also be set via Settings page)
   HERETIX_API_URL="http://localhost:5000"
   HERETIX_API_KEY=""

   # Scheduled job times (cron syntax, UTC — minute hour day month weekday):
   #   CRON_REFRESH — re-fetches CVSS/severity/EPSS/KEV for existing Alerts (default 12:00)
   #   CRON_SCAN    — scans all assets for new vulnerabilities, runs after refresh (default 13:00)
   CRON_REFRESH="0 12 * * *"
   CRON_SCAN="0 13 * * *"
   ```

2. Build and run:
   ```bash
   docker compose build
   docker compose up -d
   docker compose logs -f app
   ```
   Database migrations are applied automatically on container start.

3. Initial setup (first time only) — create admin user and default tags:
   ```bash
   docker compose exec app node_modules/.bin/tsx prisma/seed.ts
   # Default: admin@example.com / changeme
   # Custom: SEED_EMAIL=you@example.com SEED_PASSWORD=yourpass docker compose exec app node_modules/.bin/tsx prisma/seed.ts
   # Default tags created: "Internet Facing" (asset), "Public Endpoint" (package)
   ```

Open `http://localhost:3000` and log in.

**Useful commands:**
```bash
docker compose down       # Stop
docker compose down -v    # Stop and delete database volume (full reset)
docker compose logs -f app  # View logs
```

### Option B: Manual (native PostgreSQL)

**Prerequisites:** Node.js 20+, pnpm, PostgreSQL (with `heretix_management` database created), [heretix-api](../heretix-api) running (default: `http://localhost:5000`)

1. **Install dependencies**
   ```bash
   pnpm install
   ```

2. **Configure environment variables** — create `.env.local`:
   ```env
   DATABASE_URL="postgresql://postgres:password@localhost:5432/heretix_management?schema=public"
   AUTH_SECRET="your-secret-key"
   AUTH_URL="http://localhost:3000"
   # heretix-api URL and token can also be configured via the Settings page in the UI
   HERETIX_API_URL="http://localhost:5000"
   HERETIX_API_KEY="your-api-token"
   # Scheduled job times (cron syntax, UTC — minute hour day month weekday):
   #   CRON_REFRESH — re-fetches CVSS/severity/EPSS/KEV for existing Alerts (default 12:00)
   #   CRON_SCAN    — scans all assets for new vulnerabilities, runs after refresh (default 13:00)
   CRON_REFRESH="0 12 * * *"
   CRON_SCAN="0 13 * * *"
   ```

3. **Generate Prisma client**
   ```bash
   pnpm exec prisma generate
   ```

4. **Apply DB schema**
   ```bash
   pnpm exec prisma db push
   ```

5. **Create admin user and default tags** (first time only)
   ```bash
   pnpm seed
   # Default: admin@example.com / changeme
   # Custom: SEED_EMAIL=you@example.com SEED_PASSWORD=yourpass pnpm seed
   # Default tags created: "Internet Facing" (asset), "Public Endpoint" (package)
   ```

6. **Start the server**
   ```bash
   pnpm dev
   ```
   The server starts at `http://localhost:3000`.

## Upgrading (On-Premises)

When pulling updates that include schema changes or default tag updates:

```bash
# 1. Pull latest code
git pull

# 2. Install dependencies (if changed)
pnpm install

# 3. Regenerate Prisma client
pnpm exec prisma generate

# 4. Apply schema changes to DB
pnpm exec prisma db push

# 5. Update default tags (creates new defaults, removes isDefault from old ones)
pnpm seed

# 6. Restart dev server
pnpm dev
```

> **Note:** Docker deployments handle steps 3–5 automatically on container start via `prisma migrate deploy` and do not require re-running the seed script.

## Usage

### 1. Registering Assets

**Servers & VMs (via heretix-cli):**
1. Go to **Assets** → **Import inventory.json** in the sidebar
2. Upload the `inventory.json` generated by heretix-cli
3. Packages are imported incrementally (only additions, updates, and removals are processed on re-import)
4. Manually added packages are preserved across re-imports

> **Matching key:** An upload is matched to an existing asset by **hostname** (`inventory.json`'s `hostname` field, or `metadata.component.name` for a CycloneDX BOM) — not by asset name. Re-uploading with the same hostname updates that asset; a different hostname creates a new one.
>
> **Docker images:** heretix-cli sets `hostname` to the `--name` value if given, otherwise the image reference itself (e.g. `myapp:1.0`). Since the tag is part of that string, rescanning `myapp:1.0` → `myapp:2.0` without `--name` creates a *new* asset per tag. To track one image across tag/version bumps as a single asset (matching the firmware-update pattern below), always pass a fixed `--name` (e.g. `--name myapp`) regardless of tag.
>
> **Per-package diff on re-import** (packages matched by `name` + `ecosystem`, manually added packages excluded from the comparison):
> | | Behavior |
> |---|---|
> | Newly added package | Created; recorded in Package Change History as `added` |
> | Version changed | Existing package row updated; recorded as `updated` (old → new version). **Open/In Progress Alerts for the old version are auto-resolved** (see Auto-resolve Alerts in Features) |
> | No longer present | Package row deleted; recorded as `removed`. **Its existing Alerts are *not* auto-resolved** — they stay open even after the package is gone, so review them manually |

**Network Devices & Firewalls (manual registration):**
1. Go to **Assets** → **Add Manually** in the sidebar
2. Enter Name, Hostname, and Type, then click **Create Asset**
3. On the asset detail page, click **Add Package** → **Advisory tab**
   - Select Vendor (Fortinet / Palo Alto Networks / Cisco / Sophos / SonicWall / Broadcom/VMware / Oracle / Splunk / Apache HTTP Server / Nginx / Apache Tomcat / Zabbix) and product from the dropdown, then enter the version
4. Click **Run Scan** to detect vulnerabilities (uses heretix-api Vendor Advisory data)
5. After a firmware update, click **Edit** on the package to change the version and re-scan

### 2. Adding Manual Packages

1. Click **Add Package** in the top-right of the package table on the asset detail page
2. Select a tab and fill in the details:
   - **General** — Package name, version, and ecosystem (Linux, npm, PyPI, Go, Packagist, etc.)
   - **Advisory** — Select Vendor (Fortinet / Palo Alto Networks / Cisco / Sophos / SonicWall / Broadcom/VMware / Oracle / Splunk / Apache HTTP Server / Nginx / Apache Tomcat / Zabbix) and product from the dropdown, enter version (for network devices and firewalls)
   - **CPE** — Enter a CPE 2.3 string directly
3. Packages with a `manual` badge can be edited or deleted
4. Click the badge in the Alerts column to navigate to the alert list for that package

### 3. Vulnerability Scanning

1. Open the asset detail page
2. Click **Run Scan**
3. heretix-api checks all packages (including manually added ones) and generates alerts

### 4. Managing Alerts

1. Check the alert list under **Alerts** in the sidebar
2. Use **filters** (Asset / Status / Severity / Tags / Dependency / Due) to narrow down results (multiple values supported)
3. Select multiple alerts via checkboxes → bulk status update available
4. Click an alert row to open the detail panel:
   - **Overview** tab — Basic info (including **Fixed in** version when available), status change, memo, auto-resolution reason
   - **NVD** tab — CVSS detailed scores, CWE, CISA KEV info, reference links
   - **OSV** tab — Description, affected versions, reference links
   - **Advisory** tab — Vendor advisory ID, severity, affected products and versions (shown only when advisory data exists)
5. Track progress by changing status: `Open` → `In Progress` → `Resolved` / `Ignored`
   - When setting **Ignored**, pick a **Reason** (Not affected / False positive / Accepted risk). Choosing *Not affected* also requires a **VEX Justification** (e.g., `code_not_reachable`). The status is not saved until the reason is recorded
   - If the same finding was already judged on another asset, that judgment appears above the status field. Review whether it still holds on this asset, then click **Apply this judgment** to reuse it
6. Click **Refresh Metadata** to sync the latest data from heretix-api
7. Click **Export VEX** to download a CycloneDX VEX JSON (ignored alerts with justification → `not_affected`) — feed into `trivy --vex vex.json` to suppress false positives
8. Click **Import VEX** to ingest a vendor-published or externally generated CycloneDX VEX and auto-apply its decisions to matching alerts

> **Run Scan vs. Refresh Metadata:**
> | | Run Scan | Refresh Metadata |
> |---|---|---|
> | Target | Packages of a specific asset | All Alerts (open / in_progress) |
> | Action | Batch search packages via heretix-api | Re-fetch each Alert by externalId |
> | Result | **Creates** new Alerts | **Updates** score, severity, etc. of existing Alerts |
> | Use case | Detecting new vulnerabilities | Keeping up with CVE score revisions, KEV additions, etc. |

### 5. Vulnerability Search

Use **Search** in the sidebar to search by package name / version / ecosystem, CVE/OSV ID, CPE 2.3 string, or vendor advisory (**Advisory** mode: select Vendor and product to search Fortinet, Palo Alto Networks, Cisco, Sophos, SonicWall, Broadcom/VMware, Oracle, Splunk, Apache HTTP Server, Nginx, Apache Tomcat, and Zabbix advisories).

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
│   │   ├── tags/               # Tag management (list, create, edit, delete)
│   │   └── settings/           # Settings (API / Notifications / SLA / About tabs)
│   ├── api/                    # API routes
│   │   ├── assets/
│   │   ├── alerts/
│   │   ├── users/
│   │   ├── search/
│   │   ├── tags/
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
│   ├── sla.ts                  # SLA due-date calculation and status helpers
│   ├── advisory-products.ts    # Vendor/product lists for the Advisory tab dropdowns
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
| POST | `/api/assets` | Create/update asset (inventory.json or CycloneDX BOM incremental import) |
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
| GET | `/api/alerts/events` | List all alert events across all alerts |
| GET | `/api/alerts/[id]/dependents` | Dependency paths to the vulnerable package (npm/pnpm) |
| GET | `/api/alerts/[id]/vex-suggestions` | Prior VEX judgments for the same finding on other assets |
| GET | `/api/assets/[id]/dependency-graph` | Dependency graph nodes and edges for visualization |
| GET | `/api/vex` | Export CycloneDX VEX JSON (`?assetId=`, `?download=true`) |
| POST | `/api/vex/import` | Import CycloneDX VEX and apply to matching alerts |
| GET | `/api/search` | Vulnerability search (heretix-api proxy) |
| GET | `/api/tags` | List tags |
| POST | `/api/tags` | Create tag |
| GET | `/api/tags/[id]` | Tag detail (with tagged assets/packages) |
| PATCH | `/api/tags/[id]` | Update tag |
| DELETE | `/api/tags/[id]` | Delete tag |
| POST | `/api/tags/[id]/assets` | Assign tag to an asset |
| POST | `/api/tags/[id]/packages` | Assign tag to a package |
| GET | `/api/settings` | Get settings |
| PATCH | `/api/settings` | Update settings |
| POST | `/api/settings/test` | Test heretix-api connectivity |
| POST | `/api/settings/slack-test` | Send a test Slack notification |
| GET | `/api/settings/sla` | Get SLA configuration |
| POST | `/api/settings/sla` | Update SLA configuration |
| GET | `/api/users` | List users (admin only) |
| POST | `/api/users` | Create user (admin only) |
| PATCH | `/api/users/[id]` | Update user (admin only) |
| DELETE | `/api/users/[id]` | Delete user (admin only) |

## License

Apache License 2.0 — see [LICENSE](LICENSE) for details.
