/** ImportController. Dependencies are supplied by the application composition root. */
export class ImportController {
  constructor(dependencies) {
    this.dependencies = dependencies;
    this.handleImportJsonSelected = this.handleImportJsonSelected.bind(this);
    this.handleImportMediaSelected = this.handleImportMediaSelected.bind(this);
  }

  async handleImportJsonSelected(event) {
    const { state } = this.dependencies;
    const { log } = this.dependencies.logging;
    const { renderImportMappings } = this.dependencies.mappingsView;
    const { refreshImportAccountContext, applyPackageToImportState } =
      this.dependencies.mappingController;
    const file =
      event.target.files && event.target.files[0]
        ? event.target.files[0]
        : null;
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (
        !data ||
        typeof data !== "object" ||
        !data.campaign ||
        !Array.isArray(data.adsets) ||
        !Array.isArray(data.ads) ||
        !Array.isArray(data.creatives)
      ) {
        throw new Error("JSON format does not match export package.");
      }
      applyPackageToImportState(data, {
        campaignName: data.campaign?.name || data.source?.campaignName || "",
        pageMappings: {},
        pixelMappings: {},
        catalogMappings: {},
        mediaFiles: new Map(),
        mediaOverrides: new Map(),
        asDraft: state.importAsDraft,
        status: state.importStatus,
      });
      await refreshImportAccountContext();
      renderImportMappings();
      log("info", `JSON loaded: ${file.name}`);
    } catch (error) {
      log("error", "Error reading JSON.", String(error));
    }
  }

  async handleImportMediaSelected(event) {
    const { state } = this.dependencies;
    const { log } = this.dependencies.logging;
    const { renderImportMappings } = this.dependencies.mappingsView;
    const files = [...(event.target.files || [])];
    state.importMediaFiles = new Map(files.map((file) => [file.name, file]));
    renderImportMappings();
    log("info", `Media files loaded: ${files.length}`);
  }
}
