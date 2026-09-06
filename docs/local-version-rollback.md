# Local previous-version rollback

Service offers `Load previous version (<build>)`. The browser stores one current and one previous script, scoped to the Ads Manager origin and the current browser profile. No campaign data, session tokens, cookies or selected media are added to version history. Clearing this site's browser storage removes the saved versions.

The loader archives the cache before replacing it with a different build. Re-running the same build preserves history. Payload-side observation also preserves history for existing bookmarklets after they have run a version supporting this feature; those old bookmarklets cannot recover a pre-feature script already overwritten before observation began. Reinstalling the bookmarklet from the site enables immediate migration of the existing loader cache.

Rollback checks the saved script's SHA-256 before executing it locally. It does not fetch the old script or change the latest-version cache. A normal bookmarklet launch returns to the latest available build. Switching creates a fresh panel and resets the current form. Running operations block switching and updates. Storage failure is reported without preventing the current application from loading.

## Verification, 7 September 2026

- 30 automated tests passed, including cache rotation, repeat launch, old-bookmarklet observation, rollback history stability, quota failure, corrupted source rejection and busy-operation exclusion.
- In Dolphin Anty NRD Lazy 3, the actual loader upgraded cached local build 070926b5 to 070926b6 and archived b5. The transport fixture supplied the actual local build files; Meta was not used to host unpublished test builds.
- Clicking the actual Service action replaced b6 with b5 through Blob script execution. There was exactly one panel; the latest cache remained b6 and previous remained b5.
- Running the loader again restored b6 without rotating or losing the previous copy. The temporary transport fixture was then removed.
- Local screenshots: `D:/Downloads/AdReplica-local-versions-070926/`.
