# AdReplica

Browser-side tool for Facebook Ads Manager campaign export, import, and cross-account cloning.

AdReplica runs inside the current Ads Manager tab. It can export campaign structure, import campaigns as drafts or real objects, clone campaigns between ad accounts, remap pages and pixels, upload media, preserve dynamic creatives, and handle catalog-aware draft flows.

## Install

Open the landing page, click the yellow `AdReplica` button to copy the bookmarklet, then create a browser bookmark and paste it into the bookmark URL field:

https://adreplica.pages.dev/

Then open Facebook Ads Manager and click the bookmark.

## Features

- Export campaign JSON and related media for repeatable imports and comparisons.
- Import into draft, paused, or active mode through Ads Manager Graph/draft flows.
- Clone source campaigns into another ad account without saving intermediate files.
- Remap Facebook Pages, Page Backed Instagram identities, pixels, catalogs, and product sets.
- Preserve dynamic creative, URL tags, videos/images, language customizations, and catalog ad settings where supported.
- Use an OG-backed loader with SHA-256 verification and `localStorage` payload cache to work around Ads Manager CSP.

## Files

- `src/` is the editable AdReplica payload source.
- `adreplica.js` is the generated AdReplica payload. Do not edit it by hand; run `npm run build:payload`.
- `adreplica-loader.js` is the small bookmarklet loader.
- `adreplica-og-packager.js` builds the landing page, OG manifest/chunks, and deployable `dist` folder.
- `dist/` is the Cloudflare Pages static root.
- `target-current.png` is used as the landing screenshot source.

## Check

```powershell
npm run check
```

This verifies that generated `adreplica.js` is current with `src/` and runs Node syntax checks for the packager, payload, and loader.

## Payload Build

```powershell
npm run build:payload
```

The payload build uses `esbuild` to bundle and minify `src/main.mjs` into a single browser IIFE at `adreplica.js`. The payload version is taken from `package.json`.

## Build

```powershell
npm run build
```

Equivalent direct command:

```powershell
npm run build:payload
node .\adreplica-og-packager.js --base-url=https://adreplica.pages.dev/adreplica
```

## Deploy

Deploy `dist` as the Cloudflare Pages root for project `adreplica`.

```powershell
npx wrangler pages deploy .\dist --project-name=adreplica --branch=main --commit-dirty=true
```

After deploying payload changes, refresh the Facebook OG scrape for:

- `https://adreplica.pages.dev/adreplica/latest/manifest.html`
- every generated `https://adreplica.pages.dev/adreplica/latest/og/chunk-*.html`

The current loader is configured with the stable latest manifest URL `https://adreplica.pages.dev/adreplica/latest/manifest.html`; it resolves the current Facebook OG object at runtime instead of pinning a manifest object ID into the bookmarklet. The client loader does not call `scrape=true`; the deploy/release flow is responsible for refreshing the latest manifest and chunk URLs in Facebook OG.

See `adreplica-hosting.md` for the loader architecture and CSP notes.
