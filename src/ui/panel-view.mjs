import { APP_ID } from "../app/constants.mjs";
import { t } from "./i18n.mjs";

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
      pieces.push(t("status.loading"));
    } else if (state.sessionReady) {
      pieces.push(t("status.ready"));
    } else {
      pieces.push(t("status.missing"));
    }
    if (state.busy) {
      pieces.push(t("status.busy"));
    }
    dom.status.textContent = pieces.join(" / ");
  }

  renderButtons() {
    const { state, dom } = this.dependencies;
    const { importRequiresDraftOnly, cloneRequiresDraftOnly } =
      this.dependencies.mappingController;
    if (!dom.root) return;
    dom.root.querySelectorAll("input,select,button").forEach((element) => {
      if (element.dataset.alwaysEnabled !== undefined) return;
      element.disabled =
        state.busy ||
        state.loadingSession ||
        state.operationActive ||
        state.massRunning ||
        state.versionLoading ||
        (element === dom.importModeSelect && importRequiresDraftOnly()) ||
        (element === dom.cloneModeSelect && cloneRequiresDraftOnly());
    });
    if (dom.previousVersion) {
      const { localVersions } = this.dependencies;
      const previous = localVersions.previous();
      dom.previousVersion.disabled ||= !previous;
      dom.previousVersion.textContent = previous
        ? `Load previous version (${previous.version})`
        : "Load previous version";
      dom.versionNote.textContent =
        localVersions.warning ||
        (state.versionLoading
          ? "Loading saved version..."
          : previous
            ? "Saved in this browser. The bookmarklet opens the latest version again."
            : "No previous version saved yet. It will appear after the next update.");
    }
    if (dom.initButton) {
      dom.initButton.disabled = state.busy || state.loadingSession;
    }
    if (dom.massStopButton) {
      dom.massStopButton.disabled = !state.massRunning;
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
    if (state.activeTab && dom.root) {
      const active = ["export", "import", "clone"].includes(state.activeTab)
        ? state.activeTab
        : "export";
      dom.root.querySelectorAll(".sk-tab").forEach((button) => {
        button.classList.toggle(
          "sk-tab-active",
          button.dataset.tab === active,
        );
      });
      dom.root.querySelectorAll(".sk-tab-panel").forEach((panel) => {
        panel.classList.toggle(
          "sk-hidden",
          panel.id !== `${APP_ID}-panel-${active}`,
        );
      });
      dom.cloneFooter?.classList.toggle("sk-hidden", active !== "clone");
      if (state.cloneSourceCollapsed === null && state.clonePackage) {
        state.cloneSourceCollapsed = true;
      }
      if (dom.cloneSourceBody) {
        dom.cloneSourceBody.classList.toggle(
          "sk-hidden",
          Boolean(state.cloneSourceCollapsed),
        );
      }
      if (dom.cloneSummary) {
        dom.cloneSummary.classList.toggle(
          "sk-hidden",
          !state.cloneSourceCollapsed,
        );
      }
    }
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
    const templateValue = state.massNameTemplate || state.cloneCampaignName;
    if (dom.downloadLogs) {
      dom.downloadLogs.disabled =
        !Array.isArray(state.logs) || state.logs.length === 0;
    }
    if (dom.cloneCampaignName && dom.cloneCampaignName.value !== templateValue) {
      dom.cloneCampaignName.value = templateValue;
    }
    renderLogs();
    renderImportMappings();
    renderCloneMappings();
    this.dependencies.massCloneView.render();
    renderButtons();
  }
}
