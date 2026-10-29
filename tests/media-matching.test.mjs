import assert from "node:assert/strict";
import test from "node:test";

import {
  isOptionalMediaSlot,
  matchMediaSlots,
} from "../src/media/media-matching.mjs";

const image = {
  key: "cr1:afs_image_0",
  slotKind: "asset_feed_image",
  expectedFileName: "SlimTeaPro-ad__image_01.jpg",
  creativeName: "SlimTeaPro-ad",
};
const video = {
  key: "cr1:afs_video_0",
  slotKind: "asset_feed_video",
  expectedFileName: "SlimTeaPro-ad__video_01.mp4",
  creativeName: "SlimTeaPro-ad",
};
const thumb = {
  key: "cr1:afs_vthumb_0",
  slotKind: "asset_feed_video_thumbnail",
  expectedFileName: "SlimTeaPro-ad__thumbnail_01.jpg",
  creativeName: "SlimTeaPro-ad",
};

test("a dropped file fills the slot with the same exported name", () => {
  const files = new Map([["SlimTeaPro-ad__image_01.jpg", { name: "SlimTeaPro-ad__image_01.jpg" }]]);
  const result = matchMediaSlots({ slots: [image, video], files });
  assert.equal(result.matched, 1);
  assert.equal(result.missing, 1);
  assert.equal(result.rows[0].status, "matched");
  assert.equal(result.rows[1].status, "missing");
});

test("an empty thumbnail is optional, not missing", () => {
  assert.equal(isOptionalMediaSlot(thumb), true);
  assert.equal(isOptionalMediaSlot(image), false);
  const result = matchMediaSlots({ slots: [image, thumb] });
  assert.equal(result.missing, 1);
  assert.equal(result.rows[1].status, "optional");
});

test("a manual pick wins over the name and clears the missing counter", () => {
  const files = new Map([["renamed.mp4", { name: "renamed.mp4" }]]);
  const overrides = new Map([[video.key, files.get("renamed.mp4")]]);
  const result = matchMediaSlots({ slots: [video], files, overrides });
  assert.equal(result.matched, 1);
  assert.equal(result.missing, 0);
  assert.equal(result.rows[0].chosen.name, "renamed.mp4");
});

test("file names are offered sorted so the picker is stable", () => {
  const files = new Map([
    ["b.jpg", { name: "b.jpg" }],
    ["a.jpg", { name: "a.jpg" }],
  ]);
  const result = matchMediaSlots({ slots: [image], files });
  assert.deepEqual(result.names, ["a.jpg", "b.jpg"]);
});
