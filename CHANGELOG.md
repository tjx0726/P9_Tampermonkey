# CHANGELOG

Versions are tracked separately for each userscript. Update checks use the `@version` in the userscript header.

## 2026-11-19

### TCG PowerTools - Stay on Legacy App — 1.2.3 migration (deprecated)

- Replace the old 1.0.x update endpoint with a complete P9 TCGPowerTools 1.2.3 migration copy, adopting the canonical name, namespace, and update/download URLs at the owner's request.
- Preserve the old path for installed scripts while routing subsequent updates to the maintained plugin. The original repository's existing 1.0.2 bridge remains available for older installations.
- Mark the standalone script deprecated and disable its installation links in both README languages; document extension-controlled confirmations, update settings, and existing-copy handling.
- Add regression checks for migration metadata, standalone full-plugin initialization, and duplicate-hook prevention in either load order.

### P9 TCGPowerTools — 1.2.3

- Remove the introductory helper text from the menu and Settings views.

### P9 TCGPowerTools — 1.2.2

- Remove the recurring 1.5-second page task. Navigation and native DOM updates now synchronize the stock cooldown control without polling or changing launcher visibility.
- Display the installed version in the menu to help identify outdated or duplicate installations.
- Add mounted-interface regressions for menus on both domains, reopening after a stock refresh, and cooldown synchronization during SPA navigation.

### P9 TCGPowerTools — 1.2.1

- Rename the canonical folder, userscript, package, test imports, and documented paths to `p9-tcgpowertools` / `p9-tcgpowertools.user.js`.
- Point installation links, homepage, update URL, and download URL to the new canonical path; synchronize both README languages and related guides.
- Retain a complete 1.2.1 migration copy at the former Raw URL so existing installations can move to the new update source without changing script identity or saved preferences.
- Preserve all stock, tracking, redirect, and domain behavior from 1.2.0.

### P9 TCGPowerTools — 1.2.0

- Rename the tracking tool to P9 TCGPowerTools at the owner's request, keeping its namespace and Raw update paths stable.
- Add an opt-in setting that unlocks the legacy native Refresh Stock control during its browser cooldown, plus a manual Force Refresh Stock menu action. Both use the native callback once and preserve the site's loading, local-edit confirmation, errors, and inventory updates.
- Merge Stay on Legacy App as a default-on preference registered at document-start.
- Match the new domain for the launcher and Settings only. Stock/tracking actions and native order hooks remain disabled there.
- Share preferences between legacy and new-domain tabs with Tampermonkey storage and live change listeners; migrate existing local preferences.
- Add regression coverage for cross-domain preferences, native disabled/aria-disabled controls, userscript isolation, inaccessible third-party exports, single-flight refresh, and standalone-blocker coexistence.

### tcgpowertools-block-redirect — 1.0.3

- Retain the old script and update URL for compatibility, but defer to P9 TCGPowerTools when the merged plugin is present so its setting can disable redirect protection.
- Direct new installations to the merged plugin; existing standalone installations still work independently.

### royal-mail-csv — 1.1.2

- Identify TCGPowerTools as the CSV export source in both README languages, the userscript description, package metadata, and the interface subtitle.
- Synchronize the userscript, package, and documented versions at 1.1.2 so existing installations can receive the wording correction through automatic updates.
- Preserve CSV processing rules, Cardmarket order-reference terminology, script identity, and update URLs.

### P9 TCGPowerTools — 1.1.2

- Added the verified tracking tool in its own script directory, with an English menu, PDF upload preview, batch tracking saves, and automatic refresh settings for native order actions.
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
