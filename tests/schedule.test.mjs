import assert from "node:assert/strict";
import test from "node:test";

import { buildShiftedScheduleWindow } from "../src/domain/schedule.mjs";
import { ScheduleService } from "../src/workflows/schedule-service.mjs";

const NOW = new Date("2027-01-10T00:00:00.000Z");
const ANCHOR = new Date("2027-01-10T00:05:00.000Z");

function shift(sourceStart, sourceEnd, options = {}) {
  return buildShiftedScheduleWindow(sourceStart, sourceEnd, {
    anchor: ANCHOR,
    now: NOW,
    ...options,
  });
}

test("a future start and end are cloned exactly as scheduled", () => {
  const window = shift("2027-03-01T10:00:00+0300", "2027-03-05T10:00:00+0300");
  assert.deepEqual(window, {
    start: "2027-03-01T07:00:00.000Z",
    end: "2027-03-05T07:00:00.000Z",
  });
});

test("a start in the next few minutes is kept, not pushed to the anchor", () => {
  const window = shift("2027-01-10T00:02:00.000Z", "2027-01-12T00:02:00.000Z");
  assert.equal(window.start, "2027-01-10T00:02:00.000Z");
  assert.equal(window.end, "2027-01-12T00:02:00.000Z");
});

test("a start that already passed moves to now and keeps its duration", () => {
  const window = shift("2027-01-01T10:00:00.000Z", "2027-01-03T10:00:00.000Z");
  assert.equal(window.start, ANCHOR.toISOString());
  assert.equal(window.end, "2027-01-12T00:05:00.000Z");
});

test("a lifetime campaign without an end gets 30 days from the kept start", () => {
  const window = shift("2027-04-01T00:00:00.000Z", "", { requireEnd: true });
  assert.equal(window.start, "2027-04-01T00:00:00.000Z");
  assert.equal(window.end, "2027-05-01T00:00:00.000Z");
});

test("an end without a start starts now and ends in 30 days", () => {
  const window = shift("", "2027-02-01T00:00:00.000Z");
  assert.equal(window.start, ANCHOR.toISOString());
  assert.equal(window.end, "2027-02-09T00:05:00.000Z");
});

test("no schedule stays empty", () => {
  assert.deepEqual(shift("", ""), { start: "", end: "" });
});

function serviceFor(preserveSchedule) {
  return new ScheduleService({
    state: { importPreserveSchedule: preserveSchedule },
    logging: { log: () => {} },
  });
}

test("clone keeps a future campaign schedule and shifts only past adsets", () => {
  const service = serviceFor(true);
  const packageData = {
    campaign: {
      start_time: "2027-03-01T10:00:00+0300",
      stop_time: "2027-03-05T10:00:00+0300",
    },
    adsets: [
      { name: "inherits-campaign" },
      {
        name: "own-past-schedule",
        start_time: "2027-01-01T00:00:00Z",
        end_time: "2027-01-02T00:00:00Z",
      },
      {
        name: "own-future-schedule",
        start_time: "2027-03-02T00:00:00Z",
        end_time: "2027-03-03T00:00:00Z",
      },
    ],
  };

  const shifted = service.shiftPackageScheduleForImport(packageData);

  assert.equal(shifted.campaign.start_time, "2027-03-01T07:00:00.000Z");
  assert.equal(shifted.campaign.stop_time, "2027-03-05T07:00:00.000Z");
  assert.equal(shifted.adsets[0].start_time, "2027-03-01T07:00:00.000Z");
  assert.equal(shifted.adsets[0].end_time, "2027-03-05T07:00:00.000Z");
  assert.equal(shifted.adsets[2].start_time, "2027-03-02T00:00:00.000Z");
  assert.equal(shifted.adsets[2].end_time, "2027-03-03T00:00:00.000Z");
  assert.ok(
    new Date(shifted.adsets[1].start_time).getTime() > Date.now() - 60_000,
    "past adset start must move to the future",
  );
  assert.equal(
    new Date(shifted.adsets[1].end_time).getTime() -
      new Date(shifted.adsets[1].start_time).getTime(),
    86400000,
  );
  // The source package must stay untouched.
  assert.equal(packageData.campaign.start_time, "2027-03-01T10:00:00+0300");
});

test("manual import without schedule preservation leaves dates untouched", () => {
  const service = serviceFor(false);
  const packageData = {
    campaign: { start_time: "2027-03-01T10:00:00+0300" },
    adsets: [{ start_time: "2027-01-01T00:00:00Z" }],
  };
  assert.equal(service.shiftPackageScheduleForImport(packageData), packageData);
});
