import test from "node:test";
import assert from "node:assert/strict";
import { DraftRecovery } from "../src/drafts/draft-recovery.mjs";
import { UncertainWriteError } from "../src/facebook/request-errors.mjs";
import { filterDraftFragmentsForTransaction } from "../src/domain/draft-values.mjs";

const expected = {
  accountId: "123",
  adObjectType: "ad",
  tempId: -42,
  parentAdObjectId: "456",
  label: "ad example",
};
const body = { values: [{ field: "tempID", new_value: -42 }] };
const fragment = (id = "789") => ({
  id: `fragment-${id}`,
  ad_object_id: id,
  ad_object_type: "ad",
  parent_ad_object_id: "456",
  values: [...body.values, { field: "account_id", new_value: "123" }],
});
const failure = () =>
  new UncertainWriteError(
    "draft/addraft_fragments",
    new TypeError("Failed to fetch"),
  );

test("draft write recovery", { concurrency: true }, async (t) => {
  for (const scenario of [
    {
      name: "retries once after three successful empty reads",
      reads: [[], [], [], [fragment()]],
      writes: [failure(), { id: "fragment-789", ad_object_id: "789" }],
      posts: 2,
    },
    {
      name: "recovers original write without repeating POST",
      reads: [[], [fragment()]],
      writes: [failure()],
      posts: 1,
    },
    {
      name: "does not retry when a verification request fails",
      reads: [new Error("offline"), [], []],
      writes: [failure()],
      posts: 1,
      rejects: true,
    },
    {
      name: "does not retry a fragment that has no object ID yet",
      reads: [[{ ...fragment(), ad_object_id: null }], [], []],
      writes: [failure()],
      posts: 1,
      rejects: true,
    },
    {
      name: "stops after a second ambiguous write",
      reads: [[], [], [], [], [], []],
      writes: [failure(), failure()],
      posts: 2,
      rejects: true,
    },
    {
      name: "recovers lost response from retry",
      reads: [[], [], [], [fragment()]],
      writes: [failure(), failure()],
      posts: 2,
    },
    {
      name: "rejects duplicate fragments after retry",
      reads: [
        [],
        [],
        [],
        [fragment(), fragment("790")],
        [fragment(), fragment("790")],
        [fragment(), fragment("790")],
      ],
      writes: [failure(), { ad_object_id: "789" }],
      posts: 2,
      rejects: true,
    },
    {
      name: "does not retry explicit API rejection",
      reads: [],
      writes: [new Error("permission denied")],
      posts: 1,
      rejects: true,
    },
    {
      name: "returns successful initial write without verification",
      reads: [],
      writes: [{ ad_object_id: "789" }],
      posts: 1,
    },
  ]) {
    t.test(scenario.name, async () => {
      let posts = 0;
      let reads = 0;
      const recovery = new DraftRecovery({
        logging: { log() {} },
        graphClient: {
          async graphFetch(_path, options) {
            assert.equal(
              options.body,
              body,
              "retry must preserve the original body and tempID",
            );
            const result = scenario.writes[posts++];
            assert.ok(result, "unexpected POST");
            if (result instanceof Error) throw result;
            return result;
          },
          async graphGetAll() {
            const result = scenario.reads[reads++];
            assert.ok(result, "unexpected verification");
            if (result instanceof Error) throw result;
            return result;
          },
        },
      });
      const run = recovery.createDraftFragmentWithRecovery(
        "999",
        body,
        expected,
      );
      if (scenario.rejects) await assert.rejects(run);
      else assert.equal((await run).ad_object_id, "789");
      assert.equal(posts, scenario.posts);
      assert.equal(reads, scenario.reads.length);
    });
  }
});

test("rollback owns every duplicate with the transaction tempID", () => {
  const duplicates = [fragment(), fragment("790")];
  const unrelated = {
    ...fragment("791"),
    values: [{ field: "tempID", new_value: -43 }],
  };
  assert.deepEqual(
    filterDraftFragmentsForTransaction([...duplicates, unrelated], {
      tempIds: new Set(["-42"]),
    }),
    duplicates,
  );
});
