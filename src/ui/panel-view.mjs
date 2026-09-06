/** PanelView. Dependencies are supplied by the application composition root. */
export class PanelView {
  constructor(dependencies) {
    this.dependencies = dependencies;
    this.setBusy = this.setBusy.bind(this);
    this.renderStatus = this.renderStatus.bind(this);
    this.renderButtons = this.renderButtons.bind(this);
    this.renderUI = this.renderUI.bind(this);
  }

  setBusy(isBusy) {
    const { state } = this.dependencies;
    const { renderStatus, renderButtons } = this;
    state.busyDepth = Math.max(0, (state.busyDepth || 0) + (isBusy ? 1 : -1));
    state.busy = state.busyDepth > 0 || Boolean(state.operationActive);
    renderStatus();
    renderButtons();
  }

  renderStatus() {
    const { state, dom } = this.dependencies;
    if (!dom.status) return;
    const pieces = [];
    if (state.loadingSession) {
      pieces.push("Looking for access_token...");
    } else if (state.sessionReady) {
      pieces.push("Session ready");
    } else {
      pieces.push("Session not loaded");
    }
    if (state.busy) {
      pieces.push("operation in progress");
    }
    dom.status.textContent = pieces.join(" / ");
  }

  renderButtons() {
    const { state, dom } = this.dependencies;
    const { importRequiresDraftOnly, cloneRequiresDraftOnly } =
      this.dependencies.mappingController;
    if (!dom.root) return;
    dom.root.querySelectorAll("input,select,button").forEach((element) => {
      element.disabled =
        state.busy ||
        state.loadingSession ||
        state.operationActive ||
        (element === dom.importModeSelect && importRequiresDraftOnly()) ||
        (element === dom.cloneModeSelect && cloneRequiresDraftOnly());
    });
    if (dom.initButton) {
      dom.initButton.disabled = state.busy || state.loadingSession;
    }
  }

  renderUI() {
    const { state, dom } = this.dependencies;
    const { renderButtons } = this;
    const { renderLogs } = this.dependencies.logView;
    const {
      renderAccountOptions,
      renderCampaignOptions,
      renderCloneSourceCampaignOptions,
      renderImportMappings,
      renderCloneMappings,
    } = this.dependencies.mappingsView;
    const {
      importRequiresDraftOnly,
      cloneRequiresDraftOnly,
      getModeOptionsMarkup,
    } = this.dependencies.mappingController;
    if (!state.uiReady) return;
    if (dom.loadingOverlay) {
      dom.loadingOverlay.style.display =
        state.sessionReady && !state.loadingSession ? "none" : "flex";
    }
    if (dom.exportAccountSelect) {
      dom.exportAccountSelect.innerHTML = renderAccountOptions(
        state.exportAccountId,
      );
    }
    if (dom.importAccountSelect) {
      dom.importAccountSelect.innerHTML = renderAccountOptions(
        state.importAccountId,
      );
    }
    if (dom.exportCampaignSelect) {
      dom.exportCampaignSelect.innerHTML = renderCampaignOptions();
    }
    if (dom.importModeSelect) {
      dom.importModeSelect.innerHTML = getModeOptionsMarkup(
        importRequiresDraftOnly(),
      );
      dom.importModeSelect.disabled = importRequiresDraftOnly();
      dom.importModeSelect.value = state.importAsDraft
        ? "DRAFT"
        : state.importStatus;
    }
    if (dom.cloneSourceAccountSelect) {
      dom.cloneSourceAccountSelect.innerHTML = renderAccountOptions(
        state.cloneSourceAccountId,
      );
    }
    if (dom.cloneSourceCampaignSelect) {
      dom.cloneSourceCampaignSelect.innerHTML =
        renderCloneSourceCampaignOptions();
    }
    if (dom.cloneTargetAccountSelect) {
      dom.cloneTargetAccountSelect.innerHTML = renderAccountOptions(
        state.cloneTargetAccountId,
      );
    }
    if (dom.cloneModeSelect) {
      dom.cloneModeSelect.innerHTML = getModeOptionsMarkup(
        cloneRequiresDraftOnly(),
      );
      dom.cloneModeSelect.disabled = cloneRequiresDraftOnly();
      dom.cloneModeSelect.value = state.cloneAsDraft
        ? "DRAFT"
        : state.cloneStatus;
    }
    if (
      dom.cloneCampaignName &&
      dom.cloneCampaignName.value !== state.cloneCampaignName
    ) {
      dom.cloneCampaignName.value = state.cloneCampaignName;
    }
    renderLogs();
    renderImportMappings();
    renderCloneMappings();
    renderButtons();
  }
}
