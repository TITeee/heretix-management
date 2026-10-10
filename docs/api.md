# API reference

The console's own routes under `/api`. All of them need a signed-in session, except the two that also accept an access token (marked below). heretix-api's search API is a separate service: see [heretix-api's docs](https://github.com/TITeee/heretix-api/blob/main/docs/api.md).

- **Session**: the console's sign-in cookie. Requests without one are redirected to `/login`. Endpoints marked *admin* also need the Admin role.
- **Access token**: `Authorization: Bearer <token>`, created in **Settings → Access Tokens** with the `import` and/or `scan` scope ([importing-assets.md](importing-assets.md#uploading-from-ci)).
- **Errors** are JSON `{ "error": "..." }`. A missing record is `404`, a unique-constraint conflict (e.g. a hostname already in use) `409`.

## Assets

| Method | Path | Description |
|---|---|---|
| GET | `/api/assets` | List assets (`?search=` on name/hostname, `?limit=`) |
| POST | `/api/assets` | Create or update an asset from a CycloneDX SBOM (incremental import; the legacy `inventory.json` is deprecated and ends in 0.4.0). `name` sets the display name, which a re-import without one keeps; `hostname` (body, or `?hostname=` for a raw SBOM body) overrides the file's hostname; `dryRun: true` previews the match; `?scan=true` scans after importing. **Token**: `import` scope (plus `scan` for `?scan=true`) |
| POST | `/api/assets/import-csv` | Register assets and Advisory packages from parsed CSV rows; `commit: false` previews |
| GET | `/api/assets/[id]` | Asset detail |
| PATCH | `/api/assets/[id]` | Update `name`, `hostname` (unique), and `assetType` (manually registered assets). OS fields come from imports and are not editable. Audited |
| DELETE | `/api/assets/[id]` | Delete an asset |
| POST | `/api/assets/[id]/scan` | Scan the asset. Returns `{ newAlerts, resolvedAlerts, heldAlerts }`; `heldAlerts` counts alerts the scan kept open because too many would have been resolved at once. **Token**: `scan` scope |
| POST | `/api/assets/[id]/tags` | Add and remove the asset's tags: `{ "add": [tagIds], "remove": [tagIds] }` (either may be omitted). `add` takes asset tags only |
| POST | `/api/assets/[id]/packages` | Add a manual package |
| PATCH | `/api/assets/[id]/packages/[pkgId]` | Edit a manual package |
| DELETE | `/api/assets/[id]/packages/[pkgId]` | Delete a manual package |
| GET | `/api/assets/[id]/dependency-graph` | Nodes and edges for the dependency graph |
| GET | `/api/assets/[id]/remediation` | The asset's open and in-progress alerts grouped into changes to make and no-fix groups (`plan`), the alerts ignored as accepted risk that now have a fixed version (`acceptedWithFix`), and the alerts themselves |
| POST | `/api/assets/[id]/remediation/accept` | Accept no-fix alerts: `{ "alertIds": [...], "memo": "..." }` sets each open/in-progress alert of this asset with no fixed version to Ignored (Accepted risk) and reopens it once a fix exists; other ids are skipped. Returns `{ accepted, skipped }`. Audited |

## Alerts

| Method | Path | Description |
|---|---|---|
| GET | `/api/alerts` | List alerts |
| GET | `/api/alerts/[id]` | The alert |
| PATCH | `/api/alerts/[id]` | Update status, ignore reason, VEX justification, or memo |
| POST | `/api/alerts/refresh` | Refresh metadata (CVSS, severity, EPSS, KEV) of every open and in-progress alert |
| GET | `/api/alerts/events` | Events across all alerts (the Activity page) |
| GET | `/api/alerts/[id]/events` | One alert's events (its Timeline) |
| GET | `/api/alerts/[id]/tags` | The tags the alert falls under: `assetTags` on its asset, `packageTags` on its package name |
| GET | `/api/alerts/[id]/dependents` | Dependency paths to the vulnerable package (npm / pnpm) |
| GET | `/api/alerts/[id]/vex-suggestions` | Judgments of the same finding on other assets |
| GET | `/api/alerts/[id]/chat` | AI Insight chat history |
| POST | `/api/alerts/[id]/chat` | Send a message to AI Insight |

## VEX

| Method | Path | Description |
|---|---|---|
| GET | `/api/vex` | Export CycloneDX VEX (`?assetId=`, `?download=true`) |
| POST | `/api/vex/import` | Import a CycloneDX VEX document and apply it to matching alerts |

## Tags

| Method | Path | Description |
|---|---|---|
| GET | `/api/tags` | List tags |
| POST | `/api/tags` | Create a tag (`name`, `type`: `asset` or `package`, `color`, `description`) |
| GET | `/api/tags/[id]` | Tag detail: tagged assets or packages, with open alerts per severity tier |
| PATCH | `/api/tags/[id]` | Update a tag (default tags can't be changed) |
| DELETE | `/api/tags/[id]` | Delete a tag (default tags can't be deleted) |
| POST | `/api/tags/[id]/assets` | `{ "action": "add" \| "remove", "assetIds": [...] }` (a single `assetId` also works). Adding an already-tagged asset is a no-op |
| POST | `/api/tags/[id]/packages` | `{ "action": "add" \| "remove", "packageNames": [...] }` (a single `packageName` also works). Adding an already-tagged package is a no-op |

## Search

| Method | Path | Description |
|---|---|---|
| GET | `/api/search` | Vulnerability search, proxied to heretix-api |
| GET | `/api/search/suggest` | Package and product name suggestions for Search, with the vendors, ecosystems and data sets each name is found under |
| GET | `/api/catalog` | heretix-api's product catalog for the Add Package picker (`?q=`). `available: false` when heretix-api has none |
| GET | `/api/packages` | Package names in the inventory (`?search=`, `?limit=`) |

## Settings

| Method | Path | Description |
|---|---|---|
| GET | `/api/settings` | Get settings |
| PATCH | `/api/settings` | Update settings |
| POST | `/api/settings/test` | Test the heretix-api connection |
| POST | `/api/settings/slack-test` | Send a test Slack message |
| POST | `/api/settings/ai-test` | Test the Anthropic connection |
| GET | `/api/settings/sla` | Get the SLA settings |
| POST | `/api/settings/sla` | Update the SLA settings |
| POST | `/api/settings/sla/recalculate` | Recalculate due dates of open alerts (*admin*) |
| GET | `/api/settings/api-tokens` | List access tokens (*admin*) |
| POST | `/api/settings/api-tokens` | Create one: `name`, `scopes`, `expiresInDays` (1–365). The token is returned once (*admin*) |
| POST | `/api/settings/api-tokens/[id]/revoke` | Revoke a token (*admin*) |
| DELETE | `/api/settings/api-tokens/[id]` | Delete a revoked or expired token; an active one returns `409` (*admin*) |

## Users

| Method | Path | Description |
|---|---|---|
| GET | `/api/users` | List users (*admin*) |
| POST | `/api/users` | Create a user (*admin*) |
| PATCH | `/api/users/[id]` | Update a user (*admin*) |
| DELETE | `/api/users/[id]` | Delete a user (*admin*) |
