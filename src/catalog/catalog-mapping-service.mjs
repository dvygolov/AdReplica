import {
  getReferencedProductSetIds,
  getPackageProductSetById,
  getSourceCatalogsFromPackage,
  getSourceProductSetsFromPackage,
  resolveSourceProductSetCatalogId,
} from "../domain/package.mjs";
import {
  isAutogenProductSet,
  pickFallbackTargetProductSet,
} from "../domain/catalog.mjs";

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
    const referencedSets = getReferencedProductSetIds(packageData);
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
            !isAutogenProductSet(item) &&
            referencedSets.has(String(item.id)) &&
            resolveSourceProductSetCatalogId(packageData, item.id) ===
              sourceId &&
            !productSetMappings[String(item.id)],
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
      if (isAutogenProductSet(sourceProductSet)) {
        // Meta rebuilds "All Products" in every catalog, so drop the reference
        // and let the ad target the whole target catalog.
        nextProductSetMappings[sourceProductSetId] = "";
        log(
          "info",
          `Product set ${sourceProductSetId} (${sourceProductSet.name || "All Products"}) is auto-generated: dropping it so the ad uses the whole target catalog.`,
        );
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

  /**
   * Resolves what "Auto" means for one source catalog. The order mirrors what
   * an operator does by hand: use the same catalog when the cabinet can see it,
   * otherwise create a copy in the cabinet's Business Manager, otherwise push
   * the source data into a catalog the cabinet already has.
   */
  resolveAutoCatalogPlan(sourceId, targets, targetContext) {
    if (targets.has(sourceId)) {
      return { mode: "reuse", targetId: sourceId, autoStep: "same-catalog" };
    }
    if (targetContext?.business?.id) {
      return {
        mode: "copy-new",
        targetId: "__copy__",
        autoStep: "new-catalog",
      };
    }
    const firstTarget = [...targets.values()][0];
    if (firstTarget?.id) {
      return {
        mode: "copy-existing",
        targetId: String(firstTarget.id),
        autoStep: "copy-into-existing",
      };
    }
    throw new Error(
      `Catalog ${sourceId} is not available in this cabinet, there is no Business Manager to create a copy, ` +
        "and the cabinet has no catalog to copy the products into.",
    );
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
      const isAuto = !selected || selected === "__auto__";
      let mode;
      let targetId;
      let autoStep = "";
      if (isAuto) {
        const resolved = this.resolveAutoCatalogPlan(
          sourceId,
          targets,
          targetContext,
        );
        mode = resolved.mode;
        targetId = resolved.targetId;
        autoStep = resolved.autoStep;
      } else {
        mode =
          selected === "__copy__"
            ? "copy-new"
            : selected.startsWith("__copy_into__:")
              ? "copy-existing"
              : "reuse";
        targetId =
          mode === "copy-existing"
            ? selected.slice("__copy_into__:".length)
            : selected;
        if (mode === "copy-new") {
          if (!targetContext?.business?.id)
            throw new Error(
              `No target Business Manager for catalog ${sourceId}.`,
            );
        } else if (!targets.has(targetId)) {
          throw new Error(
            `Select an accessible target catalog for ${sourceId}.`,
          );
        }
      }
      plan.push({
        sourceId,
        sourceName: catalog.name || sourceId,
        mode,
        targetId,
        autoStep,
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
      const referencedSets = getReferencedProductSetIds(packageData);
      for (const set of getSourceProductSetsFromPackage(packageData)) {
        if (isAutogenProductSet(set)) continue;
        if (!referencedSets.has(String(set.id))) continue;
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
    const plan = await this.planCatalogMappingsForImport(
      packageData,
      targetContext,
      catalogMappings,
    );
    const { log } = this.dependencies.logging;
    const nextCatalogMappings = { ...(catalogMappings || {}) };
    let productSetMappings = {};
    const copiedCatalogIds = new Set();
    for (const item of plan) {
      const sourceId = item.sourceId;
      if (item.autoStep) {
        log(
          "info",
          `Catalog ${sourceId}: auto mode chose ${item.autoStep} (${
            item.targetName || item.targetId
          }).`,
        );
      }
      if (item.mode === "copy-new") {
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
      if (item.mode === "copy-existing") {
        nextCatalogMappings[sourceId] = item.targetId;
        const copied = await copyCatalogIntoExistingTarget(
          sourceId,
          item.targetId,
          packageData,
        );
        Object.assign(productSetMappings, copied.productSetIdMap);
        continue;
      }
      nextCatalogMappings[sourceId] = item.targetId;
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
