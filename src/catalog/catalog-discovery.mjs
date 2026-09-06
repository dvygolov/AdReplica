import { getCatalogRefsFromPackage } from "../domain/package.mjs";
import { getSourcePageId } from "../domain/creative.mjs";
import {
  isLikelyCatalogCreative,
  normalizeDpaCatalogHint,
} from "../domain/catalog.mjs";

/** CatalogDiscovery. Dependencies are supplied by the application composition root. */
export class CatalogDiscovery {
  constructor(dependencies) {
    this.dependencies = dependencies;
    this.filterDpaCatalogHintsToPackageReferences =
      this.filterDpaCatalogHintsToPackageReferences.bind(this);
    this.fetchDpaCatalogHintsForAds =
      this.fetchDpaCatalogHintsForAds.bind(this);
  }

  filterDpaCatalogHintsToPackageReferences(packageData, dpaCatalogHints) {
    const { log } = this.dependencies.logging;
    const directRefs = getCatalogRefsFromPackage(packageData);
    const referencedCatalogIds = new Set(
      [...directRefs.catalogs.keys()].map(String),
    );
    const referencedProductSetIds = new Set(
      [...directRefs.productSets.keys()].map(String),
    );
    const filteredProductSets = [];

    for (const productSet of dpaCatalogHints?.productSets || []) {
      const productSetId = String(productSet?.id || "");
      const catalogId = String(
        productSet?.product_catalog?.id || productSet?.catalog_id || "",
      );
      if (
        (productSetId && referencedProductSetIds.has(productSetId)) ||
        (catalogId && referencedCatalogIds.has(catalogId))
      ) {
        filteredProductSets.push(productSet);
        if (catalogId) {
          referencedCatalogIds.add(catalogId);
        }
      }
    }

    const filteredCatalogs = (dpaCatalogHints?.catalogs || []).filter(
      (catalog) => referencedCatalogIds.has(String(catalog?.id || "")),
    );

    const skippedCatalogs = (dpaCatalogHints?.catalogs || []).filter(
      (catalog) => !referencedCatalogIds.has(String(catalog?.id || "")),
    );
    if (skippedCatalogs.length) {
      log(
        "warn",
        `Ignored ${skippedCatalogs.length} unreferenced DPA eligible catalog hint(s): ${skippedCatalogs.map((item) => `${item.name || item.id} (${item.id})`).join(", ")}.`,
      );
    }

    return {
      catalogs: filteredCatalogs,
      productSets: filteredProductSets,
    };
  }

  async fetchDpaCatalogHintsForAds(accountId, ads, creatives) {
    const { log } = this.dependencies.logging;
    const { graphFetch } = this.dependencies.graphClient;
    const creativeById = new Map(
      (creatives || []).map((creative) => [String(creative.id), creative]),
    );
    const catalogMap = new Map();
    const productSetMap = new Map();
    const adCandidateProductSetIds = new Map();
    const fields = [
      "product_sets.limit(10).filtering([",
      '{"field":"product_count","operator":"GREATER_THAN","value":0}',
      "]){id,name,filter,capability,cpas_category_product_set_id,is_autogen_product_set,",
      "is_eligible_for_value_optimization,is_eligible_for_value_optimization_new,",
      "da_approved_items_count,original_creation_source,checkout_eligible_item_count,",
      "collection{url},product_catalog{id,name,vertical,has_localized_overrides,catalog_item_type}}",
    ].join("");
    const filtering = [
      {
        field: "product_set_count",
        operator: "GREATER_THAN_OR_EQUAL",
        value: 1,
      },
      { field: "exclude_child_catalogs", operator: "EQUAL", value: true },
      {
        field: "vertical",
        operator: "IN",
        value: [
          "commerce",
          "automotive_models",
          "destinations",
          "flights",
          "home_listings",
          "hotels",
          "vehicle_offers",
          "vehicles",
        ],
      },
      {
        field: "include_business_catalogs_only",
        operator: "EQUAL",
        value: true,
      },
      {
        field: "prioritize_non_empty_catalogs",
        operator: "EQUAL",
        value: true,
      },
    ];

    for (const ad of ads || []) {
      const creative = creativeById.get(String(ad?.creative?.id || ""));
      if (!creative || !isLikelyCatalogCreative(creative)) {
        continue;
      }
      const pageId = getSourcePageId(creative);
      try {
        const result = await graphFetch(
          `act_${accountId}/dpa_eligible_product_catalogs`,
          {
            query: {
              adgroup_id: String(ad.id),
              page_id: pageId || undefined,
              fields,
              filtering,
              limit: 5,
              sort_by: "default",
              request_source: "PRODUCT_EXTENSIONS_ELIGIBILITY_CHECK",
            },
          },
        );
        for (const item of result.data || []) {
          const hint = normalizeDpaCatalogHint(
            item,
            ad.name || creative.name || "",
          );
          if (!hint) continue;
          if (!catalogMap.has(hint.catalog.id)) {
            catalogMap.set(hint.catalog.id, {
              ...hint.catalog,
              detectedFromAds: [String(ad.id)],
            });
          } else {
            const existing = catalogMap.get(hint.catalog.id);
            if (!existing.detectedFromAds.includes(String(ad.id))) {
              existing.detectedFromAds.push(String(ad.id));
            }
          }
          for (const productSet of hint.productSets || []) {
            if (!adCandidateProductSetIds.has(String(ad.id))) {
              adCandidateProductSetIds.set(String(ad.id), new Set());
            }
            adCandidateProductSetIds
              .get(String(ad.id))
              .add(String(productSet.id));
            if (!productSetMap.has(productSet.id)) {
              productSetMap.set(productSet.id, {
                ...productSet,
                detectedFromAds: [String(ad.id)],
              });
            } else {
              const existingSet = productSetMap.get(productSet.id);
              if (!existingSet.detectedFromAds.includes(String(ad.id))) {
                existingSet.detectedFromAds.push(String(ad.id));
              }
            }
          }
        }
      } catch (error) {
        log(
          "warn",
          `Catalog discovery skipped for ad ${ad.name || ad.id}.`,
          String(error),
        );
      }
    }

    for (const [adId, candidateIds] of adCandidateProductSetIds.entries()) {
      const ad = ads.find((item) => String(item.id) === String(adId));
      const creative = creatives.find(
        (item) => String(item.id) === String(ad?.creative?.id || ""),
      );
      if (!creative?.raw || creative.raw.product_set_id) {
        continue;
      }
      const candidates = [...candidateIds]
        .map((id) => productSetMap.get(String(id)))
        .filter(Boolean);
      if (!candidates.length) {
        continue;
      }
      const nonAutogenCandidates = candidates.filter(
        (item) => !item.is_autogen_product_set,
      );
      if (nonAutogenCandidates.length === 1) {
        creative.raw.product_set_id = String(nonAutogenCandidates[0].id);
        continue;
      }
      if (candidates.length === 1) {
        creative.raw.product_set_id = String(candidates[0].id);
        continue;
      }
      log(
        "warn",
        `Catalog creative ${creative.name || creative.id} exported with ambiguous DPA product set hints (${candidates.map((item) => item.name || item.id).join(", ")}).`,
      );
    }

    return {
      catalogs: [...catalogMap.values()],
      productSets: [...productSetMap.values()],
    };
  }
}
