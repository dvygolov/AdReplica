/** Binds the mass-clone tab: target selection, per-account pixel, run and stop. */
export class MassCloneController {
  constructor(dependencies) {
    this.dependencies = dependencies;
    this.bind = this.bind.bind(this);
    this.ensureTargetsLoaded = this.ensureTargetsLoaded.bind(this);
    this.runMassClone = this.runMassClone.bind(this);
    this.stopMassClone = this.stopMassClone.bind(this);
  }

  /** Loads the pixel list of every account once, so each row can offer a choice. */
  async ensureTargetsLoaded() {
    const { state } = this.dependencies;
    const { graphGetAll } = this.dependencies.graphClient;
    const { log } = this.dependencies.logging;
    if (!state.accounts?.length) return;
    state.massPixels ||= {};
    for (const account of state.accounts) {
      const accountId = String(account.id);
      if (state.massPixels[accountId]) continue;
      try {
        const pixels = await graphGetAll(`act_${accountId}/adspixels`, {
          fields: "id,name",
        });
        state.massPixels[accountId] = pixels.map((pixel) => ({
          id: String(pixel.id),
          name: pixel.name || String(pixel.id),
        }));
      } catch (error) {
        state.massPixels[accountId] = [];
        log(
          "warn",
          `Pixel lookup failed for act_${accountId}; the clone will create or reuse one automatically.`,
          String(error),
        );
      }
    }
    this.dependencies.massCloneView.render();
  }

  async runMassClone() {
    const { state } = this.dependencies;
    if (state.massRunning) return false;
    return this.dependencies.massCloneWorkflow.run();
  }

  /** Re-runs exactly the accounts that failed in the previous mass run. */
  async retryFailed() {
    const { state } = this.dependencies;
    const { log } = this.dependencies.logging;
    if (state.massRunning) return false;
    const failed = (state.massResults || []).filter(
      (row) => row.status === "failed",
    );
    if (!failed.length) {
      log(
        "warn",
        "There is nothing to retry: no failed accounts in the last run.",
      );
      return false;
    }
    const wanted = new Set(failed.map((row) => String(row.accountId)));
    state.massTargets ||= {};
    for (const account of state.accounts || []) {
      const accountId = String(account.id);
      const current = state.massTargets[accountId] || {};
      state.massTargets[accountId] = {
        ...current,
        selected: wanted.has(accountId),
      };
    }
    log(
      "info",
      `Retrying ${failed.length} failed account${failed.length === 1 ? "" : "s"}.`,
    );
    this.dependencies.massCloneView.render();
    return this.dependencies.massCloneWorkflow.run();
  }

  stopMassClone() {
    const { state } = this.dependencies;
    const { log } = this.dependencies.logging;
    if (!state.massRunning) return;
    state.massStop = true;
    log("warn", "Mass clone will stop after the current account.");
    this.dependencies.massCloneView.render();
  }

  bind(root) {
    const { state, dom } = this.dependencies;
    const appId = this.dependencies.appId;
    if (!root) return;
    if (this.boundRoot === root) return;
    this.boundRoot = root;
    const list = dom.massCloneList;
    if (list) {
      list.addEventListener("change", (event) => {
        const input = event.target;
        if (
          !(input instanceof HTMLInputElement) &&
          !(input instanceof HTMLSelectElement)
        )
          return;
        const accountId = input.dataset.massAccount;
        if (accountId) {
          state.massTargets ||= {};
          state.massTargets[accountId] = {
            ...(state.massTargets[accountId] || {}),
            selected: input.checked,
          };
          this.dependencies.massCloneView.render();
          return;
        }
        const pixelAccountId = input.dataset.massPixel;
        if (pixelAccountId) {
          state.massTargets ||= {};
          state.massTargets[pixelAccountId] = {
            ...(state.massTargets[pixelAccountId] || {}),
            pixelId: input.value,
          };
        }
      });
    }
    const modeSelect = root.querySelector(`#${appId}-mass-mode`);
    if (modeSelect) {
      modeSelect.addEventListener("change", (event) => {
        state.massMode = event.target.value;
      });
    }
    const nameInput = root.querySelector(`#${appId}-mass-name`);
    if (nameInput) {
      nameInput.addEventListener("input", (event) => {
        state.massNameTemplate = event.target.value;
      });
    }
    const rateInput = root.querySelector(`#${appId}-mass-rate`);
    if (rateInput) {
      rateInput.addEventListener("input", (event) => {
        state.massRateOverride = event.target.value.trim();
      });
    }
    dom.massRunButton = root.querySelector(`#${appId}-mass-run`);
    dom.massStopButton = root.querySelector(`#${appId}-mass-stop`);
    dom.massRetryButton = root.querySelector(`#${appId}-mass-retry`);
    if (dom.massRetryButton) {
      dom.massRetryButton.addEventListener("click", () => {
        this.retryFailed();
      });
    }
    if (dom.massRunButton) {
      dom.massRunButton.addEventListener("click", () => {
        this.runMassClone();
      });
    }
    if (dom.massStopButton) {
      dom.massStopButton.addEventListener("click", () => this.stopMassClone());
    }
  }
}
