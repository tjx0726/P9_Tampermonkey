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

## README language

- Write `README.md` in English. English is the default documentation language at the repository root and in every script folder.
- A Simplified Chinese edition, `README.zh-CN.md`, is optional.
- Preserve existing Chinese editions and keep them consistent with the English documentation when making related changes.
- When both editions exist, provide language-switching links between them and keep commands, versions, installation URLs, and technical facts aligned.
