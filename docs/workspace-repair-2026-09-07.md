# Local workspace repair — 2026-09-07

The checkout was at `394122a` (release `070926b7`). A fresh clone of the configured GitHub origin confirmed that eight missing source modules and `tests/safety.test.mjs` were still required files in this revision. This was not an obsolete pre-refactor source tree.

Local `git fsck` reported missing tree and commit objects. The working copy of `adreplica-og-packager.js` exactly matched the older `d6a0475` revision, and the local tool metadata had an older generation date. ESLint could not load its own `../rules` module. These observations establish incomplete or reverted local files; they do not establish which process caused the damage.

Recovery preserved the initial Git directory and modified files outside the workspace at `C:/Users/allsp/AppData/Local/AdReplica-backups/20260907-repair`. Missing Git objects were supplied from a fresh clone without replacing local refs or the index. Missing tracked files and the obsolete packager/metadata were restored from the current revision. `npm ci` recreated dependencies from the lockfile.

Cleanup archived 19 obsolete extraction scripts, test-run scripts, payload copies, screenshots, a test video and a browser log outside the repository. JSON verification evidence and the reusable preview/production-verification scripts remain in `.runtime`. All 78 source modules are reachable from `src/main.mjs`; none were removed. The package build replaced the old generated version directory with the new one.

## Draft retry update

Build `070926b8` permits one additional draft-creation POST only after all three verification reads succeed and find no matching fragment. A failed read or a matching fragment without an object ID prevents this retry. The retry keeps the original body and temporary ID and verifies its result. Multiple matching fragments or an object-ID mismatch cause an uncertain failure. Transaction rollback selects all matching temporary IDs, including duplicates.

This updates the conservative no-repeat policy described in the historical refactor verification. It does not establish that Meta treats temporary IDs as idempotency keys, nor eliminate the possibility of a fragment becoming visible after the verification window.

## Verification

- `git fsck --full --no-dangling`: passed after object recovery.
- `npm run build:payload` and `npm run check`: passed; 41 tests, including draft retry scenarios.
- `npm run build`: generated `070926b8`, including the live tool metadata consumed by YellowWebHub.
- `npm run check:payload` and `git diff --check`: passed after packaging.

No production deploy was performed during this repair. The public hub continues to read deployed metadata until the new build is deployed.
