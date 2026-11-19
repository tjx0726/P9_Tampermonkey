# Agent instructions

These instructions apply throughout this repository.

## Repository purpose

This repository contains Tampermonkey userscripts for P9's internal use.

The `.agents/` directory is reserved for shared agent resources and supporting instructions.

## Script structure

Each userscript must have its own top-level folder containing:

- An independent `README.md` explaining installation, usage, and relevant configuration.
- The main userscript file, named with the `.user.js` extension.
- Any supporting files required by that script, such as tests, fixtures, assets, or package metadata.

Keep script-specific documentation and supporting files in that script's folder. The root `README.md` provides the repository overview and script catalog; the root `CHANGELOG.md` records changes across scripts.

## Automatic updates and releases

- Every new userscript must define valid `@updateURL` and `@downloadURL` values in its userscript header.
- Use publicly accessible Raw URLs on this repository's `main` branch, within the script's own folder. Both fields may point to the same `.user.js` file; `@downloadURL` must serve the complete script. Keep these paths stable.
- Increase `@version` for every published change to a userscript. Synchronize any runtime version constant, `package.json` version, and documented current version for that script when present.
- For every new script and script update, add the corresponding release entry to the root `CHANGELOG.md` in English, including the script name, version, and a concise description of the changes.
- Preserve the existing `@name` and `@namespace` when updating a script so installed copies retain their identity.

## README language

- Write `README.md` in English. English is the default documentation language at the repository root and in every script folder.
- A Chinese edition, `README.zh-CN.md`, is optional.
- Label Chinese-language navigation links as `中文`.
- Preserve existing Chinese editions and keep them consistent with the English documentation when making related changes.
- When both editions exist, provide language-switching links between them and keep commands, versions, installation URLs, and technical facts aligned.

## Changelog language

Maintain `CHANGELOG.md` in English only, with no translated editions.
