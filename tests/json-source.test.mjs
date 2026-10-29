import assert from "node:assert/strict";
import test from "node:test";

import { readClonePackageFromJson } from "../src/domain/package.mjs";
import { CloneWorkflow } from "../src/workflows/clone-workflow.mjs";

const sampleFile = {
  campaign: { id: "c1", name: "SlimTeaPro-Catalog" },
  adsets: [{ id: "s1", name: "W35" }],
  ads: [{ id: "a1", name: "Ad 1", creative: { id: "cr1" } }],
  creatives: [{ id: "cr1" }],
  catalogs: [{ id: "cat1" }],
  productSets: [{ id: "ps1" }],
  files: [{ type: "image", fileName: "Ad 1__image_01.jpg" }],
};

test("a JSON package keeps the pipeline shape and fills the source block", () => {
  const pkg = readClonePackageFromJson(
    JSON.stringify(sampleFile),
    "slimtea.json",
  );
  assert.equal(pkg.source.campaignName, "SlimTeaPro-Catalog");
  assert.equal(pkg.source.campaignId, "c1");
  assert.equal(pkg.source.accountId, "");
  assert.equal(pkg.ads.length, 1);
  assert.equal(pkg.adsets.length, 1);
  assert.deepEqual(pkg.catalogs, [{ id: "cat1" }]);
  assert.deepEqual(pkg.productSets, [{ id: "ps1" }]);
  assert.deepEqual(pkg._downloadQueue, []);
  assert.deepEqual(pkg.fileNameMap, {});
});

test("a file without ads is refused instead of cloning nothing", () => {
  assert.throws(
    () => readClonePackageFromJson(JSON.stringify({ campaign: { id: "c" } })),
    /contains no ads/,
  );
  assert.throws(
    () => readClonePackageFromJson(JSON.stringify({ ads: [{ id: "a" }] })),
    /no campaign object/,
  );
  assert.throws(() => readClonePackageFromJson("{not json"), /not valid JSON/);
});

function workflowWith(state) {
  const calls = { exports: 0, refreshed: 0, rendered: 0 };
  const workflow = new CloneWorkflow({
    state,
    dom: {},
    logging: { log: () => {} },
    panelView: { setBusy: () => {} },
    mappingsView: {
      renderCloneMappings: () => {
        calls.rendered += 1;
      },
    },
    sessionService: { initializeSession: async () => {} },
    mappingController: {
      enforceCloneModeConstraints: () => {},
      refreshCloneTargetContext: async () => {
        calls.refreshed += 1;
      },
    },
    campaignController: { refreshCloneSourceContext: async () => {} },
    campaignExporter: {
      fetchCampaignExportPackage: async () => {
        calls.exports += 1;
        return null;
      },
    },
  });
  return { workflow, calls };
}

test("a JSON source skips the Ads Manager export", async () => {
  const state = {
    cloneSourceKind: "json",
    clonePackage: readClonePackageFromJson(JSON.stringify(sampleFile), "f.json"),
    cloneSourceAccountId: "",
    cloneSourceCampaignId: "",
    clonePackageLoading: false,
  };
  const { workflow, calls } = workflowWith(state);
  const pkg = await workflow.ensureClonePackageLoaded();
  assert.equal(pkg, state.clonePackage);
  assert.equal(calls.exports, 0);
  assert.equal(calls.refreshed, 1);
  assert.equal(state.clonePackageLoading, false);
});

test("a JSON source without a loaded file does not start a run", async () => {
  const state = {
    cloneSourceKind: "json",
    clonePackage: null,
    clonePackageLoading: false,
  };
  const { workflow, calls } = workflowWith(state);
  assert.equal(await workflow.ensureClonePackageLoaded(), null);
  assert.equal(calls.exports, 0);
  assert.equal(calls.refreshed, 0);
});
