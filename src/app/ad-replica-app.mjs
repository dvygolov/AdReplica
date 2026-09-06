import { APP_TITLE } from "./constants.mjs";
import { AdReplicaState } from "../state/ad-replica-state.mjs";
import { Logger } from "../core/logger.mjs";
import { createServices } from "./create-services.mjs";
import { createDebugApi } from "./debug-api.mjs";
import { OperationCoordinator } from "../operations/operation-coordinator.mjs";
import { ReportView } from "../ui/report-view.mjs";

/** Owns the browser UI lifetime and the root service composition. */
export class AdReplicaApp {
  constructor() {
    this.state = new AdReplicaState();
    this.dom = {};
    this.logger = new Logger({
      appTitle: APP_TITLE,
      state: this.state,
      onRender: () => this.services?.logView.renderLogs(),
    });
    this.services = createServices({
      state: this.state,
      dom: this.dom,
      logger: this.logger,
    });
    this.reportView = new ReportView({
      dom: this.dom,
      services: this.services,
    });
    this.coordinator = new OperationCoordinator({
      state: this.state,
      initializeSession: this.services.sessionService.initializeSession,
      createRuntime: (context) =>
        createServices({ state: context.state, dom: {}, logger: this.logger }),
      onChange: () => this.services.panelView.renderUI(),
      onReport: (report, options) => this.reportView.show(report, options),
    });
    this.services.importWorkflow.importPackage = (options) =>
      this.coordinator.run("import", options);
    this.services.cloneWorkflow.cloneCampaignToAccount = (options) =>
      this.coordinator.run("clone", options);
    this.services.exportWorkflow.exportSelectedCampaign = () =>
      this.coordinator.run("export");
    this.debug = createDebugApi(this.services, this.state);
    this.debug.lastReport = () => this.state.lastOperationReport;
  }

  mount() {
    this.services.panelController.mount();
  }
  destroy() {
    if (this.coordinator.active) {
      this.logger.log(
        "warn",
        "An operation is still running. Wait for its report before closing AdReplica.",
      );
      return false;
    }
    this.reportView.destroy();
    this.services.panelController.destroy();
    return true;
  }

  toPublicApi() {
    return {
      mount: () => this.mount(),
      destroy: () => this.destroy(),
      state: this.state,
      initSession: this.services.sessionService.initializeSession,
      debug: this.debug,
    };
  }
}
