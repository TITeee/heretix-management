# Alerts

An alert is one vulnerability (CVE, GHSA, vendor advisory, or malicious-package `MAL-*` ID) found in one package version on one asset.

## Scanning

**Run Scan** on an asset page (or `POST /api/assets/[id]/scan`, or the daily scheduled scan) sends the asset's packages to heretix-api and reconciles the answer with the asset's alerts:

- A new finding becomes an **open** alert, with an SLA due date.
- A finding that is already an alert updates its metadata: CVSS, severity, EPSS, KEV, fixed version, the distro's rating and fix status.
- A finding that heretix-api now reports under a new ID (e.g. a CVE assigned to a GHSA) keeps its alert, renamed.
- An open alert that heretix-api no longer reports, for a package still in the inventory, is **resolved** automatically ("Auto-resolved: no longer detected by scan"). If a later scan reports it again, it is reopened.
- An alert accepted from the Remediation tab's *No fix available* group is **reopened** once heretix-api reports a fixed version for it ("Fix now available"). See [Remediation](#remediation).
- Excluded packages (dev-only, kernel/build, OS-managed; see [importing-assets.md](importing-assets.md#reference-how-packages-are-classified)) are not sent, and their earlier alerts are resolved the same way.

**Refresh Metadata** on the Alerts page (and the daily refresh job) re-fetches CVSS, severity, EPSS, and KEV for every open and in-progress alert, without scanning:

| | Run Scan | Refresh Metadata |
|---|---|---|
| Scope | One asset's packages | Every open / in-progress alert |
| Asks heretix-api | Which vulnerabilities each package version has | The current data for each alert's ID |
| Creates or resolves alerts | Yes | No |
| Updates | CVSS, severity, EPSS, KEV, fixed version, distro rating, fix status | CVSS, severity, EPSS, KEV |

The schedule (refresh 12:00 UTC, then scan 13:00 UTC by default) is in [operations.md](operations.md#scheduled-jobs).

## Lifecycle

`Open` → `In Progress` → `Resolved` or `Ignored`. Change it in the detail panel, or for many alerts at once from the Alerts list's checkboxes.

Ignoring an alert requires a reason, because `ignored` covers more than VEX's `not_affected`:

| Reason | Meaning | In the VEX export |
|---|---|---|
| **Not affected** | Vulnerable code is present but cannot be exploited here. Also needs a VEX justification (`code_not_reachable`, `code_not_present`, ...) | `state: not_affected` + justification |
| **False positive** | The finding itself is wrong, e.g. the wrong package or version matched | `state: false_positive` |
| **Accepted risk** | Exploitable, but the team decided not to act | Not exported; kept internally |

Accepted risk is withheld from the export on purpose: its faithful encoding (`exploitable` + `will_not_fix`) gives a consumer nothing to act on while stopping the finding from being suppressed in their own scans.

Status changes, memos (with author), CVSS and severity changes, KEV additions, ID changes, and VEX justifications are recorded on the alert's **Timeline**. **Alerts → Activity** lists these events across all alerts.

## Severity and SLA

Every count, chart, badge colour, filter, Slack rule, and due date uses the same **severity tier** (Critical / High / Medium / Low / N/A):

- The tier comes from the alert's **severity**, which is the rating on its CVSS score's own version. A CVSS v2 10.0 is High, because v2 has no Critical.
- Only when an alert has no severity is the tier taken from the score (9.0+, 7.0+, 4.0+, above 0).
- The score is shown as the number on the badge, coloured by the tier, with its CVSS version beside it in the detail panel.

**SLA due dates** (Settings → SLA) come from the tier: Critical and High in hours, Medium and Low in days, and a fixed override for CISA KEV alerts. An alert with no tier (unrated, or CVSS 0.0) has no due date and shows as *Unscored*. A due date is recalculated when the tier or KEV status changes. After changing the SLA settings, **Recalculate** applies them to existing open alerts. SLA tracking can be turned off, which hides the Due column and filter.

Shown next to the tier, never mixed into it:

| | What it is | Source |
|---|---|---|
| **EPSS** | Probability of exploitation in the next 30 days, with its percentile | FIRST, via heretix-api |
| **KEV** | Listed in CISA's Known Exploited Vulnerabilities | CISA, via heretix-api |
| **Distro Rating** | The distro's own rating of the CVE for this package: Ubuntu priority (`negligible`..`critical`), Debian urgency (`unimportant`..`high`), Red Hat impact (`low`..`critical`). Each distro rates on its own scale | heretix-api, per package match |
| **Fix Status** | Why there is no fix: *Affected*, *Fix deferred*, *Will not fix*, *Out of support*, *Under investigation*. Red Hat only today | heretix-api, per package match |

Distro Rating and Fix Status are set by a scan, not by Refresh Metadata, since they belong to a package match rather than to the CVE. Both have a column (hidden by default) and a filter on the Alerts list. A Red Hat alert can show a Fixed in version and a fix status together when Red Hat's OVAL and VEX data disagree; both are shown as published.

## The Alerts list

- **Filters**: asset, status, severity, distro rating, fix status, risk (KEV / malware), ecosystem, source, tags, dependency (direct / indirect), inventory (package still present or not), and SLA due. Each takes several values.
- **Grouping**: one CVE reported against several binary packages built from the same source package (e.g. binutils) is one row that lists every package.
- **Export**: CSV or JSON of the filtered alerts.
- Badges elsewhere (asset pages, tags) link here with the matching filter, and list exactly the alerts they counted.

## Remediation

Every asset page (container image, host, or appliance) opens on a **Remediation** tab that groups its open and in-progress alerts by the change that fixes them, instead of listing one row per finding. Every alert lands in exactly one group; a group is only a view, and every decision is applied to the alerts inside it.

**Changes to make** (findings with a fixed version):

| Change | Groups |
|---|---|
| Update an OS package | OS findings by source package (e.g. `openssh` and `openssh-clients` together) |
| Upgrade a direct dependency | A vulnerable package that the project depends on directly |
| Upgrade through direct dependencies | A vulnerable transitive package, under the direct dependencies that pull it in (from the SBOM's dependency graph). The version to raise them to is not worked out |
| Rebuild Go binaries | Findings in Go's standard library (`stdlib`), fixed by building with a newer Go |
| Update a product | A product registered by hand or by CSV import (appliance firmware, software outside a package manager) |
| Update a package | A language package whose place in the dependency graph is unknown |

Changes are ordered with KEV first, then by the worst severity, then by the number of findings. Each shows the fixed versions and lists its alerts; click one to open the detail panel.

**No fix available** (findings with no fixed version) are grouped by the distro's fix status (Under investigation, Affected, Fix deferred, Will not fix, Out of support, or none given), with the distro ratings counted. No upgrade resolves these, so each group can be left open to wait for a fix, or **accepted** at once: its alerts become Ignored with the reason Accepted risk (not exported to VEX) and an optional memo on each timeline, and each one reopens automatically when a scan finds a fixed version for it. Changing such an alert's status or reason by hand afterward drops the automatic reopening.

**Accepted, but a fix is now available** lists, grouped the same way as the changes, the alerts ignored as Accepted risk by hand that a later scan found a fixed version for. They stay ignored, since a hand-made acceptance may rest on more than the missing fix; open one to reconsider it.

## The detail panel

Click an alert to open it:

| Tab | Contents |
|---|---|
| **Overview** | CVSS (with version), distro rating, EPSS, KEV, sources, summary; the package with its fixed version and fix status; the asset; the tags the alert falls under (the asset's tags and the package name's tags); status, ignore reason, memo; prior judgments of the same finding on other assets |
| **NVD** | CVSS metrics per version (each coloured by its own rating), CWE, references |
| **OSV** | Each OSV record: severity, the distro's rating, affected ranges, references |
| **Advisory** | Vendor advisories with their affected products. A row with no fix shows *All versions (no fix yet)* and the fix status. Shown when advisory data exists |
| **CNA** | The CVE Record's own data. Shown when available |
| **Dependents** *(Beta)* | The packages that depend on the vulnerable one, as a graph. npm / pnpm lockfile data is fully supported, Go and PyPI partially |
| **Timeline** | The alert's events |
| **AI Insight** | Optional chat about the alert (below) |

The asset page also has a **Dependency Graph** tab *(Beta)*: vulnerable packages and their dependents, 1 to 8 hops up.

## VEX *(Beta)*

- **Export VEX** (`GET /api/vex`): ignored alerts as CycloneDX 1.6 VEX JSON, usable with `trivy image myapp --vex vex.json`. Accepted risk is not exported (see the reason table above).
- **Import VEX** (`POST /api/vex/import`): applies a CycloneDX VEX document's decisions to matching alerts and records them on the Timeline. Versions are read from the PURL (`pkg:npm/lodash@4.17.20`) or `affects[].versions[]`. Version ranges (`vers:npm/>=4.0.0|<4.17.21`) are reported back rather than evaluated, since misjudging one would silently ignore an exploitable finding.
- **Prior judgments**: when the same finding (vulnerability, package, version, ecosystem) was already judged on another asset, the panel shows it with **Apply this judgment**. It is never applied automatically. Only `code_not_present` and `protected_by_compiler` describe the build itself; the other justifications describe the deployment, so the panel warns when reuse needs checking and flags assets whose tags differ.

## Notifications and AI Insight

- **Slack** (Settings → Notifications): a webhook message on new detections, severity changes, or new KEV alerts, filtered by a minimum severity tier and by asset tags (KEV additions ignore the severity filter). Use the test button to check the webhook.
- **AI Insight** (Settings → AI): an optional chat per alert, powered by Anthropic's API. It is given the alert's CVSS, EPSS, and KEV data and how the same vulnerability was handled on other assets. Off by default; set the API key and model, and test the connection, in Settings.

## Vulnerability Search

**Search** queries heretix-api directly, without an asset: by package name, version, and ecosystem; by CVE / OSV ID; by CPE 2.3 string; or by vendor and product in Advisory mode.
