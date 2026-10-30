import assert from "node:assert/strict";
import test from "node:test";

import { AccountContextService } from "../src/accounts/account-context-service.mjs";

/** Minimal Graph client: an account without a Business Manager and one pixel. */
function createService(logs) {
  const graphClient = {
    graphFetch: async () => ({ id: "123", name: "L2A5" }),
    graphGetAll: async (path) => {
      if (String(path).endsWith("/adspixels")) {
        return [{ id: "p1", name: "PDL" }];
      }
      return [];
    },
    graphPageGetAll: async () => [],
  };
  const state = { accountContextCache: {}, accessiblePagesCache: [] };
  return new AccountContextService({
    state,
    graphClient,
    logging: {
      log: (level, message) => logs.push({ level, message }),
    },
  });
}

test("a package without catalogs stays quiet about the Business Manager", async () => {
  const logs = [];
  const service = createService(logs);
  const context = await service.fetchAccountContext("123", { quiet: true });
  assert.equal(context.business, null);
  assert.deepEqual(context.pixels, [{ id: "p1", name: "PDL" }]);
  assert.equal(
    logs.filter((entry) => /business manager/i.test(entry.message)).length,
    0,
    "no catalog note for a plain campaign",
  );
});

test("catalog lookups still report a missing Business Manager", async () => {
  const logs = [];
  const service = createService(logs);
  await service.fetchAccountContext("456");
  assert.ok(
    logs.some((entry) => /no business manager is visible/i.test(entry.message)),
    "a catalog campaign keeps the diagnostic",
  );
});
