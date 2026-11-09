import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { DownloadService } from "../src/media/download-service.mjs";
import { CatalogDiscovery } from "../src/catalog/catalog-discovery.mjs";

const service = new DownloadService({ logging: { log: () => {} } });

test("a WebP creative is saved with a .webp name, not the export .jpg name", () => {
  const blob = new Blob(["x"], { type: "image/webp" });
  assert.equal(
    service.getFileNameForBlob("woman_image_01.jpg", blob),
    "woman_image_01.webp",
  );
  assert.equal(
    service.getFileNameForBlob("boy_image_01", blob),
    "boy_image_01.webp",
  );
});

test("matching formats keep their name", () => {
  assert.equal(
    service.getFileNameForBlob(
      "a_image_01.jpg",
      new Blob(["x"], { type: "image/jpeg" }),
    ),
    "a_image_01.jpg",
  );
  assert.equal(
    service.getFileNameForBlob(
      "clip_video_01.mp4",
      new Blob(["x"], { type: "video/mp4" }),
    ),
    "clip_video_01.mp4",
  );
});

test("an unknown content type leaves the name untouched", () => {
  assert.equal(
    service.getFileNameForBlob(
      "odd_image_01.jpg",
      new Blob(["x"], { type: "application/octet-stream" }),
    ),
    "odd_image_01.jpg",
  );
});

test("the export never opens media in browser tabs", async () => {
  const source = await readFile(
    new URL("../src/workflows/export-workflow.mjs", import.meta.url),
    "utf8",
  );
  assert.ok(!source.includes("browserNativeDownloads"));
  assert.ok(!source.includes("triggerBrowserNativeDownload"));
});

test("the failure dialog offers no browser download", async () => {
  const source = await readFile(
    new URL("../src/ui/dialogs.mjs", import.meta.url),
    "utf8",
  );
  assert.ok(!source.includes('data-choice="browser"'));
});

test("DPA hints recover a catalog creative that has no direct Graph references", () => {
  const discovery = new CatalogDiscovery({ logging: { log() {} } });
  const result = discovery.filterDpaCatalogHintsToPackageReferences(
    {
      campaign: {},
      adsets: [],
      ads: [],
      creatives: [
        {
          id: "creative",
          raw: { object_story_spec: { template_data: {} } },
        },
      ],
    },
    {
      catalogs: [{ id: "1036526192410153", name: "hu_par_27" }],
      productSets: [
        {
          id: "1606763334582799",
          name: "All Products",
          product_catalog: { id: "1036526192410153" },
        },
      ],
    },
  );
  assert.equal(result.catalogs.length, 1);
  assert.equal(result.catalogs[0].name, "hu_par_27");
  assert.equal(result.productSets.length, 1);
});

test("a product_set_id without a catalog ID does not hide DPA catalog hints", () => {
  const discovery = new CatalogDiscovery({ logging: { log() {} } });
  const result = discovery.filterDpaCatalogHintsToPackageReferences(
    {
      campaign: {},
      adsets: [],
      ads: [],
      creatives: [
        {
          id: "creative",
          raw: {
            product_set_id: "1606763334582799",
            object_story_spec: { template_data: {} },
          },
        },
      ],
    },
    {
      catalogs: [{ id: "1036526192410153", name: "hu_par_27" }],
      productSets: [
        {
          id: "2419700891847790",
          name: "All Products",
          product_catalog: { id: "1036526192410153" },
        },
      ],
    },
  );
  assert.equal(result.catalogs.length, 1);
  assert.equal(result.catalogs[0].id, "1036526192410153");
});
