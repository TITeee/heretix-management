# Architecture

Next.js 16 (App Router) with React 19, Prisma 7 on PostgreSQL, Auth.js v5, shadcn/ui, and Tailwind v4.

## Layout

```
heretix-management/
├── app/
│   ├── (console)/          # Signed-in screens, sharing the sidebar/topbar layout
│   │   ├── page.tsx        # Dashboard (Overview / Tags tabs)
│   │   ├── assets/         # Asset list, detail, SBOM / CSV import, manual registration
│   │   ├── alerts/         # Alert list and Activity
│   │   ├── tags/           # Tag list and detail
│   │   ├── search/         # Vulnerability search
│   │   ├── settings/       # Settings tabs
│   │   ├── users/          # User management (admin)
│   │   └── audit/          # Audit log (admin)
│   ├── api/                # Route handlers, one folder per resource (see api.md)
│   └── login/
├── components/
│   ├── ui/                 # shadcn/ui primitives
│   ├── data-table/         # Shared table and faceted filters
│   ├── alerts/             # Alert detail panel and its tabs, severity badges
│   ├── dashboard/          # Dashboard cards and charts
│   ├── assets/, tags/, layout/
├── lib/                    # Business logic shared by routes and the scheduler
├── prisma/                 # schema.prisma, migrations, seed
├── instrumentation.ts      # Starts the scheduler when the server boots
└── proxy.ts                # Auth guard (Next 16's renamed middleware)
```

## Request flow

`proxy.ts` redirects any request without a session to `/login`, `/api/*` included. The only exception is a `Bearer` request to the two token routes (`POST /api/assets`, `POST /api/assets/[id]/scan`), which authenticate the token themselves (`lib/api-auth.ts`).

Route handlers are thin: they check the session, parse the request, and call into `lib/`. Each is wrapped in `withApiErrorHandling` (`lib/api-handler.ts`), which turns Prisma's "not found" and "unique constraint" errors into `404` / `409` and anything else into a JSON `500`.

## Where the logic lives

| Module | Role |
|---|---|
| `lib/cyclonedx.ts`, `lib/purl.ts` | SBOM import: components to packages, PURL to ecosystem, OS-managed detection |
| `lib/package-diff.ts`, `lib/alerts.ts` | What a re-import adds, updates, or removes; carrying alerts to a package's new version |
| `lib/scan.ts` | A scan: batch search, then create, update, rename, resolve, and reopen alerts |
| `lib/refresh.ts`, `lib/alert-metadata.ts` | Metadata refresh, and the diff (and timeline events) when an alert's data changes |
| `lib/heretix-api.ts` | The only client of heretix-api. URL and key come from Settings first, then the environment |
| `lib/severity.ts` | `getAlertSeverityTier`, the one rule for an alert's severity tier, and the counts and filters built on it |
| `lib/sla.ts` | Due dates from the tier and KEV; SLA status |
| `lib/vex.ts` | CycloneDX VEX export and import mapping |
| `lib/distro-priority.ts`, `lib/fix-status.ts` | Display and sort order for the distro rating and fix status |
| `lib/slack.ts`, `lib/ai.ts` | Slack notifications; the AI Insight chat |
| `lib/scheduler.ts` | The two daily jobs (refresh, scan); assumes a single server process |
| `lib/url-guard.ts` | SSRF guard for user-supplied outbound URLs (Slack, heretix-api, Anthropic) |
| `lib/api-token.ts`, `lib/api-auth.ts`, `lib/audit.ts` | Access tokens, token authentication, the audit log |

## Data model

`prisma/schema.prisma` has comments on the fields whose meaning isn't obvious. The main identities:

- **Asset**: unique by `hostname`, which is how an import finds the asset to update.
- **Package**: unique by asset + name + version + ecosystem. `scope` / `category` mark excluded packages (dev-only, kernel, build, os-managed).
- **Alert**: unique by asset + package name + package version + ecosystem + vulnerability ID. `sourcePackage` only groups sibling rows in the list. `distroPriority` and `fixStatus` are set by scans only.
- **AlertEvent**: an alert's timeline; changes are recorded as events rather than overwritten.

## Tests

```bash
pnpm test                # unit tests (lib/**/*.test.ts, app/**/*.test.ts)
pnpm test:integration    # needs TEST_DATABASE_URL: a disposable PostgreSQL database
```

Integration tests share one database and reset it before each test, so they run one file at a time.
