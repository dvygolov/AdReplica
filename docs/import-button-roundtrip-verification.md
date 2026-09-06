# Import button regression and disk roundtrip verification

Verified in Dolphin Anty profile NRD Lazy 3 on 7 September 2026 (Europe/Samara).

## Root cause

Production build 060926b5 passed the native Import/Clone click event to OperationCoordinator. Facebook decorates that event with enumerable `__ext_triggerFlowlet` metadata containing cycles. OperationContext recursively copied it before the workflow's option normalization and before the coordinator's try block. The real click therefore caused `Maximum call stack size exceeded`, with no operation log or new report. Programmatic workflow calls and plain DOM fixtures did not exercise this Meta event shape; the earlier verification missed this UI regression.

The panel now invokes Import/Clone without forwarding the event. The coordinator also normalizes options before creating the snapshot. A regression test first reproduced the overflow and now covers both operations with cyclic Meta event metadata.

## Supplied empty package

`PayProbe L3A1 2026-06-23T14-58-41-567Z.json` contains one ad set, zero ads, zero creatives and zero media files. Live reads of campaign 120249703518760324 and its ad set 120249703518840324 also returned no ads. This specific file did not lose creatives during export. Its screenshot's completed report described Export, not the attempted Import.

The package summary now includes the ad count and an explicit empty-package explanation. Importing an empty package returns a visible preflight issue before creating anything. Report headings identify the operation. Action rows and report cards have spacing, and report headings have explicit contrast against the dark panel.

## Real files and real UI

Source campaign: 120247132655930320 in JMS1, with one ad set, one image ad and one creative containing nine language variants. Export was started by the UI button. AdReplica downloaded the JSON (44,742 bytes) and JPEG (82,076 bytes) to Downloads. Both actual files were then selected through browser file chooser dialogs; no synthetic File objects or programmatic import workflow calls were used for the roundtrip.

JPEG SHA-256: `F2A503D9062CB902F98ADED5B94107CCD14A1CFDDF40860D32A345BAADD353C9`.

The actual Import button created campaign 120249263777130320, ad set 120249263777210320 and ad 120249263777820320 in DRAFT mode. All three fragments were VALIDATED with zero errors. The image upload returned hash `8ca5bd097881bb2d2bbe07e196a6ba28`.

A fresh Ads Manager tab opened the standalone ad editor. It showed the uploaded image in Facebook and Instagram previews, the nine language variants, Use Facebook Page identity and All edits saved. Meta also showed two placement eligibility warnings and an inactive pixel warning; ad delivery was not enabled.

A second real click encountered a lost network response while creating the ad. The application reported Needs verification, did not repeat that POST, rolled back its two created fragments and preserved the first successful import. A subsequent live read found exactly the first import's three VALIDATED fragments and no duplicate objects.

After that confirmed rollback, another real Import click completed successfully: campaign 120249263814760320, ad set 120249263814900320 and ad 120249263815500320. All three fragments were VALIDATED, with zero skipped objects or issues. The first successful import remained intact.

Cleanup removed exactly the six fragments belonging to the two successful test imports. Both rollback summaries had zero failures and zero remaining owned fragments; a final read returned zero fragments in the account's draft. The uploaded image hash was not deleted because Meta may reuse an existing library image with that hash. No test campaign is active.

Live checks used payload 070926b2. Later local packaging by the landing-page task retains the same payload behavior. `npm run check` passed all 26 tests and verified the generated payload on 070926b5.

Evidence files, downloaded JSON/JPEG, reports and screenshots are preserved in `D:/Downloads/AdReplica-roundtrip-070926/`. No production deployment is part of this verification.
