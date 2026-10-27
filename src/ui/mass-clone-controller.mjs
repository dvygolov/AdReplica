/** Binds the clone tab: target selection, per-account page/pixel/catalog, run, reset. */
export class MassCloneController {
  constructor(dependencies) {
    this.dependencies = dependencies;
    this.bind = this.bind.bind(this);
    this.ensureTargetsLoaded = this.ensureTargetsLoaded.bind(this);
    this.runMassClone = this.runMassClone.bind(this);
    this.retryFailed = this.retryFailed.bind(this);
    this.stopMassClone = this.stopMassClone.bind(this);
    this.resetRun = this.resetRun.bind(this);
  }

  /**
   * Loads the pages, pixels and catalogs that each target account can actually
   * use, so a row never offers a page the account cannot publish to.
   */
  async ensureTargetsLoaded() {
    try {
      await this.loadAllTargetContexts();
    } catch (error) {
      this.dependencies.logging.log(
        "warn",
        "Target context lookup failed; the table keeps the automatic choices.",
        String(error && error.message ? error.message : error),
      );
    }
  }

  async loadAllTargetContexts() {
    const { state } = this.dependencies;
    const { graphGetAll } = this.dependencies.graphClient;
    const { log } = this.dependencies.logging;
    if (!state.accounts?.length) {
      // The tab can be opened before the session finishes loading accounts.
      if (!this.accountsRetry) {
        this.accountsRetry = setInterval(() => {
          if (!state.accounts?.length) return;
          clearInterval(this.accountsRetry);
          this.accountsRetry = null;
          this.ensureTargetsLoaded();
        }, 2000);
      }
      return;
    }
    state.massPixels ||= {};
    state.massPages ||= {};
    state.massCatalogs ||= {};
    state.massCatalogBusiness ||= {};
    const accounts = this.dependencies.massCloneView.targetAccounts();
    for (const account of accounts) {
      const accountId = String(account.id);
      const context = await this.loadAccountContext(accountId);
      if (!state.massPixels[accountId]) {
        if (context?.pixels?.length) {
          state.massPixels[accountId] = context.pixels;
        } else {
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
      }
      state.massPages[accountId] = await this.loadAccountPages(
        accountId,
        context,
      );
      state.massCatalogs[accountId] = (context?.catalogs || []).map(
        (catalog) => ({
          id: String(catalog.id),
          name: catalog.name || String(catalog.id),
        }),
      );
      state.massCatalogBusiness[accountId] = context?.business || null;
    }
    this.dependencies.massCloneView.render();
  }

  /** The shared account context is cached, so opening the tab stays cheap. */
  async loadAccountContext(accountId) {
    const service = this.dependencies.accountContextService;
    if (!service?.fetchAccountContext) return null;
    try {
      return await service.fetchAccountContext(accountId);
    } catch (error) {
      this.dependencies.logging.log(
        "warn",
        `Account context lookup failed for act_${accountId}.`,
        String(error),
      );
      return null;
    }
  }

  /** Pages the ad account is allowed to promote; the global page list is the fallback. */
  async loadAccountPages(accountId, context) {
    const { state } = this.dependencies;
    const { graphGetAll } = this.dependencies.graphClient;
    const { log } = this.dependencies.logging;
    state.massPagesCache ||= {};
    if (state.massPagesCache[accountId]) return state.massPagesCache[accountId];
    const normalize = (page) => ({
      id: String(page.id),
      name: page.name || String(page.id),
      picture: page.picture?.data?.url || page.picture || "",
    });
    const accessible = (context?.pages || state.accessiblePagesCache || []).map(
      normalize,
    );
    let promotable = [];
    try {
      const pages = await graphGetAll(`act_${accountId}/promote_pages`, {
        fields: "id,name,picture{url}",
      });
      promotable = pages.map(normalize);
    } catch (error) {
      log(
        "info",
        `act_${accountId}/promote_pages is unavailable; using the accessible page list.`,
        String(error),
      );
    }
    // promote_pages omits pages shared with the profile, so the two lists are merged.
    const merged = new Map();
    for (const page of [...promotable, ...accessible]) {
      if (page.id && !merged.has(page.id)) merged.set(page.id, page);
    }
    state.massPagesCache[accountId] = [...merged.values()];
    return state.massPagesCache[accountId];
  }

  async runMassClone() {
    const { state } = this.dependencies;
    if (state.massRunning) return false;
    return this.dependencies.massCloneWorkflow.run();
  }

  /** Re-runs exactly the accounts that failed in the previous run. */
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

  /** Clears the previous run so the tab returns to selection. */
  resetRun() {
    const { state } = this.dependencies;
    if (state.massRunning) return;
    state.massResults = [];
    state.massActiveAccountId = "";
    state.massSequence = 0;
    this.dependencies.massCloneView.render();
  }

  setAllTargets(selected) {
    const { state } = this.dependencies;
    state.massTargets ||= {};
    for (const account of this.dependencies.massCloneView.targetAccounts()) {
      const accountId = String(account.id);
      state.massTargets[accountId] = {
        ...(state.massTargets[accountId] || {}),
        selected,
      };
    }
    this.dependencies.massCloneView.render();
  }

  pickFor(accountId, patch) {
    const { state } = this.dependencies;
    state.massTargets ||= {};
    state.massTargets[accountId] = {
      ...(state.massTargets[accountId] || {}),
      ...patch,
    };
    this.dependencies.massCloneView.render();
  }

  bind(root) {
    const { state, dom } = this.dependencies;
    const appId = this.dependencies.appId;
    if (!root) return;
    if (this.boundRoot === root) return;
    this.boundRoot = root;
    const list = dom.cloneTargetsBody;
    if (list) {
      list.addEventListener("change", (event) => {
        const input = event.target;
        if (!(input instanceof HTMLSelectElement)) return;
        const accountId = input.dataset.massAccount;
        if (accountId) {
          this.pickFor(accountId, { selected: false });
          return;
        }
        const pixelAccountId = input.dataset.massPixel;
        if (pixelAccountId) {
          this.pickFor(pixelAccountId, { pixelId: input.value });
          return;
        }
        const catalogAccountId = input.dataset.massCatalog;
        if (catalogAccountId) {
          this.pickFor(catalogAccountId, { catalogId: input.value });
        }
      });
      list.addEventListener("change", (event) => {
        const input = event.target;
        if (!(input instanceof HTMLInputElement)) return;
        const accountId = input.dataset.massAccount;
        if (!accountId) return;
        this.pickFor(accountId, { selected: input.checked });
      });
      // Page pickers are listboxes, not native selects: the page avatar matters.
      list.addEventListener("click", (event) => {
        const toggle = event.target.closest("[data-mass-page-toggle]");
        if (toggle) {
          const accountId = toggle.dataset.massPageToggle;
          state.massOpenPageMenu =
            String(state.massOpenPageMenu || "") === accountId ? "" : accountId;
          this.dependencies.massCloneView.render();
          return;
        }
        const pick = event.target.closest("[data-mass-page-pick]");
        if (pick) {
          state.massOpenPageMenu = "";
          this.pickFor(pick.dataset.massPagePick, {
            pageId: pick.dataset.pageId || "",
          });
        }
      });
    }
    if (dom.cloneMaster) {
      dom.cloneMaster.addEventListener("change", () => {
        this.setAllTargets(dom.cloneMaster.checked);
      });
    }
    const modeSelect = root.querySelector(`#${appId}-clone-mode`);
    if (modeSelect) {
      modeSelect.addEventListener("change", (event) => {
        state.massMode = event.target.value;
      });
    }
    const nameInput = root.querySelector(`#${appId}-clone-campaign-name`);
    if (nameInput) {
      nameInput.addEventListener("input", (event) => {
        state.massNameTemplate = event.target.value;
      });
    }
    dom.cloneRunButton = root.querySelector(`#${appId}-clone`);
    dom.massStopButton = root.querySelector(`#${appId}-mass-stop`);
    dom.massRetryButton = root.querySelector(`#${appId}-mass-retry`);
    dom.massResetButton = root.querySelector(`#${appId}-mass-reset`);
    if (dom.massRetryButton) {
      dom.massRetryButton.addEventListener("click", () => {
        this.retryFailed();
      });
    }
    if (dom.massResetButton) {
      dom.massResetButton.addEventListener("click", () => this.resetRun());
    }
    // The run button is bound by the panel controller next to the other actions.
    if (dom.massStopButton) {
      dom.massStopButton.addEventListener("click", () => this.stopMassClone());
    }
  }
}
