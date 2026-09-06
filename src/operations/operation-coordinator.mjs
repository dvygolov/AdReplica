import { OperationContext } from "./operation-context.mjs";

/** One user operation at a time; UI selection state never becomes execution state. */
export class OperationCoordinator {
  constructor({ state, initializeSession, createRuntime, onChange, onReport }) {
    Object.assign(this, {
      state,
      initializeSession,
      createRuntime,
      onChange,
      onReport,
    });
    this.active = null;
  }

  async run(kind, options = {}) {
    if (this.active || this.state.busy || this.state.loadingSession)
      return false;
    const context = new OperationContext(kind, this.state, options);
    this.active = context;
    this.state.operationActive = true;
    this.state.busy = true;
    this.onChange();
    let success = false;
    try {
      await this.initializeSession();
      context.useSession(this.state);
      const runtime = this.createRuntime(context);
      if (kind === "import")
        success = await runtime.importWorkflow.importPackage({
          ...context.options,
          reloadOnSuccess: false,
        });
      else if (kind === "clone")
        success = await runtime.cloneWorkflow.cloneCampaignToAccount({
          ...context.options,
          reloadOnSuccess: false,
        });
      else if (kind === "export")
        success = await runtime.exportWorkflow.exportSelectedCampaign();
      else throw new Error(`Unknown operation: ${kind}`);
      return Boolean(success);
    } catch (error) {
      context.report.issue(error?.message || error, {
        uncertain: Boolean(error?.uncertain),
      });
      return false;
    } finally {
      context.report.finish(Boolean(success), {
        cancelled: context.state.operationCancelled,
      });
      this.state.lastOperationReport = context.report.toJSON();
      this.active = null;
      this.state.operationActive = false;
      this.state.busy = false;
      this.onChange();
      this.onReport(context.report, options);
    }
  }
}
