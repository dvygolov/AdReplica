import { buildDefaultCloneCampaignName } from "../domain/names.mjs";
import { getSourceCatalogsFromPackage } from "../domain/package.mjs";
import { normalizeImportOptions } from "../domain/options.mjs";

/** CloneWorkflow. Dependencies are supplied by the application composition root. */
export class CloneWorkflow {
  constructor(dependencies) {
    this.dependencies = dependencies;
    this.ensureClonePackageLoaded = this.ensureClonePackageLoaded.bind(this);
    this.buildMediaFilesFromPackage =
      this.buildMediaFilesFromPackage.bind(this);
    this.withManualSourceCatalog = this.withManualSourceCatalog.bind(this);
    this.cloneCampaignToAccount = this.cloneCampaignToAccount.bind(this);
  }

  async ensureClonePackageLoaded() {
    const { state, dom } = this.dependencies;
    const { log } = this.dependencies.logging;
    const { setBusy } = this.dependencies.panelView;
    const { renderCloneMappings } = this.dependencies.mappingsView;
    const { initializeSession } = this.dependencies.sessionService;
    const { enforceCloneModeConstraints, refreshCloneTargetContext } =
      this.dependencies.mappingController;
    const { refreshCloneSourceContext } = this.dependencies.campaignController;
    const { fetchCampaignExportPackage } = this.dependencies.campaignExporter;
    if (!state.cloneSourceAccountId || !state.cloneSourceCampaignId) {
      state.clonePackageLoading = false;
      return null;
    }
    const currentKey = `${state.cloneSourceAccountId}:${state.cloneSourceCampaignId}`;
    const cachedKey = state.clonePackage
      ? `${state.clonePackage.source?.accountId || ""}:${state.clonePackage.source?.campaignId || ""}`
      : "";
    if (currentKey === cachedKey) {
      state.clonePackageLoading = true;
      renderCloneMappings();
      await refreshCloneTargetContext();
      state.clonePackageLoading = false;
      renderCloneMappings();
      return state.clonePackage;
    }
    setBusy(true);
    state.clonePackageLoading = true;
    renderCloneMappings();
    try {
      await initializeSession();
      const existingPageMappings = { ...state.clonePageMappings };
      const existingPixelMappings = { ...state.clonePixelMappings };
      const existingCatalogMappings = { ...state.cloneCatalogMappings };
      await refreshCloneSourceContext();
      state.clonePackage = await fetchCampaignExportPackage(
        state.cloneSourceAccountId,
        state.cloneSourceCampaignId,
      );
      const sourceCampaignName =
        state.clonePackage.campaign?.name ||
        state.clonePackage.source?.campaignName ||
        "";
      state.cloneCampaignName =
        buildDefaultCloneCampaignName(sourceCampaignName);
      state.clonePageMappings = existingPageMappings;
      state.clonePixelMappings = existingPixelMappings;
      state.cloneCatalogMappings = existingCatalogMappings;
      enforceCloneModeConstraints();
      if (dom.cloneCampaignName) {
        dom.cloneCampaignName.value = state.cloneCampaignName;
      }
      await refreshCloneTargetContext();
      renderCloneMappings();
      log(
        "info",
        `Clone package loaded: ${state.clonePackage.source?.campaignName || state.cloneSourceCampaignId}`,
      );
      return state.clonePackage;
    } catch (error) {
      state.clonePackage = null;
      log("error", "Failed to load clone package.", String(error));
      throw error;
    } finally {
      state.clonePackageLoading = false;
      renderCloneMappings();
      setBusy(false);
    }
  }

  async buildMediaFilesFromPackage(packageData) {
    const { log } = this.dependencies.logging;
    const { createRemoteMediaFile } = this.dependencies.downloadService;
    const files = new Map();
    for (const file of packageData?._downloadQueue || []) {
      log("info", `Preparing server-side media copy for ${file.fileName}...`);
      files.set(file.fileName, createRemoteMediaFile(file));
    }
    return files;
  }

  withManualSourceCatalog(packageData) {
    const { state } = this.dependencies;
    if (!packageData || !state.cloneManualSourceCatalogId) {
      return packageData;
    }
    if (getSourceCatalogsFromPackage(packageData).length) {
      return packageData;
    }
    const sourceCatalog = state.cloneSourceCatalogs.find(
      (item) => item.id === state.cloneManualSourceCatalogId,
    ) || {
      id: state.cloneManualSourceCatalogId,
      name: state.cloneManualSourceCatalogId,
    };
    return {
      ...packageData,
      catalogs: [
        {
          id: sourceCatalog.id,
          name: sourceCatalog.name || sourceCatalog.id,
          manual: true,
        },
      ],
    };
  }

  async cloneCampaignToAccount(options = {}) {
    const { state, dom } = this.dependencies;
    const { log } = this.dependencies.logging;
    const { setBusy } = this.dependencies.panelView;
    const { initializeSession } = this.dependencies.sessionService;
    const { refreshImportAccountContext, applyPackageToImportState } =
      this.dependencies.mappingController;
    const {
      ensureClonePackageLoaded,
      buildMediaFilesFromPackage,
      withManualSourceCatalog,
    } = this;
    const { importPackage } = this.dependencies.importWorkflow;
    const cloneOptions = normalizeImportOptions(options);
    if (
      !state.cloneSourceAccountId ||
      !state.cloneSourceCampaignId ||
      !state.cloneTargetAccountId
    ) {
      log(
        "warn",
        "Select source account, source campaign, and target account first.",
      );
      return false;
    }
    setBusy(true);
    const requestedName = state.cloneCampaignName;
    try {
      await initializeSession();
      if (dom.cloneCampaignName) {
        state.cloneCampaignName = dom.cloneCampaignName.value.trim();
      }
      const packageData = withManualSourceCatalog(
        await ensureClonePackageLoaded(),
      );
      state.cloneCampaignName = requestedName || state.cloneCampaignName;
      if (state.operationReport) {
        state.operationReport.expected = {
          campaign: 1,
          adset: packageData.adsets.length,
          ad: packageData.ads.length,
        };
        state.operationReport.campaignName = state.cloneCampaignName;
      }
      const mediaFiles = await buildMediaFilesFromPackage(packageData);
      state.importAccountId = state.cloneTargetAccountId;
      applyPackageToImportState(packageData, {
        campaignName:
          state.cloneCampaignName ||
          packageData.campaign?.name ||
          packageData.source?.campaignName ||
          "",
        pageMappings: state.clonePageMappings,
        pixelMappings: state.clonePixelMappings,
        catalogMappings: state.cloneCatalogMappings,
        mediaFiles,
        mediaOverrides: new Map(),
        asDraft: state.cloneAsDraft,
        status: state.cloneAsDraft ? "PAUSED" : state.cloneStatus,
        preserveSchedule: true,
      });
      await refreshImportAccountContext();
      log(
        "info",
        `Clone started: ${packageData.source?.campaignName || state.cloneSourceCampaignId} -> ${state.cloneTargetAccountId}`,
      );
      const success = await importPackage({
        ...cloneOptions,
        pageMappings: state.clonePageMappings,
        pixelMappings: state.clonePixelMappings,
        catalogMappings: state.cloneCatalogMappings,
        reloadOnSuccess: cloneOptions.reloadOnSuccess !== false,
      });
      if (success) {
        log("info", "Clone pipeline finished.");
      } else {
        log(
          "warn",
          "Clone pipeline stopped because import did not complete successfully.",
        );
      }
      return success;
    } catch (error) {
      state.operationReport?.issue(error.message, {
        uncertain: Boolean(error.uncertain),
      });
      log("error", "Clone error.", String(error));
      return false;
    } finally {
      setBusy(false);
    }
  }
}
