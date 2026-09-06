import { deepClone } from "../utils/object.mjs";

export function isLikelyCatalogCreative(creative) {
  const raw = creative?.raw || creative || {};
  const osp = raw.object_story_spec || {};
  if (raw.product_set_id || raw.product_catalog_id || raw.catalog_id) {
    return true;
  }
  if (raw.template_url_spec || raw.template_url) {
    return true;
  }
  if (osp.template_data) {
    return true;
  }
  return false;
}

export function isSyntheticProductSetName(value) {
  const name = String(value || "").trim();
  if (!name) {
    return true;
  }
  if (/\{\{\s*product\./i.test(name)) {
    return true;
  }
  if (/^\{\{.+\}\}\s+\d{4}-\d{2}-\d{2}-[a-f0-9]{8,}$/i.test(name)) {
    return true;
  }
  return false;
}

export function rankProductSetMeta(item) {
  if (!item || typeof item !== "object") {
    return -1;
  }
  let score = 0;
  if (item.product_catalog?.id || item.catalog_id) {
    score += 8;
  }
  if (item.filter) {
    score += 4;
  }
  if (item.cpas_category_product_set_id) {
    score += 3;
  }
  if (item.source === "dpa_eligible_product_catalogs") {
    score += 2;
  }
  if (item.name && !isSyntheticProductSetName(item.name)) {
    score += 2;
  }
  return score;
}

export function normalizeDpaCatalogHint(item, fallbackAdName = "") {
  const productCatalog = item?.product_catalog || item;
  const catalogId = productCatalog?.id || item?.id;
  if (!catalogId) {
    return null;
  }
  const productSets = (item?.product_sets?.data || [])
    .filter((productSet) => productSet?.id)
    .map((productSet) => ({
      id: String(productSet.id),
      name: productSet.name || `Product set ${productSet.id}`,
      filter: productSet.filter,
      is_autogen_product_set: Boolean(productSet.is_autogen_product_set),
      cpas_category_product_set_id:
        productSet.cpas_category_product_set_id || "",
      capability: productSet.capability || "",
      product_catalog: {
        id: String(catalogId),
        name: productCatalog?.name || item?.name || `Catalog ${catalogId}`,
        vertical: productCatalog?.vertical || item?.vertical || "commerce",
        catalog_item_type:
          productCatalog?.catalog_item_type || item?.catalog_item_type || "",
      },
      source: "dpa_eligible_product_catalogs",
    }));
  return {
    catalog: {
      id: String(catalogId),
      name:
        productCatalog?.name ||
        item?.name ||
        fallbackAdName ||
        `Catalog ${catalogId}`,
      vertical: productCatalog?.vertical || item?.vertical || "commerce",
      catalog_item_type:
        productCatalog?.catalog_item_type || item?.catalog_item_type || "",
      source: "dpa_eligible_product_catalogs",
    },
    productSets,
  };
}

export function pickDefinedFields(source, fields) {
  const body = {};
  for (const field of fields) {
    const value = source?.[field];
    if (value !== undefined && value !== null && value !== "") {
      body[field] = value;
    }
  }
  return body;
}

export function getCatalogExportSnapshotFromPackage(packageData, catalogId) {
  const normalizedId = String(catalogId || "");
  return (
    (packageData?.catalogExports || []).find(
      (item) => String(item?.catalog?.id || item?.id || "") === normalizedId,
    ) || null
  );
}

export function remapProductSetFilter(filter, productIdMap) {
  if (!filter) {
    return "";
  }
  let parsed;
  try {
    parsed =
      typeof filter === "string" ? JSON.parse(filter) : deepClone(filter);
  } catch (_error) {
    return filter;
  }
  const walk = (node) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === "product_item_id" && value && typeof value === "object") {
        for (const op of ["eq", "neq"]) {
          if (value[op] && productIdMap[String(value[op])]) {
            value[op] = productIdMap[String(value[op])];
          }
        }
        if (Array.isArray(value.in)) {
          value.in = value.in.map((item) => productIdMap[String(item)] || item);
        }
      }
      walk(value);
    }
  };
  walk(parsed);
  return JSON.stringify(parsed);
}

export function canonicalProductSetFilter(filter) {
  if (filter == null || filter === "") return null;
  try {
    const parsed = typeof filter === "string" ? JSON.parse(filter) : filter;
    const normalize = (value) =>
      Array.isArray(value)
        ? value.map(normalize)
        : value && typeof value === "object"
          ? Object.fromEntries(
              Object.keys(value)
                .sort()
                .map((key) => [key, normalize(value[key])]),
            )
          : value;
    return JSON.stringify(normalize(parsed));
  } catch {
    return null;
  }
}

export function pickFallbackTargetProductSet(source, targets) {
  const filter = canonicalProductSetFilter(source?.filter);
  const matches = targets.filter(
    (item) =>
      (source?.cpas_category_product_set_id &&
        String(item.cpas_category_product_set_id) ===
          String(source.cpas_category_product_set_id)) ||
      (filter !== null &&
        canonicalProductSetFilter(item.filter) === filter &&
        String(item.name || "")
          .trim()
          .toLowerCase() ===
          String(source?.name || "")
            .trim()
            .toLowerCase()),
  );
  return matches.length === 1 ? matches[0] : null;
}
