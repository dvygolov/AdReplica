import {
  getPackageProductSetById,
  getSourceCatalogsFromPackage,
  getSourceProductSetsFromPackage,
  resolveSourceProductSetCatalogId,
} from "../domain/package.mjs";
import { pickFallbackTargetProductSet } from "../domain/catalog.mjs";

/** CatalogMappingService. Dependencies are supplied by the application composition root. */
export class CatalogMappingService {
  constructor(dependencies) {
    this.dependencies = dependencies;
    this.validateCatalogMappingsForImport =
      this.validateCatalogMappingsForImport.bind(this);
    this.fetchTargetCatalogProductSets =
      this.fetchTargetCatalogProductSets.bind(this);
    this.enrichFallbackProductSetMappings =
      this.enrichFallbackProductSetMappings.bind(this);
    this.prepareCatalogMappingsForImport =
      this.prepareCatalogMappingsForImport.bind(this);
    this.planCatalogMappingsForImport =
      this.planCatalogMappingsForImport.bind(this);
  }

  validateCatalogMappingsForImport(
    packageData,
    targetContext,
    catalogMappings,
    productSetMappings = {},
    copiedCatalogIds = new Set(),
  ) {
    const { state } = this.dependencies;
    const sourceCatalogs = getSourceCatalogsFromPackage(packageData);
    if (!sourceCatalogs.length) {
      return;
    }
    const targetCatalogIds = new Set(
      (targetContext?.catalogs || []).map((item) => String(item.id)),
    );
    const productSets = getSourceProductSetsFromPackage(packageData);
    for (const catalog of sourceCatalogs) {
      const sourceId = String(catalog.id);
      const selectedId = String(catalogMappings?.[sourceId] || "");
      if (!selectedId) {
        throw new Error(
          `Catalog campaign requires catalog mapping for source catalog ${sourceId}. Select a target catalog first.`,
        );
      }
      if (selectedId === "__copy__" && !targetContext?.business?.id) {
        throw new Error(
          `Catalog ${sourceId} cannot be copied into target BM for act_${state.importAccountId}: the target account has no visible Business Manager. ` +
            "Select an existing eligible target catalog instead.",
        );
      }
      if (
        !targetCatalogIds.has(selectedId) &&
        !copiedCatalogIds.has(selectedId)
      ) {
        throw new Error(
          `Target account act_${state.importAccountId} does not have visible access to catalog ${selectedId}.`,
        );
      }
      if (
        selectedId !== sourceId &&
        productSets.length &&
        productSets.some(
          (item) =>
            resolveSourceProductSetCatalogId(packageData, item.id) ===
              sourceId && !productSetMappings[String(item.id)],
        )
      ) {
        const productSetSuffix = productSets.length
          ? ` Product sets are present (${productSets.map((item) => item.id).join(", ")}), so catalog ID replacement would leave invalid product_set_id references.`
          : "";
        throw new Error(
          `Cross-catalog clone is blocked in this build: ${sourceId} -> ${selectedId}.${productSetSuffix} Use a target account with access to the same catalog, or copy the catalog/product sets first.`,
        );
      }
    }
  }

  async fetchTargetCatalogProductSets(catalogId) {
    const { log } = this.dependencies.logging;
    const { graphGetAll } = this.dependencies.graphClient;
    if (!catalogId) {
      return [];
    }
    return graphGetAll(`${catalogId}/product_sets`, {
      fields: [
        "id",
        "name",
        "filter",
        "capability",
        "cpas_category_product_set_id",
        "original_creation_source",
        "is_autogen_product_set",
        "product_catalog{id,name,vertical,catalog_item_type}",
      ].join(","),
      limit: 200,
    })
      .then((items) => items.map((item) => ({ ...item, id: String(item.id) })))
      .catch((error) => {
        log(
          "warn",
          `Target catalog product set lookup failed for catalog ${catalogId}.`,
          String(error),
        );
        return [];
      });
  }

  async enrichFallbackProductSetMappings(
    packageData,
    catalogMappings,
    productSetMappings,
  ) {
    const { log } = this.dependencies.logging;
    const { fetchTargetCatalogProductSets } = this;
    const nextProductSetMappings = { ...(productSetMappings || {}) };
    const sourceProductSets = getSourceProductSetsFromPackage(packageData);
    const targetProductSetsByCatalog = new Map();
    for (const sourceProductSet of sourceProductSets) {
      const sourceProductSetId = String(sourceProductSet.id || "");
      if (!sourceProductSetId || nextProductSetMappings[sourceProductSetId]) {
        continue;
      }
      const sourceCatalogId = resolveSourceProductSetCatalogId(
        packageData,
        sourceProductSetId,
      );
      if (!sourceCatalogId) {
        continue;
      }
      const targetCatalogId = String(
        catalogMappings?.[sourceCatalogId] || sourceCatalogId || "",
      );
      if (!targetCatalogId) {
        continue;
      }
      if (targetCatalogId === sourceCatalogId) {
        continue;
      }
      if (!targetProductSetsByCatalog.has(targetCatalogId)) {
        targetProductSetsByCatalog.set(
          targetCatalogId,
          await fetchTargetCatalogProductSets(targetCatalogId),
        );
      }
      const targetProductSets =
        targetProductSetsByCatalog.get(targetCatalogId) || [];
      if (!targetProductSets.length) {
        continue;
      }
      const sourceProductSetMeta =
        getPackageProductSetById(packageData, sourceProductSetId) ||
        sourceProductSet;
      const targetProductSet = pickFallbackTargetProductSet(
        sourceProductSetMeta,
        targetProductSets,
      );
      if (!targetProductSet?.id) {
        continue;
      }
      nextProductSetMappings[sourceProductSetId] = String(targetProductSet.id);
      log(
        "info",
        `Matched equivalent product set ${sourceProductSetId} -> ${targetProductSet.id} (${targetProductSet.name || targetProductSet.id}).`,
      );
    }
    return nextProductSetMappings;
  }

  async planCatalogMappingsForImport(
    packageData,
    targetContext,
    catalogMappings,
  ) {
    const targets = new Map(
      (targetContext?.catalogs || []).map((item) => [String(item.id), item]),
    );
    const plan = [];
    for (const catalog of getSourceCatalogsFromPackage(packageData)) {
      const sourceId = String(catalog.id);
      const selected = String(catalogMappings?.[sourceId] || "");
      const mode =
        selected === "__copy__"
          ? "copy-new"
          : selected.startsWith("__copy_into__:")
            ? "copy-existing"
            : "reuse";
      const targetId =
        mode === "copy-existing"
          ? selected.slice("__copy_into__:".length)
          : selected;
      if (mode === "copy-new") {
        if (!targetContext?.business?.id)
          throw new Error(
            `No target Business Manager for catalog ${sourceId}.`,
          );
      } else if (!targets.has(targetId)) {
        throw new Error(`Select an accessible target catalog for ${sourceId}.`);
      }
      plan.push({
        sourceId,
        sourceName: catalog.name || sourceId,
        mode,
        targetId,
        targetName:
          targets.get(targetId)?.name ||
          targetContext?.business?.name ||
          targetId,
      });
    }
    // Validate every read-only mapping before any copy starts.
    const reuse = Object.fromEntries(
      plan
        .filter((item) => item.mode === "reuse")
        .map((item) => [item.sourceId, item.targetId]),
    );
    const sets = await this.enrichFallbackProductSetMappings(
      packageData,
      reuse,
      {},
    );
    for (const item of plan.filter(
      (item) => item.mode === "reuse" && item.sourceId !== item.targetId,
    )) {
      for (const set of getSourceProductSetsFromPackage(packageData)) {
        if (
          resolveSourceProductSetCatalogId(packageData, set.id) ===
            item.sourceId &&
          !sets[String(set.id)]
        ) {
          throw new Error(
            `No equivalent product set for ${set.name || set.id} in ${item.targetName}. Choose explicit catalog copying.`,
          );
        }
      }
    }
    return plan;
  }

  async prepareCatalogMappingsForImport(
    packageData,
    targetContext,
    catalogMappings,
  ) {
    const { state } = this.dependencies;
    const { invalidateAccountContextCache } =
      this.dependencies.accountContextService;
    const {
      validateCatalogMappingsForImport,
      enrichFallbackProductSetMappings,
    } = this;
    const { copyCatalogToTargetBusiness, copyCatalogIntoExistingTarget } =
      this.dependencies.catalogCopyService;
    await this.planCatalogMappingsForImport(
      packageData,
      targetContext,
      catalogMappings,
    );
    const sourceCatalogs = getSourceCatalogsFromPackage(packageData);
    const nextCatalogMappings = { ...(catalogMappings || {}) };
    let productSetMappings = {};
    const copiedCatalogIds = new Set();
    for (const catalog of sourceCatalogs) {
      const sourceId = String(catalog.id);
      if (nextCatalogMappings[sourceId] === "__copy__") {
        const copied = await copyCatalogToTargetBusiness(
          sourceId,
          targetContext,
          packageData,
        );
        nextCatalogMappings[sourceId] = copied.targetCatalogId;
        copiedCatalogIds.add(String(copied.targetCatalogId));
        Object.assign(productSetMappings, copied.productSetIdMap);
        invalidateAccountContextCache(state.importAccountId);
        continue;
      }
      if (String(nextCatalogMappings[sourceId]).startsWith("__copy_into__:")) {
        nextCatalogMappings[sourceId] = nextCatalogMappings[sourceId].slice(
          "__copy_into__:".length,
        );
        const copied = await copyCatalogIntoExistingTarget(
          sourceId,
          nextCatalogMappings[sourceId],
          packageData,
        );
        Object.assign(productSetMappings, copied.productSetIdMap);
      }
    }
    productSetMappings = await enrichFallbackProductSetMappings(
      packageData,
      nextCatalogMappings,
      productSetMappings,
    );
    validateCatalogMappingsForImport(
      packageData,
      targetContext,
      nextCatalogMappings,
      productSetMappings,
      copiedCatalogIds,
    );
    return { catalogMappings: nextCatalogMappings, productSetMappings };
  }
}
