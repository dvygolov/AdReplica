import {
  getSourceCatalogsFromPackage,
  getSourcePagesFromPackage,
  getSourcePixelsFromPackage,
} from "../domain/package.mjs";

/** MappingController. Dependencies are supplied by the application composition root. */
export class MappingController {
  constructor(dependencies) {
    this.dependencies = dependencies;
    this.applyDefaultMappings = this.applyDefaultMappings.bind(this);
    this.packageUsesCatalogs = this.packageUsesCatalogs.bind(this);
    this.importRequiresDraftOnly = this.importRequiresDraftOnly.bind(this);
    this.cloneRequiresDraftOnly = this.cloneRequiresDraftOnly.bind(this);
    this.getModeOptionsMarkup = this.getModeOptionsMarkup.bind(this);
    this.enforceImportModeConstraints =
      this.enforceImportModeConstraints.bind(this);
    this.enforceCloneModeConstraints =
      this.enforceCloneModeConstraints.bind(this);
    this.refreshImportAccountContext =
      this.refreshImportAccountContext.bind(this);
    this.refreshCloneTargetContext = this.refreshCloneTargetContext.bind(this);
    this.applyPackageToImportState = this.applyPackageToImportState.bind(this);
  }

  applyDefaultMappings(
    packageData,
    pages,
    pixels,
    catalogs,
    pageMappings,
    pixelMappings,
    catalogMappings,
  ) {
    for (const page of getSourcePagesFromPackage(packageData)) {
      const current = pageMappings[page.id];
      if (current && (pages || []).some((item) => item.id === current)) {
        continue;
      }
      pageMappings[page.id] = (pages || []).some((item) => item.id === page.id)
        ? page.id
        : pages?.[0]?.id || "";
    }
    for (const pixel of getSourcePixelsFromPackage(packageData)) {
      const current = pixelMappings[pixel.id];
      if (
        current === "__create__" ||
        (current && (pixels || []).some((item) => item.id === current))
      ) {
        continue;
      }
      pixelMappings[pixel.id] = (pixels || []).some(
        (item) => item.id === pixel.id,
      )
        ? pixel.id
        : "__create__";
    }
    for (const catalog of getSourceCatalogsFromPackage(packageData)) {
      const current = catalogMappings[catalog.id];
      if (
        current === "__copy__" ||
        (String(current).startsWith("__copy_into__:") &&
          (catalogs || []).some(
            (item) =>
              String(item.id) === current.slice("__copy_into__:".length),
          ))
      ) {
        continue;
      }
      if (current && (catalogs || []).some((item) => item.id === current)) {
        continue;
      }
      catalogMappings[catalog.id] = (catalogs || []).some(
        (item) => item.id === catalog.id,
      )
        ? catalog.id
        : "";
    }
  }

  packageUsesCatalogs(packageData) {
    return getSourceCatalogsFromPackage(packageData).length > 0;
  }

  importRequiresDraftOnly(packageData = this.dependencies.state.importPackage) {
    const { packageUsesCatalogs } = this;
    return packageUsesCatalogs(packageData);
  }

  cloneRequiresDraftOnly(packageData = this.dependencies.state.clonePackage) {
    const { state } = this.dependencies;
    const { packageUsesCatalogs } = this;
    return (
      packageUsesCatalogs(packageData) ||
      Boolean(state.cloneManualSourceCatalogId)
    );
  }

  getModeOptionsMarkup(draftOnly) {
    return `
      <option value="DRAFT">DRAFT</option>
      ${
        draftOnly
          ? ""
          : `
      <option value="ACTIVE">ACTIVE</option>
      <option value="PAUSED">PAUSED</option>`
      }
    `;
  }

  enforceImportModeConstraints() {
    const { state } = this.dependencies;
    const { importRequiresDraftOnly } = this;
    if (!importRequiresDraftOnly()) {
      return;
    }
    state.importAsDraft = true;
    state.importStatus = "PAUSED";
  }

  enforceCloneModeConstraints() {
    const { state } = this.dependencies;
    const { cloneRequiresDraftOnly } = this;
    if (!cloneRequiresDraftOnly()) {
      return;
    }
    state.cloneAsDraft = true;
    state.cloneStatus = "PAUSED";
  }

  async refreshImportAccountContext() {
    const { state } = this.dependencies;
    const { log } = this.dependencies.logging;
    const { fetchAccountContext } = this.dependencies.accountContextService;
    const { applyDefaultMappings } = this;
    if (!state.importAccountId || !state.sessionReady) return;
    const accountId = state.importAccountId;
    try {
      const context = await fetchAccountContext(accountId);
      if (state.importAccountId !== accountId) return;
      state.pages = context.pages;
      state.importAccountPixels = context.pixels;
      state.importTargetBusiness = context.business;
      state.importTargetCatalogs = context.catalogs;
      applyDefaultMappings(
        state.importPackage,
        state.pages,
        state.importAccountPixels,
        state.importTargetCatalogs,
        state.importPageMappings,
        state.importPixelMappings,
        state.importCatalogMappings,
      );
    } catch (error) {
      log("error", "Failed to refresh import context.", String(error));
    }
  }

  async refreshCloneTargetContext() {
    const { state } = this.dependencies;
    const { log } = this.dependencies.logging;
    const { fetchAccountContext } = this.dependencies.accountContextService;
    const { applyDefaultMappings } = this;
    if (!state.cloneTargetAccountId || !state.sessionReady) return;
    const accountId = state.cloneTargetAccountId;
    try {
      const context = await fetchAccountContext(accountId);
      if (state.cloneTargetAccountId !== accountId) return;
      state.clonePages = context.pages;
      state.cloneTargetPixels = context.pixels;
      state.cloneTargetBusiness = context.business;
      state.cloneTargetCatalogs = context.catalogs;
      applyDefaultMappings(
        state.clonePackage,
        state.clonePages,
        state.cloneTargetPixels,
        state.cloneTargetCatalogs,
        state.clonePageMappings,
        state.clonePixelMappings,
        state.cloneCatalogMappings,
      );
    } catch (error) {
      log("error", "Failed to refresh clone target context.", String(error));
    }
  }

  applyPackageToImportState(data, options = {}) {
    const { state, dom } = this.dependencies;
    const { enforceImportModeConstraints } = this;
    state.importPackage = data;
    state.importCampaignName =
      options.campaignName ??
      (data?.campaign?.name || data?.source?.campaignName || "");
    state.importPageMappings = { ...(options.pageMappings || {}) };
    state.importPixelMappings = { ...(options.pixelMappings || {}) };
    state.importCatalogMappings = { ...(options.catalogMappings || {}) };
    state.importMediaFiles =
      options.mediaFiles instanceof Map
        ? new Map(options.mediaFiles)
        : new Map();
    state.importMediaOverrides =
      options.mediaOverrides instanceof Map
        ? new Map(options.mediaOverrides)
        : new Map();
    state.importAsDraft = options.asDraft ?? true;
    state.importStatus = options.status ?? "PAUSED";
    state.importPreserveSchedule = options.preserveSchedule ?? false;
    enforceImportModeConstraints();
    if (dom.importCampaignName) {
      dom.importCampaignName.value = state.importCampaignName;
    }
    if (dom.importModeSelect) {
      dom.importModeSelect.value = state.importAsDraft
        ? "DRAFT"
        : state.importStatus;
    }
  }
}
