import { pickDefinedFields } from "../domain/catalog.mjs";
import { sleep } from "../utils/object.mjs";

/** CatalogProductService. Dependencies are supplied by the application composition root. */
export class CatalogProductService {
  constructor(dependencies) {
    this.dependencies = dependencies;
    this.buildCatalogProductPayload =
      this.buildCatalogProductPayload.bind(this);
    this.normalizeCatalogPriceForWrite =
      this.normalizeCatalogPriceForWrite.bind(this);
    this.copyCatalogProducts = this.copyCatalogProducts.bind(this);
    this.fetchCatalogProductIdRows = this.fetchCatalogProductIdRows.bind(this);
    this.waitForCatalogProducts = this.waitForCatalogProducts.bind(this);
    this.buildCatalogProductIdMapByRetailer =
      this.buildCatalogProductIdMapByRetailer.bind(this);
  }

  buildCatalogProductPayload(product) {
    const { normalizeCatalogPriceForWrite } = this;
    const body = pickDefinedFields(product, [
      "retailer_id",
      "name",
      "description",
      "availability",
      "condition",
      "price",
      "currency",
      "url",
      "image_url",
      "brand",
      "item_group_id",
      "google_product_category",
      "fb_product_category",
      "custom_label_0",
      "custom_label_1",
      "custom_label_2",
      "custom_label_3",
      "custom_label_4",
    ]);
    body.name = body.name || product.retailer_id || product.id;
    body.description = body.description || body.name;
    body.availability = body.availability || "in stock";
    body.condition = body.condition || "new";
    if (body.price !== undefined) {
      body.price = normalizeCatalogPriceForWrite(body.price);
    }
    return body;
  }

  normalizeCatalogPriceForWrite(value) {
    if (typeof value === "number") {
      return Math.round(value);
    }
    const raw = String(value || "").trim();
    if (!raw) {
      return value;
    }
    const matches = raw.match(/[\d.,]+/g);
    if (!matches?.length) {
      return value;
    }
    let numeric = matches[matches.length - 1];
    if (numeric.includes(",") && numeric.includes(".")) {
      numeric = numeric.replaceAll(",", "");
    } else if (numeric.includes(",") && !numeric.includes(".")) {
      numeric = numeric.replace(",", ".");
    }
    const parsed = Number(numeric);
    return Number.isFinite(parsed) ? Math.round(parsed * 100) : value;
  }

  async copyCatalogProducts(sourceProducts, targetCatalogId) {
    const { log } = this.dependencies.logging;
    const { graphFetch, graphGetAll } = this.dependencies.graphClient;
    const { buildCatalogProductPayload } = this;
    const existingProducts = await graphGetAll(`${targetCatalogId}/products`, {
      fields: "id,retailer_id",
      limit: 200,
    });
    const targetByRetailer = new Map();
    for (const item of existingProducts) {
      if (item.retailer_id) {
        targetByRetailer.set(String(item.retailer_id), String(item.id));
      }
    }
    const productIdMap = {};
    for (const product of sourceProducts) {
      const retailerId = String(product.retailer_id || product.id);
      if (targetByRetailer.has(retailerId)) {
        productIdMap[String(product.id)] = targetByRetailer.get(retailerId);
        continue;
      }
      const created = await graphFetch(`${targetCatalogId}/products`, {
        method: "POST",
        body: buildCatalogProductPayload({
          ...product,
          retailer_id: retailerId,
        }),
      });
      const targetId = String(created.id || created.product_id || "");
      productIdMap[String(product.id)] = targetId;
      targetByRetailer.set(retailerId, targetId);
      log("info", `Catalog product copied: ${retailerId}`);
    }
    return productIdMap;
  }

  async fetchCatalogProductIdRows(catalogId) {
    const { log } = this.dependencies.logging;
    const { graphGetAll } = this.dependencies.graphClient;
    return graphGetAll(`${catalogId}/products`, {
      fields: "id,retailer_id",
      limit: 200,
    }).catch((error) => {
      log(
        "warn",
        `Catalog product ID map read failed for ${catalogId}.`,
        String(error),
      );
      return [];
    });
  }

  async waitForCatalogProducts(catalogId, expectedCount) {
    const { log } = this.dependencies.logging;
    const { fetchCatalogProductIdRows } = this;
    const targetCount = Number(expectedCount || 0);
    if (!targetCount) {
      return;
    }
    const deadline = Date.now() + 90000;
    while (Date.now() < deadline) {
      const rows = await fetchCatalogProductIdRows(catalogId);
      if (rows.length >= targetCount) {
        return rows;
      }
      log(
        "info",
        `Waiting for catalog products in ${catalogId}: ${rows.length}/${targetCount}.`,
      );
      await sleep(5000);
    }
  }

  async buildCatalogProductIdMapByRetailer(
    sourceCatalogId,
    targetCatalogId,
    expectedCount,
  ) {
    const { log } = this.dependencies.logging;
    const { fetchCatalogProductIdRows, waitForCatalogProducts } = this;
    await waitForCatalogProducts(targetCatalogId, expectedCount);
    const [sourceRows, targetRows] = await Promise.all([
      fetchCatalogProductIdRows(sourceCatalogId),
      fetchCatalogProductIdRows(targetCatalogId),
    ]);
    const targetByRetailer = new Map();
    for (const row of targetRows) {
      if (row.retailer_id) {
        targetByRetailer.set(String(row.retailer_id), String(row.id));
      }
    }
    const productIdMap = {};
    for (const source of sourceRows) {
      const retailerId = String(source.retailer_id || "");
      const targetId = retailerId ? targetByRetailer.get(retailerId) : "";
      if (source.id && targetId) {
        productIdMap[String(source.id)] = targetId;
      }
    }
    if (Object.keys(productIdMap).length) {
      log(
        "info",
        `Mapped ${Object.keys(productIdMap).length} catalog product IDs by retailer_id.`,
      );
    }
    return productIdMap;
  }
}
