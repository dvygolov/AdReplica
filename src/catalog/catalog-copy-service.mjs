import { getCatalogExportSnapshotFromPackage } from "../domain/catalog.mjs";
import { deepClone } from "../utils/object.mjs";
import { UncertainWriteError } from "../facebook/request-errors.mjs";
import { buildDefaultCloneCatalogName } from "../domain/names.mjs";
import {
  isCatalogCreateAdminPermissionError,
  isPermissionDeniedGraphError,
} from "../utils/graph-errors.mjs";

/** CatalogCopyService. Dependencies are supplied by the application composition root. */
export class CatalogCopyService {
  constructor(dependencies) {
    this.dependencies = dependencies;
    this.fetchCatalogCopySnapshot = this.fetchCatalogCopySnapshot.bind(this);
    this.createProductCatalogInBusiness =
      this.createProductCatalogInBusiness.bind(this);
    this.ensureTargetCatalogForCopy =
      this.ensureTargetCatalogForCopy.bind(this);
    this.copyCatalogToTargetBusiness =
      this.copyCatalogToTargetBusiness.bind(this);
    this.copyCatalogIntoExistingTarget =
      this.copyCatalogIntoExistingTarget.bind(this);
  }

  async fetchCatalogCopySnapshot(catalogId, packageData = null) {
    const { fetchCatalogExportSnapshot } = this.dependencies.catalogExporter;
    const packageSnapshot = getCatalogExportSnapshotFromPackage(
      packageData,
      catalogId,
    );
    if (packageSnapshot) {
      return {
        catalog: {
          ...(packageSnapshot.catalog || {}),
          id: String(packageSnapshot.catalog?.id || catalogId),
          name: packageSnapshot.catalog?.name || catalogId,
          vertical: packageSnapshot.catalog?.vertical || "commerce",
          productCount:
            packageSnapshot.catalog?.productCount ??
            packageSnapshot.products?.length ??
            0,
        },
        productFeeds: (packageSnapshot.productFeeds || []).map((item) =>
          deepClone(item),
        ),
        products: (packageSnapshot.products || []).map((item) => ({
          ...deepClone(item),
          id: String(item.id),
        })),
        productSets: (packageSnapshot.productSets || []).map((item) => ({
          ...deepClone(item),
          id: String(item.id),
        })),
        exportMode:
          packageSnapshot.exportMode ||
          ((packageSnapshot.productFeeds || []).length
            ? "feed"
            : "manual_products"),
      };
    }
    return fetchCatalogExportSnapshot({ id: catalogId });
  }

  async createProductCatalogInBusiness(businessId, sourceCatalog) {
    const { state } = this.dependencies;
    const { log } = this.dependencies.logging;
    const { getCurrentActorId } = this.dependencies.sessionService;
    const { graphPageFetch } = this.dependencies.graphClient;
    const { businessGraphqlRequest } = this.dependencies.privateGraphqlClient;
    const name = buildDefaultCloneCatalogName(sourceCatalog);
    const actorId = String(getCurrentActorId() || "");
    if (actorId && state.privateTokens?.fbDtsg && state.privateTokens?.lsd) {
      try {
        const response = await businessGraphqlRequest(
          "24241305678896902",
          "useCreateCatalogMutation",
          {
            input: {
              actor_id: actorId,
              client_mutation_id: String(Date.now()),
              automated_permission_status: "ENABLED",
              business_id: String(businessId),
              catalog_name: name,
              nav_source: "BUSINESS_MANAGER",
              vertical: sourceCatalog.vertical || "commerce",
            },
          },
        );
        const catalogId =
          response?.data?.xfb_create_catalog_commerce_manager?.catalog?.id;
        if (!catalogId) {
          throw new UncertainWriteError(
            "create_catalog",
            new Error(
              "Commerce Manager create catalog mutation did not return catalog.id.",
            ),
          );
        }
        log("info", "Catalog shell created via Commerce Manager mutation.");
        state.operationReport?.record("catalog", catalogId, name, {
          businessId,
        });
        return String(catalogId);
      } catch (error) {
        if (error?.uncertain) throw error;
        if (isCatalogCreateAdminPermissionError(error)) {
          throw new Error(
            `Cannot create a copied catalog in target business ${businessId}: Meta says this user is not a Business Manager admin. ` +
              "Use a target account that already has visible access to the source catalog, or ask a BM admin to share/create the catalog first.",
          );
        }
        log(
          "warn",
          "Commerce Manager catalog create mutation failed; trying public Graph fallback.",
          String(error?.message || error),
        );
      }
    }
    try {
      const created = await graphPageFetch(
        `${businessId}/owned_product_catalogs`,
        {
          method: "POST",
          body: {
            name,
            vertical: sourceCatalog.vertical || "commerce",
          },
        },
      );
      return String(created.id);
    } catch (firstError) {
      if (firstError?.uncertain) throw firstError;
      if (
        isCatalogCreateAdminPermissionError(firstError) ||
        isPermissionDeniedGraphError(firstError)
      ) {
        throw new Error(
          `Cannot create a copied catalog in target business ${businessId}: target user lacks Business Manager rights to create catalogs. ` +
            "Select an already visible target catalog instead, or ask a BM admin to grant catalog access / create the catalog.",
        );
      }
      const created = await graphPageFetch(`${businessId}/product_catalogs`, {
        method: "POST",
        body: {
          name,
          vertical: sourceCatalog.vertical || "commerce",
        },
      });
      log(
        "warn",
        "Catalog create used product_catalogs fallback after owned_product_catalogs failed.",
        String(firstError),
      );
      return String(created.id);
    }
  }

  async ensureTargetCatalogForCopy(sourceCatalog, targetContext) {
    const { log } = this.dependencies.logging;
    const { createProductCatalogInBusiness } = this;
    const catalogId = await createProductCatalogInBusiness(
      targetContext.business.id,
      sourceCatalog,
    );
    log("info", `Copied catalog shell created: ${catalogId}.`);
    return catalogId;
  }

  async copyCatalogToTargetBusiness(
    sourceCatalogId,
    targetContext,
    packageData = null,
  ) {
    const { log } = this.dependencies.logging;
    const { fetchCatalogCopySnapshot, ensureTargetCatalogForCopy } = this;
    const { copyCatalogProductFeeds } = this.dependencies.catalogFeedService;
    const { copyCatalogProducts, buildCatalogProductIdMapByRetailer } =
      this.dependencies.catalogProductService;
    const { copyCatalogProductSets } = this.dependencies.catalogSetService;
    if (!targetContext?.business?.id) {
      throw new Error(
        "Cannot copy catalog: target account has no visible Business Manager.",
      );
    }
    const snapshot = await fetchCatalogCopySnapshot(
      sourceCatalogId,
      packageData,
    );
    log(
      "info",
      `Copying catalog ${snapshot.catalog.name} (${snapshot.productFeeds?.length || 0} feeds, ${snapshot.products.length} products, ${snapshot.productSets.length} sets).`,
    );
    const targetCatalogId = await ensureTargetCatalogForCopy(
      snapshot.catalog,
      targetContext,
    );
    const feedIdMap = await copyCatalogProductFeeds(
      snapshot.productFeeds || [],
      targetCatalogId,
    );
    const productIdMap = snapshot.products.length
      ? await copyCatalogProducts(snapshot.products, targetCatalogId)
      : await buildCatalogProductIdMapByRetailer(
          snapshot.catalog.id,
          targetCatalogId,
          snapshot.catalog.productCount,
        );
    const productSetIdMap = await copyCatalogProductSets(
      snapshot.productSets,
      targetCatalogId,
      productIdMap,
    );
    return {
      sourceCatalogId: String(sourceCatalogId),
      targetCatalogId,
      feedIdMap,
      productIdMap,
      productSetIdMap,
    };
  }

  async copyCatalogIntoExistingTarget(
    sourceCatalogId,
    targetCatalogId,
    packageData = null,
  ) {
    const { log } = this.dependencies.logging;
    const { fetchCatalogCopySnapshot } = this;
    const { copyCatalogProductFeeds } = this.dependencies.catalogFeedService;
    const { copyCatalogProducts, buildCatalogProductIdMapByRetailer } =
      this.dependencies.catalogProductService;
    const { copyCatalogProductSets } = this.dependencies.catalogSetService;
    const snapshot = await fetchCatalogCopySnapshot(
      sourceCatalogId,
      packageData,
    );
    log(
      "info",
      `Copying catalog ${snapshot.catalog.name} into existing target catalog ${targetCatalogId}.`,
    );
    const feedIdMap = await copyCatalogProductFeeds(
      snapshot.productFeeds || [],
      targetCatalogId,
    );
    const productIdMap = snapshot.products.length
      ? await copyCatalogProducts(snapshot.products, targetCatalogId)
      : await buildCatalogProductIdMapByRetailer(
          snapshot.catalog.id,
          targetCatalogId,
          snapshot.catalog.productCount,
        );
    const productSetIdMap = await copyCatalogProductSets(
      snapshot.productSets,
      targetCatalogId,
      productIdMap,
    );
    return {
      sourceCatalogId: String(sourceCatalogId),
      targetCatalogId: String(targetCatalogId),
      feedIdMap,
      productIdMap,
      productSetIdMap,
    };
  }
}
