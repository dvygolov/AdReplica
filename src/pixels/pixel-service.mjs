import { sanitizeFileName } from "../utils/string.mjs";

/** PixelService. Dependencies are supplied by the application composition root. */
export class PixelService {
  constructor(dependencies) {
    this.dependencies = dependencies;
    this.createPixel = this.createPixel.bind(this);
    this.resolvePixelMap = this.resolvePixelMap.bind(this);
  }

  async createPixel(accountId, sourcePixelId, campaignName) {
    const { state } = this.dependencies;
    const { log } = this.dependencies.logging;
    const { graphFetch } = this.dependencies.graphClient;
    const { invalidateAccountContextCache } =
      this.dependencies.accountContextService;
    const name = `Imported_${sanitizeFileName(campaignName || "campaign")}_${sourcePixelId}`;
    {
      const created = await graphFetch(`act_${accountId}/adspixels`, {
        method: "POST",
        body: { name },
      });
      state.operationReport?.record("pixel", created.id, name);
      invalidateAccountContextCache(accountId);
      log(
        "info",
        `Created new pixel ${created.id} for source ${sourcePixelId}.`,
      );
      return String(created.id);
    }
  }

  async resolvePixelMap(accountId) {
    const { state } = this.dependencies;
    const { getImportSourcePixels } = this.dependencies.mediaSlots;
    const { createPixel } = this;
    const mapping = {};
    for (const sourcePixel of getImportSourcePixels()) {
      const selected =
        state.importPixelMappings[sourcePixel.id] ||
        (state.importAccountPixels.some((item) => item.id === sourcePixel.id)
          ? sourcePixel.id
          : "__create__");
      if (selected === "__create__") {
        mapping[sourcePixel.id] = await createPixel(
          accountId,
          sourcePixel.id,
          state.importPackage?.source?.campaignName || "",
        );
      } else {
        mapping[sourcePixel.id] = selected;
      }
    }
    return mapping;
  }
}
