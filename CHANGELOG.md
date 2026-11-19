# CHANGELOG

Versions are tracked separately for each userscript. Update checks use the `@version` in the userscript header.

## 2026-11-19

### royal-mail-csv — 1.1.2

- Identify TCGPowerTools as the CSV export source in both README languages, the userscript description, package metadata, and the interface subtitle.
- Synchronize the userscript, package, and documented versions at 1.1.2 so existing installations can receive the wording correction through automatic updates.
- Preserve CSV processing rules, Cardmarket order-reference terminology, script identity, and update URLs.

### tcgpowertools-tracking — 1.1.2

- Added the verified P9 Order Tools in its own script directory, with an English menu, PDF upload preview, batch tracking saves, and automatic refresh settings for native order actions.
- Support both the original combined reference and the split reference/SKU format, including the `20x PID (quantity)` prefix.
- Preserve the script name and namespace, and point the homepage and update URLs to this repository's `main` branch. Local copies without an update source need a one-time installation through the new link.
- Added independent English and Chinese guides, 27 unit checks using fictional data, and two PDF integration checks that use private local files.
- Kept actual shipping labels, order records, screenshots, and account-specific test PDF generators out of the repository.

### tcgpowertools-block-redirect — 1.0.2

- Added the script from `tjx0726/tcgpowertools-block-redirect` in its own script folder.
- Point the homepage, `@updateURL`, and `@downloadURL` to the new location in `P9_Tampermonkey`.
- Increased the version from 1.0.1 to 1.0.2, preserving the name, namespace, execution scope, and redirect-blocking logic.
- Retained the identical 1.0.2 migration script at the old repository's original path so existing installations switch to the new repository after updating.
- Documented installation, migration requirements, and retention of the old URL. Manually installed copies without an update source need a one-time installation of the new version.

### royal-mail-csv — 1.1.1

- First published in the public `tjx0726/P9_Tampermonkey` repository, based on the completed local version 1.1.0.
- Added `@updateURL`, `@downloadURL`, and a script homepage link pointing to this repository's `main` branch.
- Preserve the existing script name and namespace to support updates to existing installations.
- Preserve the 1.1.0 processing logic: use the Cardmarket `idOrder` as the order reference and `PID (articles)` as the SKU, retaining the existing filtering, address cleanup, and shipping service mappings.
- Included the existing 41 regression tests and a fictional CSV fixture.
- Added a repository overview, installation links, automatic update instructions, and independent script documentation.
