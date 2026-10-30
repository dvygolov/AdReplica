import assert from "node:assert/strict";
import { test } from "node:test";
import { MassCloneWorkflow } from "../src/workflows/mass-clone-workflow.mjs";
import { MassCloneView } from "../src/ui/mass-clone-view.mjs";

const ACCOUNTS = [
  { id: "111", name: "Good A", raw: { account_status: 1, currency: "USD" } },
  { id: "222", name: "Good B", raw: { account_status: 1, currency: "USD" } },
  { id: "333", name: "Unsettled", raw: { account_status: 3, currency: "USD" } },
  { id: "999", name: "Source", raw: { account_status: 1, currency: "USD" } },
  { id: "444", name: "Euro", raw: { account_status: 1, currency: "EUR" } },
];

function createHarness({
  failFor = [],
  reports = {},
  stopAfterFirst = false,
  rate = { ok: true, rate: 0.9, source: "ECB test" },
} = {}) {
  const state = {
    accounts: ACCOUNTS,
    cloneSourceAccountId: "999",
    cloneSourceCampaignId: "camp-1",
    cloneTargetAccountId: "",
    cloneCampaignName: "",
    cloneAsDraft: true,
    cloneStatus: "PAUSED",
    clonePixelMappings: {},
    massTargets: {
      111: { selected: true, pixelId: "px-111" },
      222: { selected: true, pixelId: "" },
      333: { selected: true, pixelId: "" },
    },
    massMode: "DRAFT",
    massNameTemplate: "{source} — {account}",
    massRunning: false,
    massStop: false,
    massResults: [],
    massActiveAccountId: "",
    lastOperationReport: null,
  };
  const calls = [];
  const logEntries = [];
  const deleted = [];
  let order = 0;
  const packageData = {
    source: { campaignName: "Source Campaign" },
    campaign: { name: "Source Campaign" },
    adsets: [{ promoted_object: { pixel_id: "src-px" } }],
    ads: [{}],
    creatives: [
      { id: "cr-1", raw: { object_story_spec: { page_id: "111222333" } } },
    ],
    catalogs: [{ id: "123456789", name: "Src cat" }],
  };
  const runOperation = async (kind) => {
    const accountId = state.cloneTargetAccountId;
    order += 1;
    calls.push({ accountId, kind, order, name: state.cloneCampaignName });
    const fails = failFor.includes(accountId);
    state.lastOperationReport = fails
      ? {
          status: "failed",
          created: [
            { type: "campaign", id: `c-${accountId}` },
            { type: "adset", id: `s-${accountId}` },
            { type: "ad", id: `a-${accountId}` },
          ],
          issues: reports[accountId]?.issues || [{ message: "boom" }],
          counts: { campaign: 0, adset: 0, ad: 0 },
        }
      : {
          status: "success",
          created: [{ type: "campaign", id: `c-${accountId}` }],
          issues: [],
          counts: { campaign: 1, adset: 1, ad: 1 },
        };
    if (stopAfterFirst && order === 1) state.massStop = true;
    return !fails;
  };
  const workflow = new MassCloneWorkflow({
    state,
    logging: {
      log: (level, message) => logEntries.push({ level, message }),
    },
    graphClient: {
      graphFetch: async (path) => {
        deleted.push(path);
        if (path.startsWith("a-")) throw new Error("cannot delete ad");
        return { success: true };
      },
    },
    draftRepository: {
      clearDraftById: async (accountId, draftId) => {
        deleted.push(`draft:${accountId}:${draftId}`);
        return { deletedCount: 3, failedCount: 0, draftFound: true };
      },
    },
    currencyRateService: {
      // Meta's ratio is the only rate source now.
      metaRate: async () => rate,
    },
    cloneWorkflow: { ensureClonePackageLoaded: async () => packageData },
    renderMassClone: () => {},
    runOperation,
  });
  return { workflow, state, calls, deleted, logEntries, packageData };
}

test("clones every selected target sequentially and skips unusable accounts", async () => {
  const { workflow, state, calls } = createHarness();
  const result = await workflow.run();
  assert.equal(result, true);
  assert.deepEqual(
    calls.map((call) => call.accountId),
    ["111", "222"],
  );
  assert.equal(calls[0].order, 1);
  assert.equal(calls[1].order, 2);
  assert.deepEqual(
    state.massResults.map((row) => row.status),
    ["success", "success", "skipped"],
  );
  assert.match(state.massResults[2].message, /not active/);
  assert.equal(state.massRunning, false);
});

test("a draft-based failure is rolled back by deleting the draft fragments", async () => {
  const { workflow, state, deleted } = createHarness({ failFor: ["222"] });
  workflow.dependencies.runOperation = async () => {
    state.lastOperationReport = {
      status: "failed",
      created: [
        { type: "campaign", id: "c", draftId: "draft-9" },
        { type: "adset", id: "s", draftId: "draft-9" },
        { type: "ad", id: "a", draftId: "draft-9" },
      ],
      issues: [{ message: "ambiguous failure" }],
    };
    return false;
  };
  await workflow.run();
  assert.ok(
    deleted.includes("draft:222:draft-9"),
    "the failed target draft is cleared",
  );
  const row = state.massResults.find((item) => item.accountId === "222");
  assert.deepEqual(row.rollback, { deleted: 3, failed: 0 });
});

test("campaign names use the template with the target account", async () => {
  const { workflow, calls } = createHarness();
  await workflow.run();
  assert.equal(calls[0].name, "Source Campaign — Good A");
});

test("a chosen fan page and catalog are pinned for that target only", async () => {
  const { workflow, state } = createHarness();
  state.clonePageMappings = { 111222333: "111222333" };
  state.cloneCatalogMappings = { 123456789: "" };
  state.massTargets[111] = {
    selected: true,
    pixelId: "px-111",
    pageId: "page-a",
    catalogId: "cat-a",
  };
  await workflow.run();
  assert.equal(state.clonePageMappings["111222333"], "page-a");
  assert.equal(state.cloneCatalogMappings["123456789"], "cat-a");
});

test("an untargeted custom page or catalog keeps the automatic mapping", async () => {
  const { workflow, state } = createHarness();
  state.clonePageMappings = { 111222333: "111222333" };
  state.cloneCatalogMappings = { 123456789: "" };
  state.massTargets[111] = {
    selected: true,
    pixelId: "",
    pageId: "",
    catalogId: "",
  };
  await workflow.run();
  assert.equal(state.clonePageMappings["111222333"], "111222333");
  assert.equal(state.cloneCatalogMappings["123456789"], "");
});

test("the {n} macro numbers targets and keeps counting after a failure", async () => {
  const { workflow, state, calls } = createHarness({ failFor: ["222"] });
  state.massNameTemplate = "Clone {n} — {account}";
  await workflow.run();
  assert.deepEqual(
    calls.map((call) => call.name),
    ["Clone 1 — Good A", "Clone 2 — Good B"],
    "the failed target still consumed its number",
  );

  // a retry continues the sequence instead of reusing numbers
  state.massResults[1].status = "failed";
  state.massTargets = {
    111: { selected: false },
    222: { selected: true },
  };
  await workflow.run();
  assert.equal(calls.at(-1).name, "Clone 3 — Good B");
});

test("a failed target is rolled back and the batch continues", async () => {
  const { workflow, state, calls, deleted } = createHarness({
    failFor: ["111"],
  });
  const result = await workflow.run();
  assert.equal(result, false, "the batch reports the failure");
  assert.deepEqual(
    calls.map((call) => call.accountId),
    ["111", "222"],
    "the next account still runs",
  );
  assert.equal(state.massResults[0].status, "failed");
  assert.equal(state.massResults[1].status, "success");
  assert.deepEqual(deleted, ["a-111", "s-111", "c-111"]);
  assert.equal(state.massResults[0].rollback.deleted, 2);
  assert.equal(state.massResults[0].rollback.failed, 1);
  assert.match(state.massResults[0].message, /boom/);
});

test("stop cancels the remaining targets without cloning them", async () => {
  const { workflow, state, calls } = createHarness({ stopAfterFirst: true });
  await workflow.run();
  assert.equal(calls.length, 1, "only the running target was cloned");
  assert.equal(state.massResults[0].status, "success");
  assert.equal(state.massResults[1].status, "cancelled");
  assert.equal(state.massResults[2].status, "cancelled");
});

test("no target selected is a no-op", async () => {
  const { workflow, state, calls } = createHarness();
  for (const key of Object.keys(state.massTargets)) {
    state.massTargets[key].selected = false;
  }
  const result = await workflow.run();
  assert.equal(result, false);
  assert.equal(calls.length, 0);
});

test("a missing source selection is rejected before any work", async () => {
  const { workflow, state, calls } = createHarness();
  state.cloneSourceCampaignId = "";
  const result = await workflow.run();
  assert.equal(result, false);
  assert.equal(calls.length, 0);
});

test("a chosen pixel is applied to every source pixel of the package", async () => {
  const { workflow, state, packageData } = createHarness();
  state.clonePixelMappings = { "src-px": "old" };
  workflow.applyPixelChoice(packageData, "px-target");
  assert.equal(state.clonePixelMappings["src-px"], "px-target");
  workflow.applyPixelChoice(packageData, "");
  assert.equal(
    state.clonePixelMappings["src-px"],
    "px-target",
    "empty keeps it",
  );
});

function euroHarness(options = {}) {
  const harness = createHarness(options);
  for (const key of Object.keys(harness.state.massTargets)) {
    delete harness.state.massTargets[key];
  }
  harness.state.massTargets["444"] = { selected: true };
  return harness;
}

test("a EUR target converts budgets with the fetched rate", async () => {
  const { workflow, state, calls } = euroHarness();
  await workflow.run();
  assert.deepEqual(
    calls.map((call) => call.accountId),
    ["444"],
  );
  assert.equal(state.cloneCurrencyRate, 0.9);
  assert.match(state.massCurrencyNote, /USD → EUR/);
  assert.equal(state.massResults[0].currency.rate, 0.9);
});

test("a manual rate overrides the fetched one", async () => {
  const { workflow, state } = euroHarness();
  state.massRateOverride = "1.25";
  await workflow.run();
  assert.equal(state.cloneCurrencyRate, 1.25);
  assert.match(state.massCurrencyNote, /manual rate 1.25/);
});

test("an unavailable rate refuses the target instead of copying a wrong budget", async () => {
  const { workflow, state, calls } = euroHarness({
    rate: null,
  });
  const result = await workflow.run();
  assert.equal(result, false);
  assert.equal(calls.length, 0, "nothing was cloned");
  assert.equal(state.massResults[0].status, "failed");
  assert.match(state.massResults[0].message, /Meta did not return a USD→EUR/);
  assert.equal(state.cloneCurrencyRate, 1);
});

test("retry re-selects only the failed accounts", async () => {
  const { MassCloneController } =
    await import("../src/ui/mass-clone-controller.mjs");
  const state = {
    accounts: ACCOUNTS,
    massRunning: false,
    massResults: [
      { accountId: "111", status: "success" },
      { accountId: "222", status: "failed" },
      { accountId: "333", status: "skipped" },
    ],
    massTargets: {
      111: { selected: true },
      222: { selected: true },
      333: { selected: true },
    },
  };
  let ran = 0;
  const controller = new MassCloneController({
    state,
    dom: {},
    logging: { log: () => {} },
    massCloneView: { render: () => {} },
    massCloneWorkflow: {
      run: async () => {
        ran += 1;
      },
    },
  });
  await controller.retryFailed();
  assert.equal(ran, 1);
  assert.equal(state.massTargets["111"].selected, false);
  assert.equal(state.massTargets["222"].selected, true);
  assert.equal(state.massTargets["333"].selected, false);
});

test("stopping a run unlocks the interface immediately", async () => {
  const { MassCloneController } =
    await import("../src/ui/mass-clone-controller.mjs");
  const state = { accounts: ACCOUNTS, massRunning: true, massStop: false };
  let renders = 0;
  const controller = new MassCloneController({
    state,
    dom: {},
    logging: { log: () => {} },
    massCloneView: { render: () => {} },
    panelView: {
      renderUI: () => {
        renders += 1;
      },
    },
  });
  controller.stopMassClone();
  assert.equal(state.massStop, true, "the workflow is asked to stop");
  assert.equal(
    state.massStopping,
    true,
    "the UI knows the stop is in progress",
  );
  assert.equal(renders, 1, "the panel re-renders without waiting for cleanup");
});

test("retry does nothing when the last run had no failures", async () => {
  const { MassCloneController } =
    await import("../src/ui/mass-clone-controller.mjs");
  const logs = [];
  let ran = 0;
  const controller = new MassCloneController({
    state: {
      massRunning: false,
      massResults: [],
      massTargets: {},
      accounts: [],
    },
    dom: {},
    logging: { log: (level, message) => logs.push({ level, message }) },
    massCloneView: { render: () => {} },
    massCloneWorkflow: {
      run: async () => {
        ran += 1;
      },
    },
  });
  const result = await controller.retryFailed();
  assert.equal(result, false);
  assert.equal(ran, 0);
  assert.match(logs[0].message, /nothing to retry/i);
});

test("a transient draft publishing error retries the target once", async () => {
  const { workflow, state, calls, deleted } = createHarness();
  let attempt = 0;
  workflow.dependencies.runOperation = async () => {
    attempt += 1;
    const accountId = state.cloneTargetAccountId;
    calls.push({ accountId, attempt });
    if (attempt === 1) {
      state.lastOperationReport = {
        status: "partial",
        created: [{ type: "ad", id: "a-t", draftId: "draft-t" }],
        issues: [{ message: "Draft publishing error, retry the write" }],
        validation: {
          invalid: 1,
          errors: [
            {
              ad_object_type: "ad",
              active_errors: [
                { error_type: "AD_DRAFT_PUBLISHING", error_code: 999 },
              ],
            },
          ],
        },
      };
      return false;
    }
    state.lastOperationReport = {
      status: "success",
      created: [{ type: "campaign", id: "c-ok" }],
      issues: [],
      counts: { campaign: 1, adset: 1, ad: 1 },
    };
    return true;
  };
  await workflow.run();
  const first = state.massResults[0];
  assert.equal(first.status, "success");
  assert.equal(first.retried, true);
  assert.equal(calls.length, 3, "one retry plus the second target");
  assert.ok(
    deleted.includes("draft:111:draft-t"),
    "the broken draft is cleared",
  );
});

test("a missing payment method is not retried", async () => {
  const { workflow, state, calls } = createHarness();
  workflow.dependencies.runOperation = async () => {
    calls.push({ accountId: state.cloneTargetAccountId });
    state.lastOperationReport = {
      status: "partial",
      created: [{ type: "ad", id: "a-t", draftId: "draft-t" }],
      issues: [
        {
          message:
            "L2A5: ad account has no payment method (Meta error 1359188): No Payment Method.",
        },
      ],
      validation: {
        invalid: 1,
        errors: [
          {
            ad_object_type: "ad",
            active_errors: [
              {
                error_type: "AD_DRAFT_PUBLISHING",
                error_code: 1359188,
                error_summary: "No Payment Method",
              },
            ],
          },
        ],
      },
    };
    return false;
  };
  await workflow.run();
  const byAccount = new Map();
  for (const call of calls) {
    byAccount.set(call.accountId, (byAccount.get(call.accountId) || 0) + 1);
  }
  for (const [accountId, count] of byAccount) {
    assert.equal(count, 1, `act_${accountId} is tried exactly once`);
  }
  const failed = state.massResults.filter((row) => row.status === "failed");
  assert.ok(failed.length >= 1, "the billing target is reported as failed");
  assert.ok(
    failed.every((row) => row.retried !== true),
    "no billing target is retried",
  );
});

test("a permission error is not retried", async () => {
  const { workflow, state, calls } = createHarness();
  workflow.dependencies.runOperation = async () => {
    calls.push({ accountId: state.cloneTargetAccountId });
    state.lastOperationReport = {
      status: "partial",
      created: [],
      issues: [{ message: "Permission Error 1487194" }],
      validation: {
        invalid: 1,
        errors: [
          {
            ad_object_type: "ad",
            active_errors: [
              { error_type: "AD_DRAFT_PUBLISHING", error_code: 1487194 },
            ],
          },
        ],
      },
    };
    return false;
  };
  await workflow.run();
  const byAccount = new Map();
  for (const call of calls) {
    byAccount.set(call.accountId, (byAccount.get(call.accountId) || 0) + 1);
  }
  assert.equal(byAccount.get("111"), 1, "each target ran exactly once");
  assert.equal(state.massResults[0].status, "failed");
});

test("cabinets without a payment method are hidden from the target table", () => {
  const state = {
    accounts: [
      {
        id: "111",
        name: "Billed card",
        raw: {
          account_status: 1,
          funding_source: "1",
          funding_source_details: {
            id: "1",
            type: 1,
            display_string: "VISA *1",
          },
        },
      },
      {
        // Freshly attached card: Meta exposes the id but no masked label yet.
        id: "444",
        name: "Fresh card",
        raw: {
          account_status: 1,
          funding_source: "9",
          funding_source_details: { id: "9", type: 1 },
        },
      },
      { id: "222", name: "No funding at all", raw: { account_status: 1 } },
      {
        id: "555",
        name: "Empty funding shell",
        raw: {
          account_status: 1,
          funding_source: "",
          funding_source_details: {},
        },
      },
      { id: "333", name: "Disabled", raw: { account_status: 2 } },
    ],
    massTargets: {},
  };
  const view = new MassCloneView({ state, dom: {} });
  assert.deepEqual(
    view.targetAccounts().map((account) => account.id),
    ["111", "444"],
  );
  assert.equal(view.hiddenNoPayment(), 2);
});
