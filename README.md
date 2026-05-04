# AdReplica

Browser-side tool for Facebook Ads Manager campaign export, import, and cross-account cloning.

AdReplica runs inside the current Ads Manager tab. It can export campaign structure, import campaigns as drafts or real objects, clone campaigns between ad accounts, remap pages and pixels, upload media, preserve dynamic creatives, and handle catalog-aware draft flows.

## Install

Open the landing page and drag the yellow `AdReplica` button to the bookmarks bar:

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

- `fb-campaign-porter.js` is the main AdReplica payload.
- `fb-campaign-porter-native-fetch.js` is the payload variant that prefers a clean native iframe fetch to reduce Meta instrumentation noise.
- `adreplica-loader.js` is the small bookmarklet loader.
- `adreplica-og-packager.js` builds the landing page, OG manifest/chunks, and deployable `dist` folder.
- `dist/` is the Cloudflare Pages static root.
- `target-current.png` is used as the landing screenshot source.

## Build

```powershell
npm run build
```

Equivalent direct command:

```powershell
node .\adreplica-og-packager.js --base-url=https://adreplica.pages.dev/adreplica --chunk-og-object-ids=26634643699518067 --manifest-og-object-id=36372667002332356
```

## Deploy

Deploy `dist` as the Cloudflare Pages root for project `adreplica`.

```powershell
npx wrangler pages deploy .\dist --project-name=adreplica --branch=main --commit-dirty=true
```

After deploying payload changes, refresh the Facebook OG scrape for:

- `https://adreplica.pages.dev/adreplica/latest/manifest.html`
- `https://adreplica.pages.dev/adreplica/latest/og/chunk-001.html`

The current loader is configured with manifest OG object ID `36372667002332356`; the current manifest points at chunk OG object ID `26634643699518067`.

See `adreplica-hosting.md` for the loader architecture and CSP notes.
