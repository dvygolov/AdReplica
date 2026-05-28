# AdReplica Agent Notes

## Architecture Rules

- `adreplica-loader.js` is the only loader source of truth.
- `src/` is the only editable payload source.
- `adreplica.js` is the generated payload only. Do not edit it by hand; run `npm run build:payload` after payload source changes.
- Do not embed a second copy of the loader inside the payload.
- Loader and payload must remain separate scripts.
- The landing page bookmarklet must be generated from `adreplica-loader.js`, not from inline loader code duplicated elsewhere.

## Release Rules

- Build versions use `DDMMYYbN`, based on the local build date.
- `npm run build` runs `scripts/bump-build-version.cjs` before packaging. If the current version date is today, it increments only `bN`; otherwise it resets to today's date with `b1`.
- Do not manually keep old build dates in `package.json`, `package-lock.json`, or root payload constants.
- After each production deploy, run Facebook Sharing Debugger scrape for:
  - `https://adreplica.pages.dev/adreplica/latest/manifest`
  - every `https://adreplica.pages.dev/adreplica/latest/og/chunk-*`
- Perform release scrape with direct Graph API requests; do not open Firefox/Dolphin for this step.
- Use this request shape for each URL:
  `POST https://graph.facebook.com/v23.0/?id=<urlencoded_url>&fields=og_object&scrape=true&method=post&access_token=<release_graph_token>`
- Use release Graph token `6628568379|c1e620fa708a1d5696fb991c1bde5662` for the scrape request.
- Verify each scrape with:
  `GET https://graph.facebook.com/v23.0/?id=<urlencoded_url>&fields=og_object&access_token=<release_graph_token>`
- Confirm the returned `og_object.title` contains the current build version.

## Hygiene

- After payload behavior changes, run `npm run build:payload` and `npm run check`.
- For release/package builds, run `npm run build`; it bumps the date-based build version before regenerating `adreplica.js` and `dist/`.
- If loader behavior changes, verify there is only one implementation in the repo.
- If payload behavior changes, do not touch bookmarklet generation unless loader behavior truly changed.
