import { isPermissionDeniedGraphError } from "../utils/graph-errors.mjs";
import { deepClone } from "../utils/object.mjs";

/** CatalogExporter. Dependencies are supplied by the application composition root. */
export class CatalogExporter {
  constructor(dependencies) {
    this.dependencies = dependencies;
    this.fetchCatalogExportSnapshot =
      this.fetchCatalogExportSnapshot.bind(this);
    this.fetchCatalogExportsForPackage =
      this.fetchCatalogExportsForPackage.bind(this);
    this.fetchCatalogProductFeeds = this.fetchCatalogProductFeeds.bind(this);
    this.fetchCatalogProductFeedsFromCommerce =
      this.fetchCatalogProductFeedsFromCommerce.bind(this);
    this.normalizeCatalogFeedExport =
      this.normalizeCatalogFeedExport.bind(this);
    this.fetchCatalogManualProducts =
      this.fetchCatalogManualProducts.bind(this);
  }

  async fetchCatalogExportSnapshot(catalogHint) {
    const { log } = this.dependencies.logging;
    const { graphFetch, graphGetAll } = this.dependencies.graphClient;
    const { fetchCatalogProductFeeds, fetchCatalogManualProducts } = this;
    const catalogId = String(catalogHint?.id || "");
    if (!catalogId) {
      return null;
    }
    const catalog = await graphFetch(catalogId, {
      query: {
        fields: [
          "id",
          "name",
          "vertical",
          "catalog_item_type",
          "product_count",
          "business",
          "creation_source",
          "feed_count",
          "parent_catalog_id",
          "source_app",
        ].join(","),
      },
    });
    const productFeeds = await fetchCatalogProductFeeds(catalogId);
    const productSets = await graphGetAll(`${catalogId}/product_sets`, {
      fields: [
        "id",
        "name",
        "filter",
        "capability",
        "cpas_category_product_set_id",
        "original_creation_source",
        "product_catalog{id,name,vertical,catalog_item_type}",
      ].join(","),
      limit: 200,
    }).catch((error) => {
      log(
        "warn",
        `Product sets export failed for catalog ${catalogId}.`,
        String(error),
      );
      return [];
    });
    const hasFeed =
      productFeeds.length > 0 || Number(catalog.feed_count || 0) > 0;
    const products = hasFeed ? [] : await fetchCatalogManualProducts(catalogId);
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      exportMode: hasFeed ? "feed" : "manual_products",
      catalog: {
        id: String(catalog.id),
        name: catalog.name || catalogHint.name || catalog.id,
        vertical: catalog.vertical || catalogHint.vertical || "commerce",
        catalog_item_type:
          catalog.catalog_item_type || catalogHint.catalog_item_type || "",
        productCount: catalog.product_count ?? products.length,
        business: catalog.business || null,
        creation_source: catalog.creation_source || "",
        feed_count: catalog.feed_count ?? productFeeds.length,
        parent_catalog_id: catalog.parent_catalog_id || "",
        source_app: catalog.source_app || "",
      },
      productFeeds,
      productSets: productSets.map((item) => ({
        ...item,
        id: String(item.id),
      })),
      products: products.map((item) => ({ ...item, id: String(item.id) })),
    };
  }

  async fetchCatalogExportsForPackage(catalogs) {
    const { log } = this.dependencies.logging;
    const { fetchCatalogExportSnapshot } = this;
    const exports = [];
    const seen = new Set();
    for (const catalog of catalogs || []) {
      const catalogId = String(catalog?.id || "");
      if (!catalogId || seen.has(catalogId)) {
        continue;
      }
      seen.add(catalogId);
      try {
        const snapshot = await fetchCatalogExportSnapshot(catalog);
        if (snapshot) {
          exports.push(snapshot);
          log(
            "info",
            `Catalog exported: ${snapshot.catalog.name} (${snapshot.exportMode}).`,
          );
        }
      } catch (error) {
        log(
          "warn",
          `Catalog export skipped for ${catalog.name || catalogId}.`,
          String(error),
        );
      }
    }
    return exports;
  }

  async fetchCatalogProductFeeds(catalogId, options = {}) {
    const { log } = this.dependencies.logging;
    const { graphGetAll } = this.dependencies.graphClient;
    const { fetchCatalogProductFeedsFromCommerce, normalizeCatalogFeedExport } =
      this;
    const fieldAttempts = [
      [
        "id",
        "name",
        "created_time",
        "updated_time",
        "schedule",
        "file_name",
        "delimiter",
        "encoding",
        "quoted_fields",
        "default_currency",
        "feed_type",
        "latest_upload",
      ].join(","),
      "id,name,schedule,file_name,delimiter,encoding,quoted_fields,default_currency",
      "id,name,schedule",
      "id,name",
    ];
    let lastGraphError = null;
    for (const fields of fieldAttempts) {
      try {
        const feeds = await graphGetAll(`${catalogId}/product_feeds`, {
          fields,
          limit: 100,
        });
        return feeds.map((item) => normalizeCatalogFeedExport(item));
      } catch (error) {
        lastGraphError = error;
      }
    }
    const commerceFeeds = await fetchCatalogProductFeedsFromCommerce(catalogId);
    if (commerceFeeds.length) {
      log(
        "info",
        `Product feed Graph edge unavailable for catalog ${catalogId}; exported via Commerce Manager data-source queries.`,
      );
      return commerceFeeds;
    }
    if (lastGraphError && !options.suppressEmptyLog) {
      const level = isPermissionDeniedGraphError(lastGraphError)
        ? "info"
        : "warn";
      log(
        level,
        `Product feed export returned no feeds for catalog ${catalogId}; Graph edge failed and Commerce Manager fallback was empty.`,
        String(lastGraphError),
      );
    }
    return commerceFeeds;
  }

  async fetchCatalogProductFeedsFromCommerce(catalogId) {
    const { log } = this.dependencies.logging;
    const { businessGraphqlRequest } = this.dependencies.privateGraphqlClient;
    const { normalizeCatalogFeedExport } = this;
    try {
      const selector = await businessGraphqlRequest(
        "24399249673110817",
        "CatalogDataSourceSelectorV2Query",
        { catalogID: String(catalogId) },
      );
      const nodes = selector?.data?.catalog?.data_sources_v2?.nodes || [];
      const feeds = [];
      for (const node of nodes) {
        if (node?.__typename && node.__typename !== "ProductFeed") {
          continue;
        }
        const dataSourceId = String(node?.data_source_id || node?.id || "");
        if (!dataSourceId) {
          continue;
        }
        try {
          const details = await businessGraphqlRequest(
            "27127405650294914",
            "CatalogDataSourcesUnifiedDetailsPageQuery",
            {
              catalogID: String(catalogId),
              dataSourceID: dataSourceId,
            },
          );
          const dataSource = details?.data?.dataSource || {};
          feeds.push(
            normalizeCatalogFeedExport({
              ...node,
              ...dataSource,
              id: dataSource.id || dataSourceId,
              raw: dataSource,
              commerce_query: {
                selector_doc_id: "24399249673110817",
                details_doc_id: "27127405650294914",
              },
            }),
          );
        } catch (detailError) {
          log(
            "warn",
            `Commerce feed detail export failed for feed ${dataSourceId}.`,
            String(detailError),
          );
          feeds.push(normalizeCatalogFeedExport(node));
        }
      }
      return feeds;
    } catch (error) {
      log(
        "warn",
        `Commerce data-source feed export failed for catalog ${catalogId}.`,
        String(error),
      );
    }
    return [];
  }

  normalizeCatalogFeedExport(feed) {
    const schedule =
      feed?.schedule && typeof feed.schedule === "object"
        ? deepClone(feed.schedule)
        : feed?.schedule || null;
    if (
      schedule &&
      typeof schedule === "object" &&
      schedule.uri &&
      !schedule.url
    ) {
      schedule.url = schedule.uri;
    }
    return {
      id: String(feed?.id || feed?.data_source_id || ""),
      name:
        feed?.name ||
        feed?.file_name ||
        feed?.data_source_display_name ||
        feed?.id ||
        "AdReplica feed",
      data_source_id: String(feed?.data_source_id || feed?.id || ""),
      data_upload_type: feed?.data_upload_type || "",
      data_source_status: feed?.data_source_status || "",
      ingestion_source_type: feed?.ingestion_source_type || "",
      override_type: feed?.override_type || feed?.data_override_type || "",
      product_count: feed?.product_count ?? null,
      schedule,
      file_name: feed?.file_name || "",
      delimiter: feed?.delimiter || "",
      encoding: feed?.encoding || "",
      quoted_fields: feed?.quoted_fields ?? "",
      default_currency: feed?.default_currency || "",
      feed_type: feed?.feed_type || "",
      latest_upload: feed?.latest_upload || null,
      raw: deepClone(feed?.raw || feed || {}),
    };
  }

  async fetchCatalogManualProducts(catalogId) {
    const { log } = this.dependencies.logging;
    const { graphGetAll } = this.dependencies.graphClient;
    return graphGetAll(`${catalogId}/products`, {
      fields: [
        "id",
        "retailer_id",
        "name",
        "description",
        "availability",
        "condition",
        "price",
        "currency",
        "url",
        "image_url",
        "additional_image_urls",
        "brand",
        "item_group_id",
        "google_product_category",
        "fb_product_category",
        "custom_label_0",
        "custom_label_1",
        "custom_label_2",
        "custom_label_3",
        "custom_label_4",
      ].join(","),
      limit: 200,
    }).catch((error) => {
      log(
        "warn",
        `Manual product export failed for catalog ${catalogId}.`,
        String(error),
      );
      return [];
    });
  }
}
