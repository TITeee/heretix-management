# Importing assets

An asset is one host, container image, project, or appliance, and its inventory is the packages installed on it. There are four ways to fill it:

| Source | Use for | How |
|---|---|---|
| heretix-cli SBOM | Servers, VMs, container images | **Assets → Import SBOM**, or an access token from CI |
| Trivy / Syft / cdxgen SBOM | Container images and projects you already scan with these | Same |
| Manual registration | Network appliances, software outside a package manager | **Assets → Add Manually**, then **Add Package** |
| CSV | Many appliances at once | **Assets → Import CSV** |

## SBOM import

Open **Assets → Import SBOM** and upload a CycloneDX JSON SBOM. Re-importing updates the asset incrementally: only added, changed, and removed packages are processed.

> **Deprecated:** the legacy heretix-cli `inventory.json` (heretix-cli no longer writes it) is still accepted, from the console and from the API, but support ends in heretix-management 0.4.0. Update heretix-cli and collect a CycloneDX SBOM instead.

```bash
heretix-cli collect --image myapp:1.0 --name myapp --output sbom.json   # container image
heretix-cli collect --output sbom.json                                  # this host
trivy image --format cyclonedx --output sbom.json myapp:1.0
trivy fs    --format cyclonedx --output sbom.json ./my-project
syft myapp:1.0 -o cyclonedx-json=sbom.json
```

Syft on Windows cannot scan Linux container images correctly; run it on Linux or macOS, or in its Docker image.

To update one particular asset, open it and click **Update from SBOM**. The asset's hostname is then used whatever the file says. Detection never uses vulnerabilities embedded in an SBOM (Trivy's `--scanners vuln`); it always goes through heretix-api.

Some imported packages are kept in the inventory but never scanned, such as development-only dependencies, kernel headers, and libraries the OS package manager installed. Each is labeled with the reason; see [how packages are classified](#reference-how-packages-are-classified).

### Which asset an import updates

An import is matched to an existing asset by **hostname**, not by its display name. The hostname comes from `metadata.component.name` (CycloneDX) or `hostname` (`inventory.json`):

- The **Hostname** field on the import page is pre-filled from the file and can be changed. Use it to keep updating one asset when a scanner puts a changing value there. Entering a hostname no asset has asks for confirmation, to catch typos.
- An existing asset keeps its display name unless you enter a new one.

Scanners fill the hostname differently for container images:

| Tool | Hostname for `myapp:1.0` | To track one image across tags |
|---|---|---|
| heretix-cli | `--name` if given, otherwise `myapp:1.0` | Always pass a fixed `--name myapp` |
| Trivy | `myapp:1.0` (no option to change it) | Set the **Hostname** field (or `?hostname=` from CI) to `myapp` |
| Syft | `myapp` (the tag goes in `metadata.component.version`) | Nothing to do; give each `--source-name` to keep tags apart instead |

For a directory scan, Trivy and Syft both use the scanned path.

### What a re-import changes

Packages are matched by name and ecosystem. Packages added by hand are never compared, so a re-import keeps them.

| Change | Effect |
|---|---|
| New package | Added, and recorded in the asset's Package Change History |
| Version changed | The package moves to the new version. Its open alerts move with it, keeping their history; the next scan resolves the ones the new version no longer has |
| No longer present | The package is removed. Its open alerts are **not** resolved, so review them by hand |

## Appliances and manual packages

1. **Assets → Add Manually**: enter a name, hostname, and type.
2. On the asset page, **Add Package**:
   - **Advisory**: pick a vendor and product (Fortinet, Palo Alto Networks, Cisco, Sophos, SonicWall, Broadcom/VMware, Check Point, Ivanti, Oracle, Splunk, Apache HTTP Server, nginx, Apache Tomcat, Zabbix) and enter the version. Matched against vendor advisories.
   - **General**: a package name, version, and ecosystem, for software installed outside a package manager.
   - **CPE**: a CPE 2.3 string.
3. **Run Scan**. After a firmware update, **Edit** the package's version and scan again.

Packages added by hand carry a `manual` badge and can be edited or deleted.

## CSV import

**Assets → Import CSV** registers many appliances at once. Each row is one asset plus one Advisory package; repeat a hostname to give an asset several packages.

| Column | Required | Notes |
|---|---|---|
| `name` | | Defaults to the hostname |
| `hostname` | yes | |
| `asset_type` | | `host` (default) or `docker_image` |
| `vendor` | yes | A vendor from the Advisory list |
| `product` | yes | A product of that vendor |
| `version` | yes | |
| `tags` | | Existing asset tag names, separated by `;` |

Every row is validated first (vendor and product against the Advisory catalog, unknown tags, duplicate rows), and the preview shows what each row will do. Nothing is written until you confirm. An asset whose hostname already exists is skipped unless you choose to add packages to it. At most 500 rows per import.

A row with a new version of a product the asset already has adds a second package; it does not replace the old version. After a firmware update, edit the version on the asset page instead, or remove the old package.

## Uploading from CI

A CI job can upload an SBOM and scan it in one request, with an access token instead of a login.

1. **Settings → Access Tokens** (admin only): enter a name, scopes, and an expiry (30–365 days), then **Create Token**. The token is shown once; store it as a CI secret.
   - `import`: `POST /api/assets` (upload an SBOM)
   - `scan`: `POST /api/assets/[id]/scan`, and `?scan=true` on import

   A token works on those two endpoints only. It cannot sign in to the console or read alerts, users, or settings, and only its SHA-256 hash is stored. Revoke it from the same page; a revoked or expired token can then be deleted (its history stays in the audit log).

2. Post the SBOM as the request body:

   ```bash
   curl -fsS -X POST "https://heretix.example.com/api/assets?hostname=myapp&scan=true" \
     -H "Authorization: Bearer $HERETIX_TOKEN" \
     -H "Content-Type: application/json" \
     --data-binary @sbom.json
   ```

   - `hostname`: the asset to import into, overriding the file's own name. Set a fixed value for a Trivy SBOM, whose name includes the tag.
   - `scan=true`: scan right after the import (needs both scopes). The response includes `scan: { newAlerts, resolvedAlerts }`. If the scan fails, the response is **502** with the import already saved, so the job fails and can simply be re-run.

   GitHub Actions:

   ```yaml
   - run: trivy image --format cyclonedx --output sbom.json myapp:${{ github.sha }}
   - run: |
       curl -fsS -X POST "${{ vars.HERETIX_URL }}/api/assets?hostname=myapp&scan=true" \
         -H "Authorization: Bearer ${{ secrets.HERETIX_TOKEN }}" \
         -H "Content-Type: application/json" --data-binary @sbom.json
   ```

## Reference: how packages are classified

Details of what the importer reads from an SBOM. You don't need them for everyday use.

**OS release.** The point release a scanner records is normalized to the ecosystem heretix-api matches on: `rocky-9.3` becomes `Rocky Linux:9`, `debian-12.15` becomes `Debian:12`, and `alpine-3.20.10` becomes `Alpine:v3.20`.

**Direct or indirect dependency.** Read from heretix-cli's `heretix:direct` property, or from a CycloneDX dependency graph rooted at the scanned project (lockfile scans, cdxgen). Where neither exists (OS packages from other scanners, installed-package scans without a lockfile, packages added by hand), the package is left unclassified rather than guessed.

**Excluded packages.** These stay in the inventory but are never scanned (`scope: excluded`), and the asset page shows why:

| Reason | Meaning |
|---|---|
| Dev-only | A development dependency that doesn't ship in a production build |
| Kernel / Build | Kernel headers and build tools present in an image but never run there (marked by heretix-cli) |
| OS-managed | A language library (PyPI, npm, RubyGems, Maven, Go binary) installed by an rpm, deb, or apk package. Matching it at its upstream version would ignore the fixes the distro backports, so its findings come from the OS package instead |

How OS-managed is decided:
- heretix-cli uses the package databases' own file lists.
- For other scanners, it is inferred on RHEL-family, Fedora, Debian, and Ubuntu images from the paths where the distro installs language packages, such as `/usr/lib*/python3*/site-packages`, `/usr/lib/python3/dist-packages`, `/usr/lib/node_modules`, `/usr/share/gems`, and `/usr/share/java`. Packages installed with pip, npm, or gem go under `/usr/local` and are not affected.
- It is not inferred on Alpine or for Go binaries, where the path doesn't show who installed the package.

**License.** Read from each CycloneDX component's `licenses` (the SPDX id, SPDX expression, or free-text name, whichever is given) or from `license` in `inventory.json`, and stored exactly as written, without normalizing to SPDX. Package managers that use SPDX (npm, PyPI, Composer) give identifiers such as `MIT` or `Apache-2.0 OR BSD-3-Clause`. rpm and dpkg often give their own wording, such as `GPLv2+ and MIT`, so one license can appear under several spellings across assets. The asset page's Packages tab shows a License column, and both it and the Assets list have a **License** filter. Licenses are shown for inventory purposes only; no license policy is checked. An asset imported before this field existed gets its licenses on the next re-import.
