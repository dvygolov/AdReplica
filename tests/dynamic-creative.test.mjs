import assert from "node:assert/strict";
import test from "node:test";

import { AdReplicaState } from "../src/state/ad-replica-state.mjs";
import { DirectWriter } from "../src/writers/direct-writer.mjs";
import { DraftWriter } from "../src/writers/draft-writer.mjs";
import {
  buildImportedCreativePayload,
  remapCreativeSequence,
  stripAssetFeedLabelIdsForImport,
} from "../src/domain/creative.mjs";
import { CreativeMedia } from "../src/creative/creative-media.mjs";
import { createServices } from "../src/app/create-services.mjs";

const logging = { log() {} };

function adsetFixture() {
  return {
    id: "source-adset",
    name: "Dynamic ad set",
    optimization_goal: "OFFSITE_CONVERSIONS",
    billing_event: "IMPRESSIONS",
    targeting: { geo_locations: { countries: ["US"] } },
    asset_feed_id: "source-asset-feed",
    creative_sequence: ["source-creative"],
  };
}

test("cross-account ad set writers do not copy source asset feed or sequence IDs", async () => {
  const state = new AdReplicaState();
  state.importPackage = { source: { accountId: "100001" } };
  const calls = [];
  const direct = new DirectWriter({
    state,
    graphClient: {
      graphFetch: async (path, options) => {
        calls.push({ path, ...options });
        return { id: "target-adset" };
      },
    },
    scheduleService: { cleanTargeting: (value) => value },
  });
  await direct.createAdset("200001", "target-campaign", adsetFixture(), {});
  assert.equal(calls[0].body.asset_feed_id, undefined);
  assert.equal(calls[0].body.creative_sequence, undefined);

  const draftCalls = [];
  const draft = new DraftWriter({
    state,
    logging,
    sessionService: { getDraftApplicationId: () => "app" },
    scheduleService: { cleanTargeting: (value) => value },
    draftRecovery: {
      createDraftFragmentWithRecovery: async (draftId, body) => {
        draftCalls.push(body);
        return { id: "fragment", ad_object_id: "draft-adset" };
      },
    },
  });
  await draft.createAdsetDraft(
    "200001",
    "draft",
    "draft-campaign",
    adsetFixture(),
    {},
  );
  const fields = new Map(
    draftCalls[0].values.map((item) => [item.field, item.new_value]),
  );
  assert.equal(fields.has("asset_feed_id"), false);
  assert.equal(fields.has("creative_sequence"), false);
});

test("same-account asset feed can be reused but sequence is still remapped later", async () => {
  const state = new AdReplicaState();
  state.importPackage = { source: { accountId: "100001" } };
  let body;
  const writer = new DirectWriter({
    state,
    graphClient: {
      graphFetch: async (_path, options) => {
        body = options.body;
        return { id: "target-adset" };
      },
    },
    scheduleService: { cleanTargeting: (value) => value },
  });
  await writer.createAdset("100001", "campaign", adsetFixture(), {});
  assert.equal(body.asset_feed_id, "source-asset-feed");
  assert.equal(body.creative_sequence, undefined);
});

test("creative sequence remaps arrays, JSON and object references", () => {
  const map = new Map([
    ["old-1", "new-1"],
    ["old-2", "new-2"],
  ]);
  assert.deepEqual(remapCreativeSequence(["old-1", "old-2"], map), [
    "new-1",
    "new-2",
  ]);
  assert.deepEqual(remapCreativeSequence('["old-2","old-1"]', map), [
    "new-2",
    "new-1",
  ]);
  assert.deepEqual(
    remapCreativeSequence([{ creative_id: "old-1" }], map),
    [{ creative_id: "new-1" }],
  );
  assert.throws(
    () => remapCreativeSequence(["missing"], map),
    /no target creative was created/,
  );
});

test("dynamic creative golden fixture keeps languages and rules but no source media IDs", async () => {
  const raw = {
    asset_feed_spec: {
      locales: ["en_US", "ru_RU", "de_DE"],
      bodies: Array.from({ length: 9 }, (_, index) => ({
        text: `Body ${index + 1}`,
        adlabels: [{ id: `label-body-${index}`, name: `lang-${index}` }],
      })),
      titles: [{ text: "English" }, { text: "Русский" }, { text: "Deutsch" }],
      descriptions: [{ text: "Description" }],
      link_urls: [{ website_url: "https://example.test/{locale}" }],
      images: [{ hash: "source-image" }],
      videos: [{ video_id: "source-video" }],
      asset_customization_rules: [
        {
          customization_spec: { locales: ["ru_RU"] },
          body_label: { id: "label-rule", name: "ru" },
        },
      ],
    },
  };
  const state = new AdReplicaState();
  state.importPackage = { fileNameMap: {} };
  const media = new CreativeMedia({
    state,
    logging,
    mediaSlots: {
      getCreativeMediaSlots: () => [],
      resolveImportedMediaFile: (key) => ({
        name: `${key}.bin`,
      }),
      recoverSlotMediaFromSource: async () => null,
    },
    imageService: {
      uploadImageAsset: async () => ({
        hash: "target-image",
        url: "https://example.test/target-image",
      }),
    },
    videoService: {
      uploadVideo: async () => "target-video",
      getPreferredVideoThumbnail: async () =>
        "https://example.test/target-thumb",
    },
  });
  const creative = { id: "creative", name: "Nine languages", raw };
  const afs = raw.asset_feed_spec;
  assert.equal(
    await media.replaceAssetFeedMedia("200001", creative, {}, afs, {
      images: new Map(),
      videos: new Map(),
    }),
    true,
  );
  stripAssetFeedLabelIdsForImport(afs);
  const payload = buildImportedCreativePayload(raw);
  assert.equal(payload.asset_feed_spec.bodies.length, 9);
  assert.deepEqual(payload.asset_feed_spec.locales, ["en_US", "ru_RU", "de_DE"]);
  assert.equal(
    payload.asset_feed_spec.asset_customization_rules[0].body_label.name,
    "ru",
  );
  assert.equal(
    payload.asset_feed_spec.asset_customization_rules[0].body_label.id,
    undefined,
  );
  assert.equal(payload.asset_feed_spec.images[0].hash, "target-image");
  assert.equal(payload.asset_feed_spec.videos[0].video_id, "target-video");
  const serialized = JSON.stringify(payload);
  assert.ok(!serialized.includes("source-image"));
  assert.ok(!serialized.includes("source-video"));
  assert.ok(!serialized.includes("label-rule\""));
});

test("direct import writes the remapped sequence after creating creatives", async () => {
  const state = new AdReplicaState();
  state.importAccountId = "200001";
  state.importAsDraft = false;
  state.importStatus = "PAUSED";
  state.importCampaignName = "Dynamic clone";
  state.importPackage = {
    source: { accountId: "100001", campaignName: "Dynamic source" },
    campaign: { id: "campaign", name: "Dynamic source" },
    adsets: [adsetFixture()],
    ads: [
      {
        id: "ad",
        name: "Ad",
        adset: { id: "source-adset" },
        creative: { id: "source-creative" },
      },
    ],
    creatives: [{ id: "source-creative", name: "Creative", raw: {} }],
    catalogs: [],
    productSets: [],
  };
  const calls = [];
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
        runMediaPreflightAndApplyDecision: async (packageData) => ({
          proceed: true,
          packageData,
        }),
      },
      pixelService: { resolvePixelMap: async () => ({}) },
      creativeService: { resolveCreativeImport: async () => "target-creative" },
      graphClient: {
        graphFetch: async (path, options) => {
          calls.push({ path, ...options });
          const ids = {
            "act_200001/campaigns": "target-campaign",
            "act_200001/adsets": "target-adset",
            "act_200001/ads": "target-ad",
          };
          return { id: ids[path] || path };
        },
      },
    },
  });
  assert.equal(
    await services.importWorkflow.importPackage({ reloadOnSuccess: false }),
    true,
  );
  const createAdset = calls.find((call) => call.path === "act_200001/adsets");
  assert.equal(createAdset.body.asset_feed_id, undefined);
  assert.equal(createAdset.body.creative_sequence, undefined);
  const sequenceUpdate = calls.find(
    (call) =>
      call.path === "target-adset" && call.body?.creative_sequence !== undefined,
  );
  assert.deepEqual(sequenceUpdate.body.creative_sequence, ["target-creative"]);
  assert.ok(
    calls.findIndex((call) => call.path === "act_200001/ads") <
      calls.indexOf(sequenceUpdate),
  );
});
