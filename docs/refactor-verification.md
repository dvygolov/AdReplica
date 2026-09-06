# AdReplica refactor verification

Date: 2026-09-06. Local build: `060926b3`. Baseline: `12764a6a15ae1daf672fd42daaeece2aa3b8b4d9`, preserved on local branch `monolith`. Implementation remains on `main`; no production deployment or push is part of this verification.

## Changes

The 9,030-line payload source was separated into domain modules, service classes, UI controllers, writers and workflows. `src/main.mjs` only bootstraps the app. Dependencies are explicitly composed in `src/app/create-services.mjs`; static imports are checked for cycles. The browser still receives one esbuild-generated payload, separate from the unchanged bookmarklet loader.

1. Each operation snapshots its account, package, modes, mappings and media selections before asynchronous work. UI controls are disabled for its duration; stale account-context responses cannot replace a different account's mappings.
2. Creation requests are not automatically repeated after network loss, unreadable response bodies, invalid JSON or uncertain server responses. Draft creation searches by its operation's temporary ID before returning uncertainty. An unsuccessful search does not cause a second POST.
3. Direct ACTIVE imports create everything PAUSED, verify account and status, activate children first and campaign last. Failure attempts to pause the campaign and verifies that pause. An incomplete hierarchy cannot activate.
4. Selecting an existing catalog reuses its data. Explicit copy choices are validated together before writes and confirmed with the user. Existing product-set filters are preserved; conflicting names produce separate sets. Equivalent-set matching no longer silently chooses an unrelated/default set.

Additional corrections: distinct files with identical names no longer share upload cache entries; valid-only filtering uses ad IDs; pixel placeholders are replaced after pixel resolution; choosing a new pixel no longer silently reuses an unrelated existing pixel. Reports distinguish success, partial, failed, cancelled and needs-verification, with created IDs, skipped ads, validation errors and remaining resources. Pending validation and zero imported ads cannot be reported as complete imports.

## Automated verification

`npm run check` runs ESLint, 23 Node tests, generated-payload parity and syntax checks. Tests cover:

- Service composition, acyclic imports and source module size; browser panel mounting, setting locks and report rendering.
- Immutable operation settings, concurrent-operation exclusion and the full paused import workflow.
- Lost POST responses, lost bodies, malformed responses, missing IDs, read retry and draft recovery without duplicate writes.
- Paused staging, activation ordering, incomplete-import rejection and pause after activation failure.
- Catalog reuse without writes, all-mapping preflight, filter preservation and conservative product-set matching.
- Transaction-owned rollback in child-before-parent order, preserving unrelated fragments.
- Pending/invalid draft validation, typed draft values and fallback temporary-ID accounting.
- Same-name file separation, same-name ad preservation, picture/hash normalization and result classification.

`npm run build` generated the payload, landing page, manifest, OG chunk and `tool-meta.json` with the current date-based build. YellowWebHub reads that metadata through its existing live registry; its public version will change when these artifacts are deployed.

## Live Dolphin Anty verification

Profile: NRD Lazy 3. All Facebook requests ran inside the profile's Ads Manager session. Both test accounts started with zero draft fragments. No campaign was activated during testing.

| Scenario | Observed result |
| --- | --- |
| Initialize panel and load accounts | Passed; 13 accounts visible |
| Export four existing campaigns | Passed; catalog, language-image and empty-ad campaign packages read |
| Same-account language/image clone to draft | Passed; campaign, ad set and ad all VALIDATED |
| Catalog clone reusing the same catalog | Passed; all three fragments VALIDATED |
| Repeated import preserves prior draft | Passed; all six fragments remained, all VALIDATED |
| Invalid billing-event fixture | Correct partial report with two Meta validation errors |
| Scoped rollback of invalid fixture | Deleted exactly three test fragments; preserved all six earlier fragments |
| Cross-account image/language clone | Structure and ad created; Meta rejected ad validation with error 1359188, No Payment Method; report correctly partial |
| Direct PAUSED import | Passed; campaign, ad set and ad created PAUSED |
| UI settings during direct import | All inputs, selects and buttons disabled |
| Video upload and network-loss recovery | Video processed to ready. Ad-creation response was lost; no repeat POST, two newly created fragments rolled back, earlier six preserved |
| Video retry after confirmed rollback | Passed on build 060926b2; upload, campaign, ad set and ad completed; all three draft fragments VALIDATED |
| Fresh editor: language/image | Loaded, showed Page-backed Instagram identity, text, URL tags and rendered image previews; the saved creative retained all nine bodies, titles and language rules |
| Fresh editor: catalog | Loaded the selected product set and rendered product cards with names and CTA |
| Fresh editor: video | Loaded media controls and two playable previews; both video elements had readyState 4 and duration 2.94 seconds |
| Final account comparison | Both accounts returned to zero draft fragments; the source's four original PAUSED campaigns were unchanged and no extra campaign remained |

All test campaign/ad set/ad objects and the direct-import creative were deleted. Both uploaded QA videos remain in the media library (`1059940250168069`, `1934128420897795`): Meta refused deletion with code 10/subcode 1363055. The newly created target pixel `1621554896153020` also remains because Meta does not allow its deletion with this session (code 100/subcode 33). A copied image may remain in the target library; it was not deleted because hash-based reuse does not establish exclusive test ownership. None of these resources has an active test campaign attached.

The final build adds an additional uncertainty guard for HTTP 5xx private mutations; its regression test and package checks pass. Successful live video and editor checks were performed on 060926b2 before that guard; the final build was then smoke-tested for initialization. Detailed local evidence is in ignored `.runtime/live-verification.json` and is not included in the repository.

## Limits

ACTIVE activation ordering and failure recovery are tested with isolated transport fixtures; real delivery/spending was not enabled. Explicit cross-catalog copying and collision handling are covered by isolated tests; live catalog testing reused an accessible catalog. The target account's missing payment method prevents a fully validated cross-account result on that account. Meta showed placement-eligibility warnings in previews, including for the short landscape QA video; these are separate from successful import and editor loading.

The loader's previously reviewed relaxed checksum policy and unsupported video-carousel cases are outside the four prioritized corrections. The loader source was unchanged. Meta's private API, permissions, account configuration and media processing remain external integration constraints.
