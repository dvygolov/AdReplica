import { sanitizeFileName } from "../utils/string.mjs";

const PIXEL_ALREADY_EXISTS_CODE = 6200;

/** PixelService. Dependencies are supplied by the application composition root. */
export class PixelService {
  constructor(dependencies) {
    this.dependencies = dependencies;
    this.isPixelAlreadyExistsError = this.isPixelAlreadyExistsError.bind(this);
    this.fetchAccountPixels = this.fetchAccountPixels.bind(this);
    this.resolveExistingPixel = this.resolveExistingPixel.bind(this);
    this.createPixel = this.createPixel.bind(this);
    this.resolvePixelMap = this.resolvePixelMap.bind(this);
  }

  /** Meta refuses a second API-created pixel on an account that already has one. */
  isPixelAlreadyExistsError(error) {
    const code = Number(
      error?.details?.code ?? error?.code ?? error?.details?.error?.code ?? 0,
    );
    const message = String(
      error?.details?.message || error?.message || error || "",
    );
    return (
      code === PIXEL_ALREADY_EXISTS_CODE ||
      /already exists for this account/i.test(message)
    );
  }

  async fetchAccountPixels(accountId) {
    const { graphGetAll } = this.dependencies.graphClient;
    const normalizedAccountId = String(accountId || "").replace(/^act_/, "");
    const rows = await graphGetAll(`act_${normalizedAccountId}/adspixels`, {
      fields: "id,name",
    });
    return (rows || [])
      .map((row) => ({
        id: String(row?.id || ""),
        name: String(row?.name || row?.id || ""),
      }))
      .filter((row) => row.id);
  }

  async resolveExistingPixel(accountId) {
    const { fetchAccountPixels } = this;
    try {
      return await fetchAccountPixels(accountId);
    } catch (_error) {
      return [];
    }
  }

  async createPixel(accountId, sourcePixelId, campaignName) {
    const { state } = this.dependencies;
    const { log } = this.dependencies.logging;
    const { graphFetch } = this.dependencies.graphClient;
    const { invalidateAccountContextCache } =
      this.dependencies.accountContextService;
    const { isPixelAlreadyExistsError, resolveExistingPixel } = this;
    const account = String(accountId || "").replace(/^act_/, "");
    const sourceLabel = /^\d+$/.test(String(sourcePixelId || ""))
      ? String(sourcePixelId)
      : "source";
    const name = `Imported_${sanitizeFileName(campaignName || "campaign")}_${sourceLabel}`;
    const reuse = (pixels, reason) => {
      const pixel = pixels[0];
      const available = pixels.map((item) => item.id).join(", ");
      state.operationReport?.issue(
        `Reused existing pixel ${pixel.id} on act_${account} instead of creating a new one (${reason}). Available pixels: ${available}.`,
        { stage: "pixel" },
      );
      invalidateAccountContextCache(account);
      log(
        "warn",
        `Pixel creation is not available on act_${account} (${reason}); reusing existing pixel ${pixel.id}.`,
      );
      state.operationReport?.record("pixel", pixel.id, pixel.name, {
        accountId: account,
        reused: true,
      });
      return pixel.id;
    };

    const existing = await resolveExistingPixel(account);
    if (existing.length) {
      return reuse(
        existing,
        "Meta allows only one API-created pixel per ad account",
      );
    }

    try {
      const created = await graphFetch(`act_${account}/adspixels`, {
        method: "POST",
        body: { name },
      });
      state.operationReport?.record("pixel", created.id, name);
      invalidateAccountContextCache(account);
      log("info", `Created new pixel ${created.id} for source ${sourceLabel}.`);
      return String(created.id);
    } catch (error) {
      if (!isPixelAlreadyExistsError(error)) {
        throw error;
      }
      const appeared = await resolveExistingPixel(account);
      if (!appeared.length) {
        throw error;
      }
      return reuse(appeared, "the ad account already has a pixel");
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
