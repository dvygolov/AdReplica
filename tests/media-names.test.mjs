import assert from "node:assert/strict";
import test from "node:test";

import { mediaBaseName } from "../src/domain/package.mjs";
import { CloneWorkflow } from "../src/workflows/clone-workflow.mjs";
import { ImageService } from "../src/media/image-service.mjs";
import { assignLocalFiles } from "../src/media/media-matching.mjs";

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

function imageService() {
  return new ImageService({
    logging: { log: () => {} },
    downloadService: {
      getMediaFileName: (file) => file.name,
      isRemoteMediaFile: () => false,
    },
  });
}

const webpHead = () =>
  new Uint8Array([
    0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
    0x56, 0x50, 0x38, 0x20,
  ]);
const jpegHead = () =>
  new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);

test("a .jpg whose bytes are WebP is transcoded", async () => {
  const service = imageService();
  const disguised = new Blob([webpHead()], { type: "image/jpeg" });
  disguised.name = "tel__image_01.jpg";
  assert.equal(await service.shouldTranscodeImageForMeta(disguised), true);

  const jpeg = new Blob([jpegHead()], { type: "image/jpeg" });
  jpeg.name = "tel__image_01.jpg";
  assert.equal(await service.shouldTranscodeImageForMeta(jpeg), false);

  const webp = new Blob([webpHead()], { type: "image/webp" });
  webp.name = "tel__image_01.webp";
  assert.equal(await service.shouldTranscodeImageForMeta(webp), true);
});

test("a single dropped creative fills the single slot whatever its name", () => {
  const dropped = { name: "creative-final.jpg" };
  const { picked, used } = assignLocalFiles(
    ["input__image_01.jpg"],
    new Map([["creative-final.jpg", dropped]]),
  );
  assert.equal(picked.get("input__image_01.jpg"), dropped);
  assert.equal(used.has("creative-final.jpg"), true);
});

test("positional pairing only happens when the counts line up", () => {
  const one = { name: "a.png" };
  const two = { name: "b.png" };
  const files = new Map([
    ["a.png", one],
    ["b.png", two],
  ]);
  const { picked } = assignLocalFiles(
    ["x__image_01.jpg", "y__image_01.jpg", "z__image_01.jpg"],
    files,
  );
  assert.equal(picked.size, 0, "three slots, two files -> no guessing");
});

test("matching by name wins over pairing by position", () => {
  const right = { name: "girl__image_01.webp" };
  const other = { name: "unrelated.jpg" };
  const { picked } = assignLocalFiles(
    ["girl__image_01.jpg", "boy__image_01.jpg"],
    new Map([
      ["unrelated.jpg", other],
      ["girl__image_01.webp", right],
    ]),
  );
  assert.equal(picked.get("girl__image_01.jpg"), right);
  assert.equal(picked.get("boy__image_01.jpg"), other);
});
