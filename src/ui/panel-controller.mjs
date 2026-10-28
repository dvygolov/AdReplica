import { Config } from "../config.mjs";
import {
  APP_ID,
  APP_MARK_SVG,
  NATIVE_FETCH_FRAME_ID,
} from "../app/constants.mjs";
import { buildAdReplicaStyles } from "./styles.mjs";
import { FLAGS, getLang, setLang, t } from "./i18n.mjs";

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
    const { renderImportMappings } = this.dependencies.mappingsView;
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
    const { massCloneController } = this.dependencies;
    const { ensureClonePackageLoaded } = this.dependencies.cloneWorkflow;
    const { handleImportJsonSelected } = this.dependencies.importController;
    const { clearCurrentAccountDrafts } = this.dependencies.draftController;
    const { importPackage } = this.dependencies.importWorkflow;
    const { localVersions } = this.dependencies;
    localVersions.captureCurrent();
    injectStyles();

    const root = document.createElement("div");
    root.id = APP_ID;
    root.innerHTML = `
      <button type="button" id="${APP_ID}-mini" class="sk-mini" data-always-enabled title="${t("btn.restore")}" aria-label="${t("btn.restore")}">${APP_MARK_SVG}</button>
      <div class="sk-shell">
        <div class="sk-loading" id="${APP_ID}-loading">
          <div class="sk-spinner"></div>
        </div>

        <div class="sk-head">
          <div class="sk-brand">
            ${APP_MARK_SVG}
            <div class="sk-brand-text">
              <h2>AdReplica</h2>
              <div class="sk-build">${t("ver", { version: Config.VERSION })}</div>
              <a class="sk-byline" href="https://yellowweb.top" target="_blank">by Yellow Web</a>
            </div>
          </div>
          <div class="sk-head-right">
            <div class="sk-lang" role="group" aria-label="Language">
              <button type="button" data-lang="ru" data-always-enabled title="${t("lang.ru")}" aria-pressed="false">${FLAGS.ru}</button>
              <button type="button" data-lang="en" data-always-enabled title="${t("lang.en")}" aria-pressed="true">${FLAGS.en}</button>
            </div>
            <button id="${APP_ID}-service" class="sk-icon" data-always-enabled title="${t("btn.service")}" aria-label="${t("btn.service")}" aria-expanded="false">&#9881;</button>
            <button id="${APP_ID}-minimize" class="sk-icon sk-minimize" data-always-enabled title="${t("btn.minimize")}" aria-label="${t("btn.minimize")}">&#x2013;</button>
            <button id="${APP_ID}-close" class="sk-icon sk-close" data-always-enabled title="${t("btn.close")}" aria-label="${t("btn.close")}">&#x2715;</button>
            <div id="${APP_ID}-service-menu" class="sk-menu sk-hidden">
              <button data-role="busy-lock" id="${APP_ID}-clear-drafts" type="button">${t("menu.clearDrafts")}</button>
              <button id="${APP_ID}-previous-version" type="button">${t("menu.prevVersion")}</button>
              <div id="${APP_ID}-version-note" class="sk-version-note" role="status"></div>
            </div>
          </div>
        </div>

        <div class="sk-tabs">
          <button class="sk-tab sk-tab-active" data-tab="export">${t("tab.export")}</button>
          <button class="sk-tab" data-tab="import">${t("tab.import")}</button>
          <button class="sk-tab" data-tab="clone">${t("tab.clone")}</button>
        </div>

        <div class="sk-body">
          <div class="sk-tab-panel" id="${APP_ID}-panel-export">
            <section class="sk-card">
              <h3 class="sk-sec">${t("tab.export")}</h3>
              <div class="sk-row">
                <label class="sk-field">
                  <span>${t("field.account")}</span>
                  <select id="${APP_ID}-export-account"></select>
                </label>
                <label class="sk-field">
                  <span>${t("field.campaign")}</span>
                  <select id="${APP_ID}-export-campaign"></select>
                </label>
              </div>
              <div class="sk-bar">
                <div class="sk-hint">${t("export.hint")}</div>
                <div class="sk-bar-right">
                  <button class="sk-primary" data-role="busy-lock" id="${APP_ID}-export">${t("btn.export")}</button>
                </div>
              </div>
            </section>
          </div>

          <div class="sk-tab-panel sk-hidden" id="${APP_ID}-panel-import">
            <section class="sk-card">
              <h3 class="sk-sec">${t("tab.import")}</h3>
              <div class="sk-row">
                <label class="sk-field">
                  <span>${t("field.account")}</span>
                  <select id="${APP_ID}-import-account"></select>
                </label>
                <label class="sk-field">
                  <span>${t("import.json")}</span>
                  <input type="file" id="${APP_ID}-import-json" accept=".json,application/json" />
                </label>
              </div>
              <div class="sk-row">
                <label class="sk-field">
                  <span>${t("field.campaignName")}</span>
                  <input type="text" id="${APP_ID}-import-campaign-name" placeholder="${t("opt.notSelected")}" />
                </label>
                <label class="sk-field sk-narrow">
                  <span>${t("field.importMode")}</span>
                  <select id="${APP_ID}-import-mode">
                    <option value="DRAFT">DRAFT</option>
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="PAUSED" selected>PAUSED</option>
                  </select>
                </label>
              </div>
              <details class="sk-mappings">
                <summary>${t("clone.mappings")}</summary>
                <div id="${APP_ID}-import-mappings"></div>
              </details>
              <div class="sk-bar">
                <div class="sk-hint">${t("import.hint")}</div>
                <div class="sk-bar-right">
                  <button class="sk-primary" data-role="busy-lock" id="${APP_ID}-import">${t("btn.import")}</button>
                </div>
              </div>
            </section>
          </div>

          <div class="sk-tab-panel sk-hidden" id="${APP_ID}-panel-clone">
            <section class="sk-card">
              <h3 class="sk-sec">
                ${t("clone.s1")}
                <button type="button" class="sk-info" id="${APP_ID}-clone-collapse" data-always-enabled title="${t("clone.collapse")}">±</button>
              </h3>
              <div class="sk-summary sk-hidden" id="${APP_ID}-clone-summary"></div>
              <div id="${APP_ID}-clone-source-body">
              <div class="sk-row sk-row-source">
                <label class="sk-field sk-source-account">
                  <span>${t("field.sourceAccount")}</span>
                  <select id="${APP_ID}-clone-source-account"></select>
                </label>
                <label class="sk-field">
                  <span>${t("field.sourceCampaign")}</span>
                  <select id="${APP_ID}-clone-source-campaign"></select>
                </label>
              </div>
              <div class="sk-stats" id="${APP_ID}-clone-package-summary"></div>
              <div class="sk-row">
                <label class="sk-field sk-grow">
                  <span>${t("field.template")}
                    <button type="button" class="sk-info" id="${APP_ID}-clone-macros" data-always-enabled aria-label="${t("macros.title")}">i</button>
                  </span>
                  <input type="text" id="${APP_ID}-clone-campaign-name" placeholder="{source} — {account}" />
                </label>
                <label class="sk-field sk-narrow">
                  <span>${t("field.mode")}</span>
                  <select id="${APP_ID}-clone-mode">
                    <option value="DRAFT">DRAFT</option>
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="PAUSED" selected>PAUSED</option>
                  </select>
                </label>
              </div>
              <div class="sk-macros-pop sk-hidden" id="${APP_ID}-clone-macros-pop" data-always-enabled>
                <b>${t("macros.hint")}</b>
                <ul>
                  <li><code>{source}</code><span>${t("macros.source")}</span></li>
                  <li><code>{account}</code><span>${t("macros.account")}</span></li>
                  <li><code>{account_id}</code><span>${t("macros.accountId")}</span></li>
                  <li><code>{currency}</code><span>${t("macros.currency")}</span></li>
                  <li><code>{mode}</code><span>${t("macros.mode")}</span></li>
                  <li><code>{n}</code><span>${t("macros.index")}</span></li>
                  <li><code>{date}</code><span>${t("macros.date")}</span></li>
                </ul>
              </div>
              </div>
            </section>

            <section class="sk-card">
              <h3 class="sk-sec">${t("clone.s2")}
                <input type="search" class="sk-search" id="${APP_ID}-clone-search" placeholder="${t("clone.search")}" aria-label="${t("clone.search")}" />
                <span class="sk-count" id="${APP_ID}-clone-targets-count"></span>
              </h3>
              <div class="sk-scroll">
                <table class="sk-tbl sk-tbl-targets">
                  <thead>
                    <tr>
                      <th class="sk-chk"><input type="checkbox" id="${APP_ID}-clone-master" data-always-enabled /></th>
                      <th>${t("field.account")}</th>
                      <th>${t("field.fanPage")}</th>
                      <th>${t("field.pixel")}</th>
                      <th class="sk-hidden" id="${APP_ID}-clone-th-catalog">${t("field.catalog")}</th>
                      <th>${t("field.currency")}</th>
                    </tr>
                  </thead>
                  <tbody id="${APP_ID}-clone-targets-body"></tbody>
                </table>
              </div>
            </section>

            <section class="sk-card sk-hidden" id="${APP_ID}-clone-run-card">
              <h3 class="sk-sec">${t("clone.s4")} <span class="sk-count">${t("clone.s4note")}</span></h3>
              <div class="sk-progress"><i id="${APP_ID}-clone-progress"></i></div>
              <div class="sk-run-stats" id="${APP_ID}-clone-counters"></div>
              <div class="sk-scroll sk-jobs" id="${APP_ID}-mass-progress"></div>
              <div class="sk-console" id="${APP_ID}-clone-console"></div>
              <div class="sk-bar">
                <div class="sk-hint">${t("run.hint")}</div>
                <div class="sk-bar-right">
                  <button id="${APP_ID}-mass-stop" class="sk-danger" data-always-enabled disabled>${t("btn.stop")}</button>
                  <button id="${APP_ID}-mass-retry" class="sk-secondary" disabled>${t("btn.retry")}</button>
                  <button id="${APP_ID}-mass-reset" class="sk-secondary" data-always-enabled>${t("btn.reset")}</button>
                </div>
              </div>
            </section>

            <select id="${APP_ID}-clone-target-account" class="sk-hidden"></select>
          </div>
        </div>

        <div class="sk-footer sk-hidden" id="${APP_ID}-clone-footer">
          <div class="sk-hint" id="${APP_ID}-clone-hint">${t("clone.hint")}</div>
          <div class="sk-bar-right">
            <button data-role="busy-lock" id="${APP_ID}-clone" class="sk-primary">${t("btn.clone")}</button>
          </div>
        </div>
        <details class="sk-logs">
          <summary class="sk-log-head">
            <span class="sk-log-t"><svg class="sk-chev" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M3 1 L7 5 L3 9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>${t("logs.title")}</span>
            <button type="button" class="sk-secondary sk-log-dl" id="${APP_ID}-download-logs">${t("logs.download")}</button>
          </summary>
          <textarea id="${APP_ID}-logs" class="sk-log-area" readonly placeholder="${t("log.empty")}"></textarea>
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
    dom.cloneCatalogHead = root.querySelector(`#${APP_ID}-clone-th-catalog`);
    dom.cloneTargetsBody = root.querySelector(`#${APP_ID}-clone-targets-body`);
    dom.cloneMaster = root.querySelector(`#${APP_ID}-clone-master`);
    dom.cloneSearch = root.querySelector(`#${APP_ID}-clone-search`);
    dom.cloneTargetsCount = root.querySelector(
      `#${APP_ID}-clone-targets-count`,
    );
    dom.cloneRunCard = root.querySelector(`#${APP_ID}-clone-run-card`);
    dom.cloneFooter = root.querySelector(`#${APP_ID}-clone-footer`);
    dom.cloneSourceBody = root.querySelector(`#${APP_ID}-clone-source-body`);
    dom.cloneSummary = root.querySelector(`#${APP_ID}-clone-summary`);
    dom.cloneCollapseButton = root.querySelector(`#${APP_ID}-clone-collapse`);
    dom.cloneProgressBar = root.querySelector(`#${APP_ID}-clone-progress`);
    dom.cloneCounters = root.querySelector(`#${APP_ID}-clone-counters`);
    dom.cloneConsole = root.querySelector(`#${APP_ID}-clone-console`);
    dom.macrosButton = root.querySelector(`#${APP_ID}-clone-macros`);
    dom.macrosPop = root.querySelector(`#${APP_ID}-clone-macros-pop`);
    dom.massCloneProgress = root.querySelector(`#${APP_ID}-mass-progress`);
    dom.massResetButton = root.querySelector(`#${APP_ID}-mass-reset`);
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
    // Collapse morphs the whole window into the mark pinned to the corner.
    const minimizeButton = root.querySelector(`#${APP_ID}-minimize`);
    const setCollapsed = (collapsed) => {
      root.classList.toggle("sk-min", collapsed);
      if (minimizeButton) {
        const label = t(collapsed ? "btn.restore" : "btn.minimize");
        minimizeButton.title = label;
        minimizeButton.setAttribute("aria-label", label);
      }
    };
    // Delegated on purpose: the head markup is rebuilt on re-render, so a
    // listener hung on the button itself would be lost with the old node.
    root.addEventListener("click", (event) => {
      if (event.target?.closest?.(`#${APP_ID}-mini`)) {
        event.preventDefault();
        setCollapsed(false);
        return;
      }
      const target = event.target?.closest?.(`#${APP_ID}-minimize`);
      if (target) {
        event.preventDefault();
        setCollapsed(!root.classList.contains("sk-min"));
        return;
      }
      if (root.classList.contains("sk-min")) {
        event.stopPropagation();
        setCollapsed(false);
      }
    });
    root.querySelector(`#${APP_ID}-close`).addEventListener("click", destroy);
    root.querySelectorAll(".sk-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.activeTab = btn.dataset.tab;
        renderUI();
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
        if (btn.dataset.tab === "clone") {
          massCloneController.ensureTargetsLoaded();
        }
      });
    });
    // Bind the clone flow up front: the panel is remounted on session changes
    // and the wiring must exist before the first click.
    massCloneController.bind(root);
    if (state.activeTab && state.activeTab !== "export") {
      root.querySelector(`.sk-tab[data-tab="${state.activeTab}"]`)?.click();
    }
    root
      .querySelector(`#${APP_ID}-export`)
      .addEventListener("click", exportSelectedCampaign);
    root
      .querySelector(`#${APP_ID}-import`)
      .addEventListener("click", () => importPackage());
    root
      .querySelector(`#${APP_ID}-clone`)
      .addEventListener("click", () => massCloneController.runMassClone());
    const syncLangButtons = () => {
      root.querySelectorAll("[data-lang]").forEach((button) => {
        button.classList.toggle("sk-active", button.dataset.lang === getLang());
        button.setAttribute(
          "aria-pressed",
          button.dataset.lang === getLang() ? "true" : "false",
        );
      });
    };
    syncLangButtons();
    root.querySelectorAll("[data-lang]").forEach((button) => {
      button.addEventListener("click", () => {
        if (button.dataset.lang === getLang()) return;
        setLang(button.dataset.lang);
        dom.root?.remove();
        this.mount();
      });
    });
    if (dom.macrosButton && dom.macrosPop) {
      dom.macrosButton.addEventListener("click", (event) => {
        event.stopPropagation();
        dom.macrosPop.classList.toggle("sk-hidden");
      });
      dom.macrosPop.addEventListener("click", (event) =>
        event.stopPropagation(),
      );
      document.addEventListener("click", () => {
        dom.macrosPop?.classList.add("sk-hidden");
      });
    }
    if (dom.cloneCollapseButton) {
      dom.cloneCollapseButton.addEventListener("click", () => {
        state.cloneSourceCollapsed = !state.cloneSourceCollapsed;
        renderUI();
      });
    }
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
        renderUI();
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
        renderUI();
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
    state.uiReady = true;
    renderUI();
    if (state.activeTab === "clone") massCloneController.ensureTargetsLoaded();
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
