import assert from "node:assert/strict";
import test from "node:test";

import { mediaBaseName } from "../src/domain/package.mjs";
import { CloneWorkflow } from "../src/workflows/clone-workflow.mjs";

test("media names are compared without the extension", () => {
  assert.equal(mediaBaseName("tel__image_01.jpg"), "tel__image_01");
  assert.equal(mediaBaseName("tel__image_01.webp"), "tel__image_01");
  assert.equal(mediaBaseName("GIRL__VIDEO.MP4"), "girl__video");
  assert.equal(mediaBaseName("noext"), "noext");
  assert.equal(mediaBaseName(""), "");
});

test("a local webp fills the .jpg slot instead of a remote copy", async () => {
  const local = { name: "tel__image_01.webp", type: "image/webp" };
  const workflow = new CloneWorkflow({
    state: { cloneMediaFiles: new Map([["tel__image_01.webp", local]]) },
    logging: { log: () => {} },
    downloadService: {
      createRemoteMediaFile: (file) => ({ remote: true, ...file }),
    },
  });
  const files = await workflow.buildMediaFilesFromPackage({
    _downloadQueue: [
      { fileName: "tel__image_01.jpg", sourceUrl: "https://example.invalid/a" },
      {
        fileName: "girl__image_01.jpg",
        sourceUrl: "https://example.invalid/b",
      },
    ],
  });
  assert.equal(files.get("tel__image_01.jpg"), local, "the local file wins");
  assert.equal(
    files.get("girl__image_01.jpg")?.remote,
    true,
    "a slot without a local file keeps the server-side copy",
  );
  assert.equal(files.has("tel__image_01.webp"), false, "no duplicate entry");
});
