import assert from "node:assert/strict";
import test from "node:test";

import { ExportWorkflow } from "../src/workflows/export-workflow.mjs";
import { DownloadService } from "../src/media/download-service.mjs";
import {
  indexMediaFilesBySha256,
  sha256Blob,
} from "../src/media/media-hashes.mjs";
import { matchMediaSlots } from "../src/media/media-matching.mjs";
import { MediaSlots } from "../src/media/media-slots.mjs";
import { AdReplicaState } from "../src/state/ad-replica-state.mjs";
import { OperationReport } from "../src/operations/operation-report.mjs";

const WEBP_BYTES = new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4]);

function exportedFixture() {
  return {
    version: 1,
    source: {
      accountId: "100001",
      campaignId: "200001",
      campaignName: "WebP campaign",
    },
    campaign: { id: "200001", name: "WebP campaign" },
    adsets: [{ id: "300001", name: "Ad set" }],
    ads: [
      {
        id: "400001",
        name: "Ad",
        adset: { id: "300001" },
        creative: { id: "500001" },
      },
    ],
    creatives: [
      {
        id: "500001",
        name: "Creative",
        raw: {
          object_story_spec: {
            page_id: "600001",
            link_data: { image_hash: "source-image-hash" },
          },
        },
      },
    ],
    catalogs: [],
    productSets: [],
    catalogExports: [],
    fileNameMap: { "source-image-hash.jpg": "Ad__image_01.jpg" },
    files: [{ type: "image", fileName: "Ad__image_01.jpg" }],
    warnings: [],
    _downloadQueue: [
      {
        type: "image",
        fileName: "Ad__image_01.jpg",
        sourceUrl: "https://example.test/image",
        sourceAccountId: "100001",
        sourceId: "source-image-hash",
        sourceKind: "adimage",
      },
    ],
  };
}

test("SHA-256 is calculated from bytes and indexes a renamed file", async () => {
  const file = new File(["hello"], "anything.bin");
  const hash = await sha256Blob(file);
  assert.equal(
    hash,
    "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
  );
  const index = await indexMediaFilesBySha256([file]);
  assert.equal(index.get(hash), file);
});

test("export writes JSON last with real MIME names and import matches by hash", async () => {
  const packageData = exportedFixture();
  const state = new AdReplicaState();
  state.exportAccountId = "100001";
  state.exportCampaignId = "200001";
  state.operationReport = new OperationReport({
    kind: "export",
    accountId: "100001",
  });
  const downloads = [];
  const order = [];
  const downloadService = new DownloadService({
    logging: { log() {} },
  });
  const workflow = new ExportWorkflow({
    state,
    logging: { log() {} },
    panelView: { setBusy() {} },
    sessionService: { initializeSession: async () => {} },
    campaignExporter: { fetchCampaignExportPackage: async () => packageData },
    downloadService: {
      downloadFile: async () => {
        order.push("media");
        return new Blob([WEBP_BYTES], { type: "image/webp" });
      },
      getFileNameForBlob:
        downloadService.getFileNameForBlob.bind(downloadService),
      triggerDownload: (name, blob) => {
        order.push(name.endsWith(".json") ? "json" : "download");
        downloads.push({ name, blob });
      },
    },
    dialogs: { askMediaDownloadFailureDecision: async () => "cancel" },
  });

  assert.equal(await workflow.exportSelectedCampaign(), true);
  assert.deepEqual(order, ["media", "download", "json"]);
  assert.equal(downloads[0].name, "Ad__image_01.webp");
  const savedPackage = JSON.parse(await downloads[1].blob.text());
  const media = savedPackage.files[0];
  assert.equal(media.fileName, "Ad__image_01.webp");
  assert.equal(media.originalFileName, "Ad__image_01.jpg");
  assert.equal(media.mimeType, "image/webp");
  assert.match(media.sha256, /^[a-f0-9]{64}$/);
  assert.equal(media.mediaId, `sha256:${media.sha256}`);
  assert.equal(media.sourceId, "source-image-hash");
  assert.equal(
    savedPackage.fileNameMap["source-image-hash.jpg"],
    "Ad__image_01.webp",
  );
  assert.equal(savedPackage._downloadQueue, undefined);

  const renamed = new File([WEBP_BYTES], "manually-renamed.data", {
    type: "image/webp",
  });
  const hashes = await indexMediaFilesBySha256([renamed]);
  const importState = new AdReplicaState();
  importState.importPackage = savedPackage;
  const staleSameName = new File(["stale bytes"], "Ad__image_01.webp");
  importState.importMediaFiles = new Map([
    [renamed.name, renamed],
    [staleSameName.name, staleSameName],
  ]);
  importState.importMediaHashes = hashes;
  const slotsService = new MediaSlots({
    state: importState,
    sourceImageRecoveryCache: new Map(),
    sourceVideoRecoveryCache: new Map(),
  });
  const [slot] = slotsService.getCreativeMediaSlots(
    savedPackage.creatives[0],
  );
  assert.equal(slot.expectedFileName, "Ad__image_01.webp");
  assert.equal(slot.expectedSha256, media.sha256);
  assert.equal(slotsService.getDefaultMediaFile(slot), renamed);
  assert.equal(
    slotsService.resolveImportedMediaFile(
      "500001:image",
      "source-image-hash.jpg",
    ),
    renamed,
  );
  const match = matchMediaSlots({
    slots: [slot],
    files: importState.importMediaFiles,
    fileHashes: hashes,
  });
  assert.equal(match.missing, 0);
  assert.equal(match.rows[0].chosen, renamed);
});

test("packages without hashes keep exact-name compatibility", () => {
  const file = new File(["old"], "old-name.jpg");
  const result = matchMediaSlots({
    slots: [{ key: "old", expectedFileName: "old-name.jpg" }],
    files: new Map([[file.name, file]]),
    fileHashes: new Map(),
  });
  assert.equal(result.rows[0].status, "matched");
});
