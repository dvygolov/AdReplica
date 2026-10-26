import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assessAccountHealth,
  describeAccountStatus,
  explainDraftFragmentErrors,
  findAccountStatus,
  isTransientFragmentFailure,
} from "../src/accounts/account-health.mjs";
import { OperationReport } from "../src/operations/operation-report.mjs";

const accounts = [
  { id: "111", raw: { account_status: 1 } },
  { id: "act_222", raw: { account_status: 3 } },
  { id: "333", raw: { account_status: 2 } },
  { id: "444" },
];

test("active account is usable", () => {
  const health = assessAccountHealth(accounts, "111");
  assert.equal(health.ok, true);
  assert.equal(health.code, 1);
  assert.equal(health.unknown, false);
});

test("act_ prefix and raw id are both accepted", () => {
  assert.equal(findAccountStatus(accounts, "act_222"), 3);
  assert.equal(findAccountStatus(accounts, "222"), 3);
});

test("unsettled account is rejected with the status spelled out", () => {
  const health = assessAccountHealth(accounts, "222");
  assert.equal(health.ok, false);
  assert.equal(health.code, 3);
  assert.match(health.message, /not active/);
  assert.match(health.message, /unsettled/);
  assert.match(health.message, /1487194/);
});

test("disabled account is rejected", () => {
  assert.equal(assessAccountHealth(accounts, "333").ok, false);
});

test("missing status stays unknown but does not block the run", () => {
  const health = assessAccountHealth(accounts, "444");
  assert.equal(health.ok, true);
  assert.equal(health.unknown, true);
  assert.equal(findAccountStatus(accounts, "555"), null);
  assert.equal(assessAccountHealth([], "555").ok, true);
});

test("status labels fall back to the raw code", () => {
  assert.equal(describeAccountStatus(1), "active");
  assert.equal(describeAccountStatus(3), "unsettled");
  assert.equal(describeAccountStatus(42), "status 42");
  assert.equal(describeAccountStatus(undefined), "unknown");
});

test("notices never downgrade a complete run to partial", () => {
  const report = new OperationReport({
    kind: "clone",
    accountId: "111",
    campaignName: "c",
    mode: "DRAFT",
    packageData: { adsets: [{ id: "a1" }], ads: [{ id: "d1" }] },
  });
  report.record("campaign", "c1", "c");
  report.record("adset", "a1", "as");
  report.record("ad", "d1", "ad");
  report.notice("Reused existing pixel 999 on act_111.", { stage: "pixel" });
  report.finish(true);
  assert.equal(report.status, "success");
  assert.equal(report.notices.length, 1);
  assert.equal(report.issues.length, 0);
  assert.match(report.toText(), /NOTE pixel: Reused existing pixel 999/);
});

test("a real issue still marks the run partial", () => {
  const report = new OperationReport({
    kind: "clone",
    accountId: "111",
    campaignName: "c",
    mode: "DRAFT",
    packageData: { adsets: [{ id: "a1" }], ads: [{ id: "d1" }] },
  });
  report.record("campaign", "c1", "c");
  report.record("adset", "a1", "as");
  report.record("ad", "d1", "ad");
  report.issue("page mapping missing", { stage: "preflight" });
  report.finish(true);
  assert.equal(report.status, "partial");
});

test("billing blockers are explained instead of reported as bare fragment counts", () => {
  const messages = explainDraftFragmentErrors([
    {
      ad_object_type: "ad",
      validation_status: "HAS_ERRORS",
      active_errors: [
        {
          error_code: 1359188,
          error_summary: "No Payment Method",
          error_description: "Update payment method in the billing center.",
        },
      ],
    },
  ]);
  assert.equal(messages.length, 1);
  assert.match(messages[0], /no payment method/i);
  assert.match(messages[0], /Billing/);

  const permission = explainDraftFragmentErrors([
    {
      ad_object_type: "ad",
      active_errors: [
        { error_code: 1487194, error_summary: "Permission Error" },
      ],
    },
  ]);
  assert.match(permission[0], /1487194/);
});

test("unknown fragment errors keep the Meta wording and code", () => {
  const [message] = explainDraftFragmentErrors([
    {
      ad_object_type: "ad_set",
      active_errors: [{ error_code: 2446885, error_summary: "Invalid budget" }],
    },
  ]);
  assert.match(message, /ad_set/);
  assert.match(message, /Invalid budget/);
  assert.match(message, /2446885/);
});

test("fragment errors are deduplicated and empty input is safe", () => {
  assert.deepEqual(explainDraftFragmentErrors(null), []);
  assert.deepEqual(explainDraftFragmentErrors([]), []);
  const duplicated = explainDraftFragmentErrors([
    { ad_object_type: "ad", active_errors: [{ error_code: 1359188 }] },
    { ad_object_type: "ad", active_errors: [{ error_code: 1359188 }] },
  ]);
  assert.equal(duplicated.length, 1);
});

test("publishing errors that clear on a re-check are treated as transient", () => {
  assert.equal(
    isTransientFragmentFailure([
      {
        ad_object_type: "ad",
        active_errors: [
          { error_type: "AD_DRAFT_PUBLISHING", error_code: 1359188 },
        ],
      },
    ]),
    true,
  );
  assert.equal(
    isTransientFragmentFailure([
      {
        ad_object_type: "ad",
        active_errors: [
          { error_type: "AD_DRAFT_PUBLISHING", error_code: 1487194 },
        ],
      },
    ]),
    false,
    "a permission error is not transient",
  );
  assert.equal(
    isTransientFragmentFailure([
      { ad_object_type: "ad", active_errors: [{ error_code: 2446885 }] },
    ]),
    false,
  );
  assert.equal(isTransientFragmentFailure([]), false);
  assert.equal(isTransientFragmentFailure(null), false);
});
