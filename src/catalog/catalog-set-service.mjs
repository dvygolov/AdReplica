import {
  remapProductSetFilter,
  canonicalProductSetFilter,
} from "../domain/catalog.mjs";

/** CatalogSetService. Dependencies are supplied by the application composition root. */
export class CatalogSetService {
  constructor(dependencies) {
    this.dependencies = dependencies;
    this.copyCatalogProductSets = this.copyCatalogProductSets.bind(this);
  }

  async copyCatalogProductSets(
    sourceProductSets,
    targetCatalogId,
    productIdMap,
  ) {
    const { log } = this.dependencies.logging;
    const { graphFetch, graphGetAll } = this.dependencies.graphClient;
    const existingSets = await graphGetAll(`${targetCatalogId}/product_sets`, {
      fields: "id,name,filter,original_creation_source",
      limit: 200,
    });
    const targetByName = new Map(
      existingSets.map((item) => [String(item.name || ""), item]),
    );
    const productSetIdMap = {};
    for (const set of sourceProductSets) {
      const setName = String(set.name || "");
      const filter = remapProductSetFilter(set.filter, productIdMap);
      // Meta creates an unfiltered set with every catalog. Missing filter alone
      // is not proof of equivalence: require the catalog-created origin too.
      const isCatalogDefault = (item) =>
        item.original_creation_source === "catalog_creation" &&
        (item.filter == null || item.filter === "");
      const existing = existingSets.find(
        (item) =>
          (isCatalogDefault(set) && isCatalogDefault(item)) ||
          (item.name === setName &&
            canonicalProductSetFilter(filter) !== null &&
            canonicalProductSetFilter(item.filter) ===
              canonicalProductSetFilter(filter)),
      );
      if (existing) {
        productSetIdMap[String(set.id)] = String(existing.id);
        continue;
      }
      let name = set.name || `Product set ${set.id}`;
      if (targetByName.has(name)) name += ` (AdReplica ${set.id})`;
      const baseName = name;
      for (let suffix = 2; targetByName.has(name); suffix++)
        name = `${baseName} ${suffix}`;
      const body = { name };
      if (filter) {
        body.filter = filter;
      }
      const created = await graphFetch(`${targetCatalogId}/product_sets`, {
        method: "POST",
        body,
      });
      const targetSetId = String(created.id || "");
      this.dependencies.state?.operationReport?.record(
        "product_set",
        targetSetId,
        body.name,
        { catalogId: targetCatalogId },
      );
      targetByName.set(body.name, { id: targetSetId, ...body });
      existingSets.push({ id: targetSetId, ...body });
      productSetIdMap[String(set.id)] = targetSetId;
      log("info", `Catalog product set copied: ${body.name}`);
    }
    return productSetIdMap;
  }
}
