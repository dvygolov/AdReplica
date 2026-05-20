# AdReplica Agent Notes

## Architecture Rules

- `adreplica-loader.js` is the only loader source of truth.
- `adreplica.js` is the payload only. Do not embed a second copy of the loader inside it.
- Loader and payload must remain separate scripts.
- The landing page bookmarklet must be generated from `adreplica-loader.js`, not from inline loader code duplicated elsewhere.

## Release Rules

- After each production deploy, run Facebook Sharing Debugger scrape for:
  - `https://adreplica.pages.dev/adreplica/latest/manifest`
  - every `https://adreplica.pages.dev/adreplica/latest/og/chunk-*`
- Perform release scrape through Dolphin Anty profile `NRD Lazy 1`.

## Hygiene

- If loader behavior changes, verify there is only one implementation in the repo.
- If payload behavior changes, do not touch bookmarklet generation unless loader behavior truly changed.
