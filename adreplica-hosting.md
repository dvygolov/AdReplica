# AdReplica Loader Hosting

## Recommended Hosting

Use Cloudflare Pages or a Cloudflare Worker-backed static route.

- Pages is enough for static payload files and Open Graph chunk pages.
- Worker/KV is better if you want auth, build promotion, logging, or instant rollback.
- Prefer a custom domain later, but `https://adreplica.pages.dev/adreplica/<build>/...` is fine for testing.

## Runtime Flow

1. The root `https://adreplica.pages.dev/` page serves a branded install landing with a one-click bookmarklet copy button.
2. The bookmarklet stays small and only contains the loader.
3. The loader runs only on `*.facebook.com`.
4. The loader reads an OG-backed manifest through `adsmanager-graph.facebook.com`, using the current Ads Manager runtime token.
5. The manifest contains the latest version, payload SHA-256, and OG chunk object IDs.
6. If the cached `localStorage` payload version/hash matches the manifest, the loader executes the cached payload.
7. If the manifest is newer or the cache is missing, the loader fetches OG chunks, verifies SHA-256, writes the payload to `localStorage`, then injects it as a Blob script.
8. If the manifest is unavailable but a cached payload exists, the loader can run the cached payload. If neither manifest nor cache is available, it fails explicitly.

## Build and Publish

Generate deployable files:

```powershell
node D:\YandexDisk\Coding\Arbitrazh\AdReplica\adreplica-og-packager.js --base-url=https://adreplica.pages.dev/adreplica
```

Deploy `D:\YandexDisk\Coding\Arbitrazh\AdReplica\dist` as the Cloudflare Pages root.

After deploy, scrape the generated `latest/manifest.html` and every generated `latest/og/chunk-*.html` URL:

```js
await fetch(`https://graph.facebook.com/?id=${encodeURIComponent(chunkUrl)}&scrape=true&access_token=${accessToken}`, {
  method: "POST",
  credentials: "include",
});
const resolved = await fetch(`https://graph.facebook.com/?id=${encodeURIComponent(chunkUrl)}&fields=og_object&access_token=${accessToken}`, {
  credentials: "include",
}).then((r) => r.json());
console.log(resolved.og_object.id);
```

Put the manifest OG object ID into `manifestOgObjectId` in `adreplica-loader.js` and the generated bookmarklet config. Pass the chunk OG object IDs back to `adreplica-og-packager.js` so the next manifest points at the stable chunk objects.

## Why Not Load The Script Directly?

Facebook Ads Manager CSP blocks Cloudflare Pages direct runtime fetch/script loading in normal use. AdReplica therefore does not attempt direct Cloudflare payload loading from inside Ads Manager; Cloudflare only hosts OG pages that Facebook itself scrapes, and the runtime loader reads those OG objects through Ads Manager Graph.
