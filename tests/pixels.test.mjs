import test from "node:test";
import assert from "node:assert/strict";
import { PixelService } from "../src/pixels/pixel-service.mjs";
import { AdReplicaState } from "../src/state/ad-replica-state.mjs";
import { OperationReport } from "../src/operations/operation-report.mjs";

const ACCOUNT_ID = "3950356461902900";
const SOURCE_PIXEL_ID = "111222333444555";
const EXISTING_PIXEL_ID = "2457052461465059";

function createPixelService({
  pixelLists = [[]],
  createResult = null,
  createError = null,
} = {}) {
  const state = new AdReplicaState();
  state.importPackage = { source: { campaignName: "Lang Test" } };
  state.operationReport = new OperationReport({
    kind: "import",
    accountId: ACCOUNT_ID,
    campaignName: "Lang Test",
  });
  const logs = [];
  const calls = [];
  let listIndex = 0;
  const graphClient = {
    async graphFetch(path, options = {}) {
      calls.push({ path, method: options.method || "GET", body: options.body });
      if (createError) throw createError;
      return createResult || { id: "999888777666555" };
    },
    async graphGetAll(path) {
      calls.push({ path, method: "GETALL" });
      const list = pixelLists[Math.min(listIndex, pixelLists.length - 1)];
      listIndex += 1;
      return list;
    },
  };
  const service = new PixelService({
    state,
    logging: {
      log(level, message, detail) {
        logs.push({ level, message, detail });
      },
    },
    graphClient,
    accountContextService: { invalidateAccountContextCache() {} },
    mediaSlots: { getImportSourcePixels: () => [{ id: SOURCE_PIXEL_ID }] },
  });
  return { service, state, logs, calls };
}

const createPosts = (calls) =>
  calls.filter(
    (call) => call.method === "POST" && call.path.endsWith("/adspixels"),
  );

test("account that already has a pixel reuses it without a failing create call", async () => {
  const { service, state, logs, calls } = createPixelService({
    pixelLists: [[{ id: EXISTING_PIXEL_ID, name: "Imported_previous" }]],
  });

  const pixelId = await service.createPixel(
    ACCOUNT_ID,
    SOURCE_PIXEL_ID,
    "Lang Test",
  );

  assert.equal(pixelId, EXISTING_PIXEL_ID);
  assert.equal(createPosts(calls).length, 0, "no pixel creation is attempted");
  assert.ok(
    calls.some((call) => call.path === `act_${ACCOUNT_ID}/adspixels`),
    "the account pixel list is consulted",
  );
  assert.ok(
    logs.some(
      (entry) =>
        entry.level === "warn" && entry.message.includes(EXISTING_PIXEL_ID),
    ),
  );
  const pixels = state.operationReport.created.filter(
    (x) => x.type === "pixel",
  );
  assert.equal(pixels.length, 1);
  assert.equal(pixels[0].id, EXISTING_PIXEL_ID);
  assert.equal(pixels[0].reused, true);
  assert.match(
    state.operationReport.issues[0].message,
    /Reused existing pixel/,
  );
});

test("#6200 from a stale cache falls back to the account pixel", async () => {
  const alreadyExists = Object.assign(new Error("(#6200)"), {
    details: {
      code: 6200,
      message: "(#6200) A pixel already exists for this account",
    },
  });
  const { service } = createPixelService({
    pixelLists: [[], [{ id: EXISTING_PIXEL_ID, name: "Imported_previous" }]],
    createError: alreadyExists,
  });

  const pixelId = await service.createPixel(
    ACCOUNT_ID,
    SOURCE_PIXEL_ID,
    "Lang Test",
  );

  assert.equal(pixelId, EXISTING_PIXEL_ID);
});

test("account without pixels still creates one", async () => {
  const { service, state, calls } = createPixelService({ pixelLists: [[]] });

  const pixelId = await service.createPixel(
    ACCOUNT_ID,
    SOURCE_PIXEL_ID,
    "Lang Test",
  );

  assert.equal(pixelId, "999888777666555");
  assert.equal(createPosts(calls).length, 1);
  assert.equal(state.operationReport.created[0].id, "999888777666555");
});

test("unrelated pixel creation errors are not swallowed", async () => {
  const denied = Object.assign(new Error('{"code":200}'), {
    details: { code: 200, message: "Permissions error" },
  });
  const { service } = createPixelService({
    pixelLists: [[]],
    createError: denied,
  });

  await assert.rejects(
    () => service.createPixel(ACCOUNT_ID, SOURCE_PIXEL_ID, "Lang Test"),
    (error) => {
      assert.equal(error.details.code, 200);
      return true;
    },
  );
});

test("placeholder source ids never reach the pixel name", async () => {
  const { service, state } = createPixelService({ pixelLists: [[]] });
  await service.createPixel(ACCOUNT_ID, "__create__", "Lang Test");
  const pixel = state.operationReport.created.find((x) => x.type === "pixel");
  assert.ok(pixel, "pixel is recorded");
  assert.doesNotMatch(pixel.name, /__create__/);
  assert.match(pixel.name, /_source$/);
});
