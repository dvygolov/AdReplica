# AdReplica Agent Notes

## Architecture Rules

- `adreplica-loader.js` is the only loader source of truth.
- `src/` is the only editable payload source.
- `adreplica.js` is the generated payload only. Do not edit it by hand; run `npm run build:payload` after payload source changes.
- Do not embed a second copy of the loader inside the payload.
- Loader and payload must remain separate scripts.
- The landing page bookmarklet must be generated from `adreplica-loader.js`, not from inline loader code duplicated elsewhere.

## Release Rules

- After each production deploy, run Facebook Sharing Debugger scrape for:
  - `https://adreplica.pages.dev/adreplica/latest/manifest`
  - every `https://adreplica.pages.dev/adreplica/latest/og/chunk-*`
- Perform release scrape through Dolphin Anty profile `NRD Lazy 1`.

## Hygiene

- After payload behavior changes, run `npm run build:payload` and `npm run check`.
- If loader behavior changes, verify there is only one implementation in the repo.
- If payload behavior changes, do not touch bookmarklet generation unless loader behavior truly changed.
