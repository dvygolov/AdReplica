import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { parse } from "acorn";
import { JSDOM } from "jsdom";
import { createServices } from "../src/app/create-services.mjs";
import { AdReplicaState } from "../src/state/ad-replica-state.mjs";
import { OperationReport } from "../src/operations/operation-report.mjs";
import { ReportView } from "../src/ui/report-view.mjs";

test("all service dependencies compose and imports are acyclic", async () => {
  const services = createServices({
    state: new AdReplicaState(),
    dom: {},
    logger: { log() {} },
  });
  for (const [name, service] of Object.entries(services))
    for (const [key, value] of Object.entries(service.dependencies))
      assert.notEqual(value, undefined, `${name}.${key}`);
  const root = resolve("src");
  const graph = new Map();
  for (const path of await readdir(root, { recursive: true })) {
    if (!path.endsWith(".mjs")) continue;
    const full = resolve(root, path);
    const source = await readFile(full, "utf8");
    assert.ok(source.split("\n").length < 1000, `Oversized module: ${path}`);
    const ast = parse(source, { ecmaVersion: "latest", sourceType: "module" });
    graph.set(
      full,
      ast.body
        .filter((x) => x.type === "ImportDeclaration")
        .map((x) => resolve(dirname(full), x.source.value)),
    );
  }
  const visited = new Set();
  const active = new Set();
  function visit(path) {
    assert.ok(!active.has(path), `Circular import: ${path}`);
    if (visited.has(path)) return;
    active.add(path);
    for (const dep of graph.get(path) || []) visit(dep);
    active.delete(path);
    visited.add(path);
  }
  for (const path of graph.keys()) visit(path);
});
test("panel mounts, locks every setting during operation and renders downloadable report", () => {
  const browser = new JSDOM(
    "<!doctype html><html><head></head><body></body></html>",
    {
      url: "https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=100000",
    },
  );
  const previous = { window: globalThis.window, document: globalThis.document };
  Object.assign(globalThis, {
    window: browser.window,
    document: browser.window.document,
  });
  try {
    const state = new AdReplicaState();
    state.sessionReady = true;
    const dom = {};
    const services = createServices({
      state,
      dom,
      logger: { log() {} },
      overrides: { sessionService: { initializeSession: async () => {} } },
    });
    services.panelController.mount();
    assert.ok(dom.root.isConnected);
    state.operationActive = true;
    services.panelView.renderButtons();
    assert.ok(
      [...dom.root.querySelectorAll("input,select,button")].every(
        (x) => x.disabled,
      ),
    );
    assert.equal(services.panelController.destroy(), false);
    assert.ok(dom.root.isConnected);
    state.operationActive = false;
    services.panelView.renderButtons();
    const report = new OperationReport({
      kind: "import",
      accountId: "100000",
      campaignName: "<script>test</script>",
    });
    report.finish(false);
    const view = new ReportView({ dom, services });
    view.show(report);
    assert.equal(dom.root.querySelectorAll(".sk-operation-report").length, 1);
    assert.equal(
      dom.root.querySelectorAll(".sk-operation-report script").length,
      0,
    );
    services.panelController.destroy();
    assert.equal(dom.root.isConnected, false);
  } finally {
    Object.assign(globalThis, previous);
    browser.window.close();
  }
});
