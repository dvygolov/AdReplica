import { Config } from "../config.mjs";
import {
  APP_ID,
  APP_MARK_SVG,
  APP_TITLE,
  NATIVE_FETCH_FRAME_ID,
} from "../app/constants.mjs";
import { buildAdReplicaStyles } from "./styles.mjs";

/** PanelController. Dependencies are supplied by the application composition root. */
export class PanelController {
  constructor(dependencies) {
    this.dependencies = dependencies;
    this.mount = this.mount.bind(this);
    this.destroy = this.destroy.bind(this);
    this.injectStyles = this.injectStyles.bind(this);
  }

  mount() {
    const { state, dom } = this.dependencies;
    const { log } = this.dependencies.logging;
    const { getSharedMediaOverrideKey } = this.dependencies.mediaSlots;
    const { renderButtons, renderUI } = this.dependencies.panelView;
    const { downloadLogs } = this.dependencies.logView;
    const { renderImportMappings, renderCloneMappings } =
      this.dependencies.mappingsView;
    const { destroy, injectStyles } = this;
    const { initializeSession } = this.dependencies.sessionService;
    const {
      importRequiresDraftOnly,
      cloneRequiresDraftOnly,
      refreshImportAccountContext,
      refreshCloneTargetContext,
    } = this.dependencies.mappingController;
    const {
      refreshCloneSourceContext,
      loadCloneSourceCampaigns,
      loadExportCampaigns,
    } = this.dependencies.campaignController;
    const { exportSelectedCampaign } = this.dependencies.exportWorkflow;
    const { ensureClonePackageLoaded, cloneCampaignToAccount } =
      this.dependencies.cloneWorkflow;
    const { handleImportJsonSelected } = this.dependencies.importController;
    const { clearCurrentAccountDrafts } = this.dependencies.draftController;
    const { importPackage } = this.dependencies.importWorkflow;
    const { localVersions } = this.dependencies;
    localVersions.captureCurrent();
    injectStyles();

    const root = document.createElement("div");
    root.id = APP_ID;
    root.innerHTML = `
      <div class="sk-shell">
        <div class="sk-loading-overlay" id="${APP_ID}-loading">
          <div class="sk-spinner"></div>
        </div>
        <div class="sk-head">
          <div>
            <div class="sk-title-row">${APP_MARK_SVG}<h2>${APP_TITLE} <span class="sk-build">build ${Config.VERSION}</span></h2></div>
            <a class="sk-byline" href="https://yellowweb.top" target="_blank">by Yellow Web</a>
          </div>
          <div class="sk-head-actions">
            <button id="${APP_ID}-service" class="sk-service-button" title="Service" aria-label="Service" aria-expanded="false">&#9881;</button>
            <div id="${APP_ID}-service-menu" class="sk-service-menu sk-hidden">
              <button data-role="busy-lock" id="${APP_ID}-clear-drafts" type="button">Clear Drafts</button>
              <button id="${APP_ID}-previous-version" type="button">Load previous version</button>
              <div id="${APP_ID}-version-note" class="sk-version-note" role="status"></div>
            </div>
            <button id="${APP_ID}-close" class="sk-close" title="Close">&#x2715;</button>
          </div>
        </div>

        <div class="sk-tabs">
          <button class="sk-tab sk-tab-active" data-tab="export">Export</button>
          <button class="sk-tab" data-tab="import">Import</button>
          <button class="sk-tab" data-tab="clone">Clone</button>
        </div>

        <div class="sk-tab-panel" id="${APP_ID}-panel-export">
          <section class="sk-card">
            <label class="sk-field">
              <span>Account</span>
              <select id="${APP_ID}-export-account"></select>
            </label>
            <label class="sk-field">
              <span>Campaign</span>
              <select id="${APP_ID}-export-campaign"></select>
            </label>
            <div class="sk-actions">
              <button data-role="busy-lock" id="${APP_ID}-export">Export</button>
            </div>
            <p class="sk-note">Export saves JSON and media files.</p>
          </section>
        </div>

        <div class="sk-tab-panel sk-hidden" id="${APP_ID}-panel-import">
          <section class="sk-card">
            <label class="sk-field">
              <span>Account</span>
              <select id="${APP_ID}-import-account"></select>
            </label>
            <label class="sk-field">
              <span>Export JSON file</span>
              <input type="file" id="${APP_ID}-import-json" accept=".json,application/json" />
            </label>
            <label class="sk-field">
              <span>Campaign name</span>
              <input type="text" id="${APP_ID}-import-campaign-name" placeholder="Will use original name if empty" />
            </label>
            <label class="sk-field">
              <span>Import mode</span>
              <select id="${APP_ID}-import-mode">
                <option value="DRAFT">DRAFT</option>
                <option value="ACTIVE">ACTIVE</option>
                <option value="PAUSED" selected>PAUSED</option>
              </select>
            </label>
            <div id="${APP_ID}-import-mappings"></div>
            <div class="sk-actions">
              <button data-role="busy-lock" id="${APP_ID}-import">Import</button>
            </div>
          </section>
        </div>

        <div class="sk-tab-panel sk-hidden" id="${APP_ID}-panel-clone">
          <section class="sk-card">
            <label class="sk-field">
              <span>Source Account</span>
              <select id="${APP_ID}-clone-source-account"></select>
            </label>
            <label class="sk-field">
              <span>Source Campaign</span>
              <select id="${APP_ID}-clone-source-campaign"></select>
            </label>
            <div id="${APP_ID}-clone-package-summary"></div>
            <label class="sk-field">
              <span>Target Account</span>
              <select id="${APP_ID}-clone-target-account"></select>
            </label>
            <label class="sk-field">
              <span>Campaign name</span>
              <input type="text" id="${APP_ID}-clone-campaign-name" placeholder="Will use source campaign name if empty" />
            </label>
            <label class="sk-field">
              <span>Clone mode</span>
              <select id="${APP_ID}-clone-mode">
                <option value="DRAFT">DRAFT</option>
                <option value="ACTIVE">ACTIVE</option>
                <option value="PAUSED" selected>PAUSED</option>
              </select>
            </label>
            <div id="${APP_ID}-clone-mappings"></div>
            <div class="sk-actions">
              <button data-role="busy-lock" id="${APP_ID}-clone">Clone</button>
            </div>
            <p class="sk-note">Clone copies JSON structure and source media directly in memory, without saving files to disk.</p>
          </section>
        </div>

        <details class="sk-logs">
          <summary class="sk-log-summary">
            <span>Log</span>
            <button type="button" class="sk-secondary sk-log-download" id="${APP_ID}-download-logs">Download log</button>
          </summary>
          <textarea id="${APP_ID}-logs" class="sk-log-area" readonly></textarea>
        </details>

      </div>
    `;

    document.body.appendChild(root);

    dom.root = root;
    dom.loadingOverlay = root.querySelector(`#${APP_ID}-loading`);
    dom.exportAccountSelect = root.querySelector(`#${APP_ID}-export-account`);
    dom.importAccountSelect = root.querySelector(`#${APP_ID}-import-account`);
    dom.exportCampaignSelect = root.querySelector(`#${APP_ID}-export-campaign`);
    dom.importMappings = root.querySelector(`#${APP_ID}-import-mappings`);
    dom.importCampaignName = root.querySelector(
      `#${APP_ID}-import-campaign-name`,
    );
    dom.importModeSelect = root.querySelector(`#${APP_ID}-import-mode`);
    dom.cloneSourceAccountSelect = root.querySelector(
      `#${APP_ID}-clone-source-account`,
    );
    dom.cloneSourceCampaignSelect = root.querySelector(
      `#${APP_ID}-clone-source-campaign`,
    );
    dom.clonePackageSummary = root.querySelector(
      `#${APP_ID}-clone-package-summary`,
    );
    dom.cloneTargetAccountSelect = root.querySelector(
      `#${APP_ID}-clone-target-account`,
    );
    dom.cloneCampaignName = root.querySelector(
      `#${APP_ID}-clone-campaign-name`,
    );
    dom.cloneModeSelect = root.querySelector(`#${APP_ID}-clone-mode`);
    dom.cloneMappings = root.querySelector(`#${APP_ID}-clone-mappings`);
    dom.logs = root.querySelector(`#${APP_ID}-logs`);
    dom.downloadLogs = root.querySelector(`#${APP_ID}-download-logs`);

    const serviceButton = root.querySelector(`#${APP_ID}-service`);
    const serviceMenu = root.querySelector(`#${APP_ID}-service-menu`);
    dom.previousVersion = root.querySelector(`#${APP_ID}-previous-version`);
    dom.versionNote = root.querySelector(`#${APP_ID}-version-note`);
    const hideServiceMenu = () => {
      serviceMenu.classList.add("sk-hidden");
      serviceButton.classList.remove("sk-active");
      serviceButton.setAttribute("aria-expanded", "false");
    };
    serviceButton.addEventListener("click", (event) => {
      event.stopPropagation();
      renderButtons();
      const isHidden = serviceMenu.classList.contains("sk-hidden");
      serviceMenu.classList.toggle("sk-hidden", !isHidden);
      serviceButton.classList.toggle("sk-active", isHidden);
      serviceButton.setAttribute("aria-expanded", isHidden ? "true" : "false");
    });
    serviceMenu.addEventListener("click", (event) => {
      event.stopPropagation();
    });
    dom.previousVersion.addEventListener("click", async () => {
      await localVersions.loadPrevious();
    });
    dom.serviceOutsideClick = hideServiceMenu;
    document.addEventListener("click", dom.serviceOutsideClick);
    root.querySelector(`#${APP_ID}-close`).addEventListener("click", destroy);
    root.querySelectorAll(".sk-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        root
          .querySelectorAll(".sk-tab")
          .forEach((t) => t.classList.remove("sk-tab-active"));
        root
          .querySelectorAll(".sk-tab-panel")
          .forEach((p) => p.classList.add("sk-hidden"));
        btn.classList.add("sk-tab-active");
        root
          .querySelector(`#${APP_ID}-panel-${btn.dataset.tab}`)
          .classList.remove("sk-hidden");
      });
    });
    root
      .querySelector(`#${APP_ID}-export`)
      .addEventListener("click", exportSelectedCampaign);
    root
      .querySelector(`#${APP_ID}-import`)
      .addEventListener("click", () => importPackage());
    root
      .querySelector(`#${APP_ID}-clone`)
      .addEventListener("click", () => cloneCampaignToAccount());
    dom.downloadLogs.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      downloadLogs();
    });
    root
      .querySelector(`#${APP_ID}-clear-drafts`)
      .addEventListener("click", async () => {
        hideServiceMenu();
        await clearCurrentAccountDrafts();
      });
    dom.exportAccountSelect.addEventListener("change", async (event) => {
      state.exportAccountId = event.target.value;
      state.exportCampaignId = "";
      state.exportCampaigns = [];
      renderUI();
      if (state.exportAccountId) {
        await loadExportCampaigns();
      }
    });
    dom.importAccountSelect.addEventListener("change", async (event) => {
      state.importAccountId = event.target.value;
      await refreshImportAccountContext();
      renderUI();
    });
    dom.exportCampaignSelect.addEventListener("change", (event) => {
      state.exportCampaignId = event.target.value;
      renderButtons();
    });
    root
      .querySelector(`#${APP_ID}-import-json`)
      .addEventListener("change", handleImportJsonSelected);
    dom.importCampaignName.addEventListener("input", (event) => {
      state.importCampaignName = event.target.value;
    });
    dom.importModeSelect.addEventListener("change", (event) => {
      const val = event.target.value;
      if (importRequiresDraftOnly()) {
        state.importAsDraft = true;
        state.importStatus = "PAUSED";
        renderUI();
        return;
      }
      state.importAsDraft = val === "DRAFT";
      state.importStatus = val === "DRAFT" ? "PAUSED" : val;
    });
    dom.cloneSourceAccountSelect.addEventListener("change", async (event) => {
      state.cloneSourceAccountId = event.target.value;
      state.cloneSourceCampaignId = "";
      state.cloneSourceCampaigns = [];
      state.clonePackage = null;
      state.clonePackageLoading = false;
      state.clonePageMappings = {};
      state.clonePixelMappings = {};
      state.cloneCatalogMappings = {};
      state.cloneManualSourceCatalogId = "";
      state.cloneSourceBusiness = null;
      state.cloneSourceCatalogs = [];
      renderUI();
      if (state.cloneSourceAccountId) {
        await loadCloneSourceCampaigns();
        await refreshCloneSourceContext();
      }
    });
    dom.cloneSourceCampaignSelect.addEventListener("change", async (event) => {
      state.cloneSourceCampaignId = event.target.value;
      state.clonePackage = null;
      state.cloneCatalogMappings = {};
      state.cloneManualSourceCatalogId = "";
      state.clonePackageLoading = Boolean(state.cloneSourceCampaignId);
      renderUI();
      if (state.cloneSourceCampaignId) {
        await ensureClonePackageLoaded();
      } else {
        state.clonePackageLoading = false;
        renderUI();
      }
    });
    dom.cloneTargetAccountSelect.addEventListener("change", async (event) => {
      state.cloneTargetAccountId = event.target.value;
      await refreshCloneTargetContext();
      renderUI();
    });
    dom.cloneCampaignName.addEventListener("input", (event) => {
      state.cloneCampaignName = event.target.value;
    });
    dom.cloneModeSelect.addEventListener("change", (event) => {
      const val = event.target.value;
      if (cloneRequiresDraftOnly()) {
        state.cloneAsDraft = true;
        state.cloneStatus = "PAUSED";
        renderUI();
        return;
      }
      state.cloneAsDraft = val === "DRAFT";
      state.cloneStatus = val === "DRAFT" ? "PAUSED" : val;
    });
    dom.importMappings.addEventListener("change", (event) => {
      const target = event.target;
      if (!(
        target instanceof HTMLInputElement ||
        target instanceof HTMLSelectElement
      ))
        return;
      let shouldRerender = true;
      if (target.dataset.action === "page-map") {
        state.importPageMappings[target.dataset.sourcePageId] = target.value;
      }
      if (target.dataset.action === "pixel-map") {
        state.importPixelMappings[target.dataset.sourcePixelId] = target.value;
      }
      if (target.dataset.action === "catalog-map") {
        state.importCatalogMappings[target.dataset.sourceCatalogId] =
          target.value;
      }
      if (
        target.dataset.action === "media-override" &&
        target instanceof HTMLInputElement
      ) {
        const file = target.files && target.files[0] ? target.files[0] : null;
        const expectedFile = String(target.dataset.expectedFile || "");
        const sharedKey = getSharedMediaOverrideKey(
          target.dataset.expectedFile || "",
        );
        if (file) {
          state.importMediaOverrides.set(target.dataset.mediaKey, file);
          if (sharedKey !== getSharedMediaOverrideKey("")) {
            state.importMediaOverrides.set(sharedKey, file);
          }
          if (expectedFile) {
            state.importMediaFiles.set(expectedFile, file);
          }
          log("info", `Selected replacement media: ${file.name}`);
        } else {
          state.importMediaOverrides.delete(target.dataset.mediaKey);
          if (sharedKey !== getSharedMediaOverrideKey("")) {
            state.importMediaOverrides.delete(sharedKey);
          }
          if (expectedFile) {
            state.importMediaFiles.delete(expectedFile);
          }
        }
        const row = target.closest(".sk-creative-row");
        const statusNode = row?.querySelector(".sk-creative-status");
        if (statusNode) {
          statusNode.textContent = file
            ? `Selected: ${file.name}`
            : "Awaiting file selection";
        }
        shouldRerender = false;
      }
      if (shouldRerender) {
        renderImportMappings();
      }
    });
    dom.cloneMappings.addEventListener("change", (event) => {
      const target = event.target;
      if (!(
        target instanceof HTMLInputElement ||
        target instanceof HTMLSelectElement
      ))
        return;
      if (target.dataset.action === "clone-page-map") {
        state.clonePageMappings[target.dataset.sourcePageId] = target.value;
      }
      if (target.dataset.action === "clone-pixel-map") {
        state.clonePixelMappings[target.dataset.sourcePixelId] = target.value;
      }
      if (target.dataset.action === "clone-manual-source-catalog") {
        if (state.cloneManualSourceCatalogId) {
          delete state.cloneCatalogMappings[state.cloneManualSourceCatalogId];
        }
        state.cloneManualSourceCatalogId = target.value;
        if (state.cloneManualSourceCatalogId) {
          state.cloneCatalogMappings[state.cloneManualSourceCatalogId] = state
            .cloneTargetBusiness?.id
            ? "__copy__"
            : "";
        }
      }
      if (target.dataset.action === "clone-catalog-map") {
        state.cloneCatalogMappings[target.dataset.sourceCatalogId] =
          target.value;
      }
      renderCloneMappings();
    });

    state.uiReady = true;
    renderUI();
    log("info", "UI ready. Connecting session...");
    if (!window.__ADREPLICA_QA_SUPPRESS_AUTO_INIT__) {
      initializeSession().catch(() => {});
    }
  }

  destroy() {
    if (this.dependencies.state.operationActive) return false;
    const { dom } = this.dependencies;
    if (dom.root?.parentNode) {
      dom.root.parentNode.removeChild(dom.root);
    }
    if (dom.serviceOutsideClick) {
      document.removeEventListener("click", dom.serviceOutsideClick);
      dom.serviceOutsideClick = null;
    }
    document.getElementById(NATIVE_FETCH_FRAME_ID)?.remove();
    delete window.AdReplica;
  }

  injectStyles() {
    const style =
      document.getElementById(`${APP_ID}-styles`) ||
      document.createElement("style");
    style.id = `${APP_ID}-styles`;
    style.textContent = buildAdReplicaStyles(APP_ID);
    if (!style.isConnected) document.head.appendChild(style);
  }
}
