import test from "node:test";
import assert from "node:assert/strict";
import { AdReplicaState } from "../src/state/ad-replica-state.mjs";
import { createServices } from "../src/app/create-services.mjs";
import { OperationCoordinator } from "../src/operations/operation-coordinator.mjs";
import { OperationReport } from "../src/operations/operation-report.mjs";
import { GraphClient } from "../src/facebook/graph-client.mjs";
import { PrivateGraphqlClient } from "../src/facebook/private-graphql-client.mjs";
import { DirectWriter } from "../src/writers/direct-writer.mjs";
import { DraftWriter } from "../src/writers/draft-writer.mjs";
import { resolveMutuallyExclusiveStoryImageFields } from "../src/domain/creative.mjs";
import { CatalogSetService } from "../src/catalog/catalog-set-service.mjs";
import { CatalogMappingService } from "../src/catalog/catalog-mapping-service.mjs";
import { DraftRecovery } from "../src/drafts/draft-recovery.mjs";
import { DraftRepository } from "../src/drafts/draft-repository.mjs";
import { ImageService } from "../src/media/image-service.mjs";
import { MediaPreflight } from "../src/media/media-preflight.mjs";
import { DraftValidation } from "../src/drafts/draft-validation.mjs";
import {
  canonicalProductSetFilter,
  pickFallbackTargetProductSet,
} from "../src/domain/catalog.mjs";
import { UncertainWriteError } from "../src/facebook/request-errors.mjs";
import {
  createDraftImportTransaction,
  draftValueItem,
} from "../src/domain/draft-values.mjs";

const logging = { log() {} };

test("private mutation server failure remains uncertain and cannot trigger a creation fallback", async () => {
  let calls = 0;
  const client = new PrivateGraphqlClient({
    state: { privateTokens: { fbDtsg: "test", lsd: "test" } },
    networkDiagnostics: { recordNetworkDiagnostic() {} },
    sessionService: { getCurrentActorId: () => "123456" },
    browserTransport: {
      adReplicaFetch: async () => {
        calls++;
        return new Response("{}", { status: 503 });
      },
    },
  });
  await assert.rejects(
    client.privateGraphqlMutation("123", "CreateCatalogMutation", {}),
    { uncertain: true },
  );
  assert.equal(calls, 1);
});

test("story image normalization keeps hashes and removes conflicting picture fields", () => {
  const raw = {
    object_story_spec: {
      link_data: {
        image_hash: "image",
        picture: "https://example.test/image",
        child_attachments: [
          { image_hash: "child", picture: "https://example.test/child" },
        ],
      },
    },
  };
  resolveMutuallyExclusiveStoryImageFields(raw);
  assert.equal(raw.object_story_spec.link_data.image_hash, "image");
  assert.equal(raw.object_story_spec.link_data.picture, undefined);
  assert.equal(
    raw.object_story_spec.link_data.child_attachments[0].picture,
    undefined,
  );
});
test("definitively rejected draft fallback does not leave a phantom validation ID", async () => {
  const state = new AdReplicaState();
  const tx = createDraftImportTransaction("123456", "654321");
  let writes = 0;
  let body;
  const writer = new DraftWriter({
    state,
    logging,
    sessionService: { getDraftApplicationId: () => "app" },
    draftRecovery: {
      createDraftFragmentWithRecovery: async (d, b) => {
        body = b;
        if (++writes === 1)
          throw new Error(
            JSON.stringify({ code: 100, error_subcode: 1487390 }),
          );
        return { id: "fragment", ad_object_id: "ad" };
      },
    },
  });
  await writer.createAdDraft(
    "123456",
    "654321",
    "campaign",
    "adset",
    { name: "Ad" },
    {
      __adReplicaSimpleDraftFallback: {
        object_story_spec: { page_id: "123456" },
      },
    },
    { draftTransaction: tx },
  );
  assert.equal(tx.tempIds.size, 1);
  assert.equal(writes, 2);
  assert.equal(
    typeof body.values.find((x) => x.field === "tempID").new_value,
    "number",
  );
  assert.equal(
    typeof body.values.find((x) => x.field === "creative").new_value,
    "object",
  );
});

test("distinct same-name media files are uploaded independently and reused by identity", async () => {
  const service = new ImageService({
    logging,
    downloadService: { getMediaFileName: (f) => f.name },
  });
  let uploads = 0;
  service.uploadImage = async () => String(++uploads);
  service.waitForAdImageUrlByHash = async (a, h) => `https://example.test/${h}`;
  const cache = { images: new Map(), imageUrls: new Map() };
  const a = new File(["a"], "same.jpg");
  const b = new File(["b"], "same.jpg");
  assert.equal((await service.uploadImageAsset("A", a, cache)).hash, "1");
  assert.equal((await service.uploadImageAsset("A", b, cache)).hash, "2");
  assert.equal((await service.uploadImageAsset("A", a, cache)).hash, "1");
  assert.equal(uploads, 2);
});
test("valid-only filtering preserves another ad with the same name", () => {
  const service = new MediaPreflight({});
  const pkg = {
    ads: [
      { id: "1", name: "same" },
      { id: "2", name: "same" },
    ],
    creatives: [],
  };
  assert.deepEqual(
    service
      .filterPackageAdsByMediaPreflightIssues(pkg, [
        { adId: "1", adName: "same" },
      ])
      .ads.map((x) => x.id),
    ["2"],
  );
});
test("transaction rollback deletes own children before parents and preserves earlier fragments", async () => {
  const tx = createDraftImportTransaction("123456", "654321");
  tx.tempIds = new Set(["-1", "-2", "-3"]);
  let fragments = [
    ["c", "campaign", -1],
    ["s", "ad_set", -2],
    ["a", "ad", -3],
    ["foreign", "campaign", -4],
  ].map(([id, ad_object_type, temp]) => ({
    id,
    ad_object_type,
    values: [draftValueItem("tempID", temp)],
  }));
  const deleted = [];
  const repository = new DraftRepository({});
  const recovery = new DraftRecovery({
    logging,
    graphClient: {
      graphFetch: async (id) => {
        deleted.push(id);
        fragments = fragments.filter((x) => x.id !== id);
        return { success: true };
      },
    },
    draftRepository: {
      sortDraftFragmentsForDeletion: repository.sortDraftFragmentsForDeletion,
      fetchCurrentDraftDetails: async () => ({
        addraft_fragments: { data: fragments },
      }),
    },
  });
  const result = await recovery.rollbackDraftImport("123456", "654321", tx);
  assert.deepEqual(deleted, ["a", "s", "c"]);
  assert.deepEqual(
    fragments.map((x) => x.id),
    ["foreign"],
  );
  assert.equal(result.deletedCount, 3);
});
test("creation without a returned ID is uncertain", async () => {
  const client = graphClient(async () => new Response("{}"));
  await assert.rejects(
    client.graphFetch("act_A/ads", { method: "POST", body: { name: "test" } }),
    { uncertain: true },
  );
});
const fixture = () => ({
  source: { accountId: "A", campaignName: "Source" },
  campaign: { id: "c", name: "Source" },
  adsets: [{ id: "s", name: "Set", targeting: {} }],
  ads: [{ id: "a", name: "Ad", adset: { id: "s" }, creative: { id: "x" } }],
  creatives: [{ id: "x", raw: {} }],
  files: [],
});
const stateForImport = () =>
  Object.assign(new AdReplicaState(), {
    sessionReady: true,
    token: "test",
    importAccountId: "A",
    importCampaignName: "Copy",
    importAsDraft: false,
    importStatus: "ACTIVE",
    importPackage: fixture(),
  });
function graphClient(fetch) {
  return new GraphClient({
    state: { token: "test" },
    logging,
    networkDiagnostics: { recordNetworkDiagnostic() {} },
    browserTransport: { adReplicaFetch: fetch },
    requestContext: {
      getAccountIdFromGraphPath: () => "",
      applyGraphRuntimeTemplate() {},
    },
  });
}

test("lost POST response is not retried; lost GET response can be retried", async () => {
  let calls = 0;
  const client = graphClient(async () => {
    calls++;
    if (calls === 1) throw new TypeError("Failed to fetch");
    return new Response('{"id":"1"}');
  });
  await assert.rejects(
    client.graphFetch("act_A/campaigns", {
      method: "POST",
      body: { name: "test" },
      networkRetryBaseDelayMs: 0,
    }),
    { uncertain: true },
  );
  assert.equal(calls, 1);
  calls = 0;
  assert.equal(
    (await client.graphFetch("1", { networkRetryBaseDelayMs: 0 })).id,
    "1",
  );
  assert.equal(calls, 2);
});
test("lost response body and invalid JSON leave a write uncertain", async () => {
  for (const fetch of [
    async () => ({
      text: async () => {
        throw new TypeError("Failed to fetch");
      },
    }),
    async () => new Response("<html>"),
  ]) {
    let calls = 0;
    const client = graphClient(async (...args) => {
      calls++;
      return fetch(...args);
    });
    await assert.rejects(
      client.graphFetch("act_A/ads", {
        method: "POST",
        body: { name: "test" },
      }),
      { uncertain: true },
    );
    assert.equal(calls, 1);
  }
});
test("operation snapshots selections and excludes a concurrent operation", async () => {
  const state = stateForImport();
  let release;
  const gate = new Promise((r) => {
    release = r;
  });
  let observed;
  const coordinator = new OperationCoordinator({
    state,
    initializeSession: () => gate,
    onChange() {},
    onReport() {},
    createRuntime: (context) => ({
      importWorkflow: {
        async importPackage() {
          observed = context.state;
          return false;
        },
      },
    }),
  });
  const running = coordinator.run("import");
  assert.equal(await coordinator.run("clone"), false);
  state.importAccountId = "B";
  state.importPackage.ads[0].name = "Changed";
  state.importStatus = "PAUSED";
  release();
  await running;
  assert.equal(observed.importAccountId, "A");
  assert.equal(observed.importStatus, "ACTIVE");
  assert.equal(observed.importPackage.ads[0].name, "Ad");
  assert.equal(state.busy, false);
});
function directFixture(failActivation = false) {
  const state = stateForImport();
  state.operationReport = new OperationReport({
    kind: "import",
    packageData: state.importPackage,
  });
  const calls = [];
  const entities = new Map();
  let id = 0;
  const writer = new DirectWriter({
    state,
    scheduleService: { cleanTargeting: (x) => x },
    graphClient: {
      async graphFetch(path, options = {}) {
        calls.push({ path, ...options });
        if (options.method === "POST" && path.startsWith("act_")) {
          const result = { id: String(++id), account_id: "A", ...options.body };
          entities.set(result.id, result);
          return result;
        }
        if (options.method === "POST") {
          if (
            failActivation &&
            options.body.status === "ACTIVE" &&
            path === "2"
          )
            throw new Error("activation denied");
          Object.assign(entities.get(path), options.body);
          return { success: true };
        }
        return { ...entities.get(path) };
      },
    },
  });
  return { state, writer, calls, entities };
}
async function createHierarchy(f) {
  const c = await f.writer.createCampaign("A", {});
  const s = await f.writer.createAdset(
    "A",
    c,
    { name: "set", targeting: {} },
    {},
  );
  await f.writer.createAd("A", s, { name: "ad" }, "creative");
  return c;
}
test("ACTIVE creates paused hierarchy, verifies it, activates campaign last", async () => {
  const f = directFixture();
  const c = await createHierarchy(f);
  assert.ok(f.calls.every((x) => x.body.status === "PAUSED"));
  await f.writer.activateCampaign(c);
  assert.deepEqual(
    f.calls.filter((x) => x.body?.status === "ACTIVE").map((x) => x.path),
    ["3", "2", "1"],
  );
  assert.equal(f.state.operationReport.activation, "active");
});
test("activation failure keeps campaign paused and incomplete hierarchy cannot activate", async () => {
  const f = directFixture(true);
  const c = await createHierarchy(f);
  await assert.rejects(f.writer.activateCampaign(c));
  assert.equal(f.entities.get(c).status, "PAUSED");
  assert.equal(f.state.operationReport.activation, "paused_after_error");
  f.state.operationReport.skip({ id: "x" }, "missing");
  const n = f.calls.length;
  await assert.rejects(f.writer.activateCampaign(c));
  assert.equal(f.calls.length, n);
});
test("same-name product set with different filter is never overwritten", async () => {
  const calls = [];
  const service = new CatalogSetService({
    logging,
    graphClient: {
      graphGetAll: async () => [
        { id: "old", name: "Sale", filter: { brand: { eq: "old" } } },
      ],
      graphFetch: async (path, options) => {
        calls.push({ path, ...options });
        return { id: "new" };
      },
    },
  });
  const result = await service.copyCatalogProductSets(
    [{ id: "source", name: "Sale", filter: { brand: { eq: "new" } } }],
    "target",
    {},
  );
  assert.deepEqual(result, { source: "new" });
  assert.equal(calls[0].path, "target/product_sets");
  assert.equal(calls.length, 1);
  assert.match(calls[0].body.name, /AdReplica/);
});
test("catalog copying reuses Meta's automatic default without treating unknown filters as equivalent", async () => {
  const writes = [];
  const service = new CatalogSetService({
    logging,
    graphClient: {
      graphGetAll: async () => [
        {
          id: "default",
          name: "All Products",
          original_creation_source: "catalog_creation",
        },
      ],
      graphFetch: async (path, options) => {
        writes.push({ path, ...options });
        return { id: "explicit" };
      },
    },
  });
  const result = await service.copyCatalogProductSets(
    [
      {
        id: "source-default",
        name: "Localized default",
        original_creation_source: "catalog_creation",
      },
      { id: "source-unknown", name: "Unknown" },
      {
        id: "source-filtered",
        name: "All Products",
        filter: { brand: { eq: "new" } },
      },
    ],
    "target",
    {},
  );
  assert.equal(result["source-default"], "default");
  assert.equal(result["source-unknown"], "explicit");
  assert.equal(writes.length, 2);
  assert.deepEqual(writes[1].body.filter, '{"brand":{"eq":"new"}}');
});

test("product set matching does not silently use all-products or a lone unrelated set", () => {
  assert.equal(
    pickFallbackTargetProductSet({ name: "Sale", filter: { x: 1 } }, [
      { id: "1", name: "All Products", filter: {} },
    ]),
    null,
  );
  assert.equal(
    canonicalProductSetFilter('{"b":2,"a":1}'),
    canonicalProductSetFilter({ a: 1, b: 2 }),
  );
});
test("selecting an existing target catalog is read-only", async () => {
  const pkg = { ...fixture(), catalogs: [{ id: "100001" }] };
  let writes = 0;
  const service = new CatalogMappingService({
    state: { importAccountId: "A" },
    logging,
    graphClient: { graphGetAll: async () => [] },
    accountContextService: { invalidateAccountContextCache() {} },
    catalogCopyService: {
      copyCatalogIntoExistingTarget: async () => {
        writes++;
      },
      copyCatalogToTargetBusiness: async () => {
        writes++;
      },
    },
  });
  const result = await service.prepareCatalogMappingsForImport(
    pkg,
    { catalogs: [{ id: "200001" }] },
    { 100001: "200001" },
  );
  assert.equal(writes, 0);
  assert.equal(result.catalogMappings["100001"], "200001");
});
test("invalid later catalog mapping prevents an earlier copy", async () => {
  let writes = 0;
  const service = new CatalogMappingService({
    state: { importAccountId: "A" },
    logging,
    graphClient: { graphGetAll: async () => [] },
    accountContextService: { invalidateAccountContextCache() {} },
    catalogCopyService: {
      copyCatalogToTargetBusiness: async () => {
        writes++;
      },
    },
  });
  await assert.rejects(
    service.prepareCatalogMappingsForImport(
      { ...fixture(), catalogs: [{ id: "100001" }, { id: "100002" }] },
      { business: { id: "bm" }, catalogs: [] },
      { 100001: "__copy__", 100002: "999999" },
    ),
  );
  assert.equal(writes, 0);
});
test("ambiguous draft creation recovers by tempID but does not repeat creation", async () => {
  let writes = 0;
  const recovery = new DraftRecovery({
    logging,
    graphClient: {
      graphFetch: async () => {
        writes++;
        throw new UncertainWriteError("draft", new Error("Failed to fetch"));
      },
    },
  });
  recovery.recoverCreatedDraftFragment = async () => null;
  await assert.rejects(
    recovery.createDraftFragmentWithRecovery("draft", {}, {}),
    { uncertain: true },
  );
  assert.equal(writes, 1);
  recovery.recoverCreatedDraftFragment = async () => ({
    ad_object_id: "found",
  });
  assert.equal(
    (await recovery.createDraftFragmentWithRecovery("draft", {}, {}))
      .ad_object_id,
    "found",
  );
});
test("pending or absent validation is not success", async () => {
  const tx = createDraftImportTransaction("A", "draft");
  tx.tempIds.add("-1");
  for (const status of ["PENDING", "VALIDATED", "HAS_ERRORS"]) {
    const validation = new DraftValidation({
      logging,
      draftRepository: {
        fetchCurrentDraftDetails: async () => ({
          addraft_fragments: {
            data: [
              {
                id: "f",
                values: [draftValueItem("tempID", -1)],
                validation_status: status,
              },
            ],
          },
        }),
      },
    });
    const result = await validation.logDraftValidation("A", "draft", tx);
    assert.equal(result.pending, status === "PENDING");
    assert.equal(result.invalid, status === "HAS_ERRORS" ? 1 : 0);
  }
});
test("full import orchestration creates a complete paused result with an immutable runtime", async () => {
  const state = stateForImport();
  state.importStatus = "PAUSED";
  const calls = [];
  let id = 0;
  const services = createServices({
    state,
    dom: {},
    logger: logging,
    overrides: {
      sessionService: { initializeSession: async () => {} },
      accountContextService: {
        fetchAccountContext: async () => ({ catalogs: [] }),
      },
      mappingController: {
        refreshImportAccountContext: async () => {},
        enforceImportModeConstraints() {},
      },
      identityService: {
        resetPageIdentityProvisionCache() {},
        preflightImportCreativeIdentities: async () => {},
      },
      mediaPreflight: {
        runMediaPreflightAndApplyDecision: async (p) => ({
          proceed: true,
          packageData: p,
        }),
      },
      pixelService: { resolvePixelMap: async () => ({}) },
      creativeService: { resolveCreativeImport: async () => "creative" },
      graphClient: {
        graphFetch: async (path, options) => {
          calls.push({ path, ...options });
          return { id: String(++id) };
        },
      },
    },
  });
  assert.equal(
    await services.importWorkflow.importPackage({ reloadOnSuccess: false }),
    true,
  );
  assert.equal(state.operationReport.isComplete(), true);
  assert.equal(calls.length, 3);
  assert.ok(calls.every((x) => x.body.status === "PAUSED"));
});
test("cancelled media preflight creates no catalog or campaign", async () => {
  const state = stateForImport();
  let writes = 0;
  const services = createServices({
    state,
    dom: {},
    logger: logging,
    overrides: {
      sessionService: { initializeSession: async () => {} },
      accountContextService: { fetchAccountContext: async () => ({}) },
      mappingController: {
        refreshImportAccountContext: async () => {},
        enforceImportModeConstraints() {},
      },
      identityService: { resetPageIdentityProvisionCache() {} },
      mediaPreflight: {
        runMediaPreflightAndApplyDecision: async (p) => ({
          proceed: false,
          packageData: p,
        }),
      },
      catalogMappingService: {
        planCatalogMappingsForImport: async () => {
          writes++;
        },
      },
      directWriter: {
        createCampaign: async () => {
          writes++;
        },
      },
    },
  });
  assert.equal(
    await services.importWorkflow.importPackage({ reloadOnSuccess: false }),
    false,
  );
  assert.equal(writes, 0);
  assert.equal(state.operationCancelled, true);
});
test("zero ads, partial result and uncertainty are represented explicitly", () => {
  const empty = new OperationReport({
    kind: "import",
    packageData: { ads: [], adsets: [] },
  });
  empty.record("campaign", "1");
  assert.equal(empty.finish(true).status, "partial");
  const uncertain = new OperationReport({ kind: "import" });
  uncertain.issue("lost response", { uncertain: true });
  assert.equal(uncertain.finish(false).status, "needs_review");
  assert.doesNotThrow(() => JSON.stringify(uncertain));
});
