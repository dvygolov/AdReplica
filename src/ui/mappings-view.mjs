import { escapeHtml } from "../utils/string.mjs";
import {
  getSourceCatalogsFromPackage,
  getSourcePagesFromPackage,
  getSourcePixelsFromPackage,
} from "../domain/package.mjs";
import { getAccountLabel } from "../domain/creative.mjs";

/** MappingsView. Dependencies are supplied by the application composition root. */
export class MappingsView {
  constructor(dependencies) {
    this.dependencies = dependencies;
    this.renderCampaignOptionsList = this.renderCampaignOptionsList.bind(this);
    this.renderMappingsPanel = this.renderMappingsPanel.bind(this);
    this.renderAccountOptions = this.renderAccountOptions.bind(this);
    this.renderCampaignOptions = this.renderCampaignOptions.bind(this);
    this.renderCloneSourceCampaignOptions =
      this.renderCloneSourceCampaignOptions.bind(this);
    this.renderSectionLoading = this.renderSectionLoading.bind(this);
    this.renderImportMappings = this.renderImportMappings.bind(this);
    this.renderCloneMappings = this.renderCloneMappings.bind(this);
    this.renderManualCloneCatalogSelector =
      this.renderManualCloneCatalogSelector.bind(this);
  }

  renderCampaignOptionsList(
    campaigns,
    selectedId,
    emptyText = "Select account first",
  ) {
    if (!campaigns.length) {
      return `<option value="">${escapeHtml(emptyText)}</option>`;
    }
    const options = [`<option value="">Select campaign</option>`];
    for (const campaign of campaigns) {
      options.push(
        `<option value="${escapeHtml(campaign.id)}" ${campaign.id === selectedId ? "selected" : ""}>${escapeHtml(campaign.name || campaign.id)}</option>`,
      );
    }
    return options.join("");
  }

  renderMappingsPanel({
    packageData,
    pages,
    pixels,
    catalogs,
    targetBusiness,
    pageMappings,
    pixelMappings,
    catalogMappings,
    mediaOverrides,
    mediaFiles,
    allowMediaOverrides,
    showPackageSection = true,
    showMediaSection = true,
    emptyMessage,
    pageAction,
    pixelAction,
    catalogAction,
    mediaAction,
    mediaSubtitle,
    mediaEmptyText,
  }) {
    const { getMediaSlotsFromPackage, getDefaultMediaFile } =
      this.dependencies.mediaSlots;
    const { renderPackageSummary } = this.dependencies.packageRenderer;
    if (!packageData) {
      return `<div class="sk-empty">${escapeHtml(emptyMessage)}</div>`;
    }

    const sourcePages = getSourcePagesFromPackage(packageData);
    const sourcePixels = getSourcePixelsFromPackage(packageData);
    const sourceCatalogs = getSourceCatalogsFromPackage(packageData);
    const mediaSlots = getMediaSlotsFromPackage(packageData);

    const pageRows = sourcePages
      .map((page) => {
        const selected = pageMappings[page.id] || page.id;
        const options = [`<option value="">Not selected</option>`]
          .concat(
            (pages || []).map(
              (item) =>
                `<option value="${escapeHtml(item.id)}" ${item.id === selected ? "selected" : ""}>${escapeHtml(item.name)} (${escapeHtml(item.id)})</option>`,
            ),
          )
          .join("");
        return `
        <label class="sk-field">
          <span>Source Fan Page: ${escapeHtml(page.name)} (${escapeHtml(page.id)})</span>
          <select data-action="${escapeHtml(pageAction)}" data-source-page-id="${escapeHtml(page.id)}">
            ${options}
          </select>
        </label>
      `;
      })
      .join("");

    const pixelRows = sourcePixels
      .map((pixel) => {
        const current =
          pixelMappings[pixel.id] ||
          ((pixels || []).some((item) => item.id === pixel.id)
            ? pixel.id
            : "__create__");
        const options = [`<option value="__create__">Create new pixel</option>`]
          .concat(
            (pixels || []).map(
              (item) =>
                `<option value="${escapeHtml(item.id)}" ${item.id === current ? "selected" : ""}>${escapeHtml(item.name || item.id)} (${escapeHtml(item.id)})</option>`,
            ),
          )
          .join("");
        return `
        <label class="sk-field">
          <span>Source Pixel: ${escapeHtml(pixel.id)}</span>
          <select data-action="${escapeHtml(pixelAction)}" data-source-pixel-id="${escapeHtml(pixel.id)}">
            ${options}
          </select>
        </label>
      `;
      })
      .join("");

    const catalogRows = sourceCatalogs
      .map((catalog) => {
        const current =
          catalogMappings[catalog.id] ||
          ((catalogs || []).some((item) => item.id === catalog.id)
            ? catalog.id
            : "");
        const options = [`<option value="">Not selected</option>`]
          .concat(
            targetBusiness?.id
              ? [
                  `<option value="__copy__" ${current === "__copy__" ? "selected" : ""}>Copy to target BM</option>`,
                ]
              : [],
          )
          .concat(
            (catalogs || []).map(
              (item) =>
                `<option value="${escapeHtml(item.id)}" ${item.id === current ? "selected" : ""}>${escapeHtml(item.name || item.id)} (${escapeHtml(item.id)})</option>`,
            ),
          )
          .concat(
            (catalogs || [])
              .filter((item) => String(item.id) !== String(catalog.id))
              .map(
                (item) =>
                  `<option value="__copy_into__:${escapeHtml(item.id)}" ${current === "__copy_into__:" + item.id ? "selected" : ""}>Copy data into ${escapeHtml(item.name || item.id)}</option>`,
              ),
          )
          .join("");
        return `
        <label class="sk-field">
          <span>Source Catalog: ${escapeHtml(catalog.name)} (${escapeHtml(catalog.id)})</span>
          <select data-action="${escapeHtml(catalogAction)}" data-source-catalog-id="${escapeHtml(catalog.id)}">
            ${options}
          </select>
        </label>
      `;
      })
      .join("");

    const anyCatalogCopyToBm = sourceCatalogs.some((catalog) => {
      const current =
        catalogMappings[catalog.id] ||
        ((catalogs || []).some((item) => item.id === catalog.id)
          ? catalog.id
          : "");
      return current === "__copy__";
    });
    const catalogWarning = sourceCatalogs.length
      ? targetBusiness?.id
        ? `<div class="sk-note">
            Catalog campaign. Target BM: ${escapeHtml(targetBusiness.name || targetBusiness.id)}.
            ${anyCatalogCopyToBm ? `A new catalog will be created in ${escapeHtml(targetBusiness.name || targetBusiness.id)}.` : ""}
          </div>`
        : (catalogs || []).length
          ? `<div class="sk-note sk-warning">
              Catalog campaign. No visible Business Manager on the target ad account;
              you can map into an existing target catalog, but "Copy to target BM" is unavailable.
            </div>`
          : `<div class="sk-note sk-warning">
              Catalog campaign, but the target ad account has no visible Business Manager
              and no eligible target catalogs. Catalog campaigns cannot be cloned/imported here.
            </div>`
      : "";

    const mediaRows = mediaSlots
      .map((slot) => {
        const file = getDefaultMediaFile(slot, mediaOverrides, mediaFiles);
        const typeBadge = slot.type === "video" ? "VIDEO" : "IMAGE";
        if (!allowMediaOverrides) {
          return `
          <div class="sk-creative-row">
            <div class="sk-creative-info">
              <div class="sk-creative-name">
                <span class="sk-badge sk-badge-${escapeHtml(slot.type)}">${typeBadge}</span>
                ${escapeHtml(slot.creativeName || slot.creativeId)}
              </div>
              <div class="sk-creative-file">${escapeHtml(file ? file.name : slot.expectedFileName)}</div>
            </div>
          </div>
        `;
        }
        return `
        <div class="sk-creative-row">
          <div class="sk-creative-info">
            <div class="sk-creative-name">
              <span class="sk-badge sk-badge-${escapeHtml(slot.type)}">${typeBadge}</span>
              ${escapeHtml(slot.expectedFileName)}
            </div>
            <div class="sk-creative-file">${escapeHtml(slot.creativeName || slot.creativeId)}</div>
            <div class="sk-creative-status">${escapeHtml(file ? `Selected: ${file.name}` : "Awaiting file selection")}</div>
          </div>
          <label class="sk-file-trigger">
            <span>Choose file</span>
            <input class="sk-file-input" type="file"
              data-action="${escapeHtml(mediaAction)}"
              data-media-key="${escapeHtml(slot.key)}"
              data-expected-file="${escapeHtml(slot.expectedFileName)}"
              accept="${slot.type === "video" ? "video/*" : "image/*"}" />
          </label>
        </div>
      `;
      })
      .join("");

    return `
      ${showPackageSection ? renderPackageSummary(packageData) : ""}
      <div class="sk-mapping-block">
        <div class="sk-subtitle">Fan Page</div>
        ${pageRows || `<div class="sk-empty">No page-based creatives.</div>`}
      </div>
      <div class="sk-mapping-block">
        <div class="sk-subtitle">Pixels</div>
        ${pixelRows || `<div class="sk-empty">No pixel-based adsets.</div>`}
      </div>
      ${
        sourceCatalogs.length
          ? `
      <div class="sk-mapping-block">
        <div class="sk-subtitle">Catalogs</div>
        ${catalogWarning}
        ${catalogRows || `<div class="sk-empty">No catalog references.</div>`}
      </div>`
          : ""
      }
      ${
        showMediaSection
          ? `
      <div class="sk-mapping-block">
        <div class="sk-subtitle">${escapeHtml(mediaSubtitle)}</div>
        ${mediaRows || `<div class="sk-empty">${escapeHtml(mediaEmptyText)}</div>`}
      </div>`
          : ""
      }
    `;
  }

  renderAccountOptions(selectedId) {
    const { state } = this.dependencies;
    if (!state.accounts.length) {
      return `<option value="">Load session first</option>`;
    }
    const options = [`<option value="">Select account</option>`];
    for (const account of state.accounts) {
      options.push(
        `<option value="${escapeHtml(account.id)}" ${account.id === selectedId ? "selected" : ""}>${escapeHtml(getAccountLabel(account))}</option>`,
      );
    }
    return options.join("");
  }

  renderCampaignOptions() {
    const { state } = this.dependencies;
    const { renderCampaignOptionsList } = this;
    return renderCampaignOptionsList(
      state.exportCampaigns,
      state.exportCampaignId,
    );
  }

  renderCloneSourceCampaignOptions() {
    const { state } = this.dependencies;
    const { renderCampaignOptionsList } = this;
    return renderCampaignOptionsList(
      state.cloneSourceCampaigns,
      state.cloneSourceCampaignId,
    );
  }

  renderSectionLoading(message) {
    return `
      <div class="sk-inline-loading">
        <div class="sk-inline-spinner"></div>
        <div>${escapeHtml(message)}</div>
      </div>
    `;
  }

  renderImportMappings() {
    const { state, dom } = this.dependencies;
    const { renderMappingsPanel } = this;
    if (!dom.importMappings) return;
    dom.importMappings.innerHTML = renderMappingsPanel({
      packageData: state.importPackage,
      pages: state.pages,
      pixels: state.importAccountPixels,
      catalogs: state.importTargetCatalogs,
      targetBusiness: state.importTargetBusiness,
      pageMappings: state.importPageMappings,
      pixelMappings: state.importPixelMappings,
      catalogMappings: state.importCatalogMappings,
      mediaOverrides: state.importMediaOverrides,
      mediaFiles: state.importMediaFiles,
      allowMediaOverrides: true,
      showPackageSection: true,
      showMediaSection: true,
      emptyMessage: "Load an export JSON file.",
      pageAction: "page-map",
      pixelAction: "pixel-map",
      catalogAction: "catalog-map",
      mediaAction: "media-override",
      mediaSubtitle: "Creatives — Media Files",
      mediaEmptyText: !state.importPackage?.ads?.length
        ? "No media files: the selected package contains no ads."
        : "No separate media files in this package. Catalog and existing-post creatives may use media stored in Meta.",
    });
  }

  renderCloneMappings() {
    const { state, dom } = this.dependencies;
    const { renderCloneCampaignSummary } = this.dependencies.packageRenderer;
    const {
      renderMappingsPanel,
      renderSectionLoading,
      renderManualCloneCatalogSelector,
    } = this;
    if (!dom.cloneMappings) return;
    if (state.clonePackageLoading) {
      dom.cloneMappings.innerHTML = renderSectionLoading(
        "Loading source campaign structure, pages, pixels, and mappings...",
      );
      if (dom.clonePackageSummary) {
        dom.clonePackageSummary.innerHTML = renderSectionLoading(
          "Loading source campaign package...",
        );
      }
      return;
    }
    dom.cloneMappings.innerHTML =
      renderMappingsPanel({
        packageData: state.clonePackage,
        pages: state.clonePages,
        pixels: state.cloneTargetPixels,
        catalogs: state.cloneTargetCatalogs,
        targetBusiness: state.cloneTargetBusiness,
        pageMappings: state.clonePageMappings,
        pixelMappings: state.clonePixelMappings,
        catalogMappings: state.cloneCatalogMappings,
        mediaOverrides: new Map(),
        mediaFiles: new Map(),
        allowMediaOverrides: false,
        showPackageSection: false,
        showMediaSection: false,
        emptyMessage: "Select source account, campaign, and target account.",
        pageAction: "clone-page-map",
        pixelAction: "clone-pixel-map",
        catalogAction: "clone-catalog-map",
        mediaAction: "clone-media-readonly",
        mediaSubtitle: "Creatives — Media Files",
        mediaEmptyText: "Media will be copied automatically from source.",
      }) + renderManualCloneCatalogSelector();
    if (dom.clonePackageSummary) {
      dom.clonePackageSummary.innerHTML = state.clonePackage
        ? renderCloneCampaignSummary(state.clonePackage)
        : "";
    }
  }

  renderManualCloneCatalogSelector() {
    const { state } = this.dependencies;
    if (
      !state.clonePackage ||
      getSourceCatalogsFromPackage(state.clonePackage).length
    ) {
      return "";
    }
    if (!state.cloneSourceCatalogs.length) {
      return "";
    }
    const sourceOptions = [`<option value="">No manual source catalog</option>`]
      .concat(
        state.cloneSourceCatalogs.map(
          (item) =>
            `<option value="${escapeHtml(item.id)}" ${item.id === state.cloneManualSourceCatalogId ? "selected" : ""}>${escapeHtml(item.name || item.id)} (${escapeHtml(item.id)})</option>`,
        ),
      )
      .join("");
    const mapped = state.cloneManualSourceCatalogId
      ? state.cloneCatalogMappings[state.cloneManualSourceCatalogId] ||
        "__copy__"
      : "";
    const targetOptions = [`<option value="">Not selected</option>`]
      .concat(
        state.cloneTargetBusiness?.id
          ? [
              `<option value="__copy__" ${mapped === "__copy__" ? "selected" : ""}>Copy to target BM</option>`,
            ]
          : [],
      )
      .concat(
        state.cloneTargetCatalogs.map(
          (item) =>
            `<option value="${escapeHtml(item.id)}" ${item.id === mapped ? "selected" : ""}>${escapeHtml(item.name || item.id)} (${escapeHtml(item.id)})</option>`,
        ),
      )
      .join("");
    return `
      <div class="sk-mapping-block">
        <div class="sk-subtitle">Catalogs</div>
        <div class="sk-note sk-warning">
          No catalog IDs were exposed by Graph export. Select the source catalog manually if this is a catalog ad.
        </div>
        <label class="sk-field">
          <span>Manual Source Catalog</span>
          <select data-action="clone-manual-source-catalog">
            ${sourceOptions}
          </select>
        </label>
        ${
          state.cloneManualSourceCatalogId
            ? `
        <label class="sk-field">
          <span>Target Catalog</span>
          <select data-action="clone-catalog-map" data-source-catalog-id="${escapeHtml(state.cloneManualSourceCatalogId)}">
            ${targetOptions}
          </select>
        </label>`
            : ""
        }
      </div>
    `;
  }
}
