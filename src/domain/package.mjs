import { getSourcePageId } from "./creative.mjs";
import { CATALOG_ID_KEYS, PRODUCT_SET_ID_KEYS } from "./constants.mjs";
import { isSyntheticProductSetName, rankProductSetMeta } from "./catalog.mjs";
import { deepClone } from "../utils/object.mjs";

export function hasCarouselAttachmentMedia(raw) {
  const attachments = raw?.object_story_spec?.link_data?.child_attachments;
  return (
    Array.isArray(attachments) &&
    attachments.some((attachment) => attachment?.image_hash)
  );
}

export function isCatalogTemplateCreative(raw) {
  const osp = raw?.object_story_spec || {};
  return Boolean(
    osp.template_data ||
    raw?.template_url_spec ||
    raw?.template_url ||
    raw?.product_set_id ||
    raw?.catalog_id ||
    raw?.product_catalog_id,
  );
}

export function getSourcePagesFromPackage(packageData) {
  if (!packageData) return [];
  const pages = new Map();
  for (const creative of packageData.creatives || []) {
    const pageId = getSourcePageId(creative);
    if (!pageId) continue;
    if (!pages.has(pageId)) {
      pages.set(pageId, {
        id: pageId,
        name: creative.sourcePageName || pageId,
      });
    }
  }
  return [...pages.values()];
}

export function getSourcePixelsFromPackage(packageData) {
  if (!packageData) return [];
  const pixels = new Map();
  for (const adset of packageData.adsets || []) {
    const pixelId = adset?.promoted_object?.pixel_id
      ? String(adset.promoted_object.pixel_id)
      : "";
    if (!pixelId) continue;
    if (!pixels.has(pixelId)) {
      pixels.set(pixelId, {
        id: pixelId,
        name: adset?.name || pixelId,
      });
    }
  }
  return [...pixels.values()];
}

export function addScalarIdRef(refs, value, meta = {}) {
  if (Array.isArray(value)) {
    value.forEach((item) => addScalarIdRef(refs, item, meta));
    return;
  }
  if (value && typeof value === "object" && value.id) {
    addScalarIdRef(refs, value.id, meta);
    return;
  }
  if (value === undefined || value === null || value === "") {
    return;
  }
  const id = String(value);
  if (!/^\d{5,}$/.test(id)) {
    return;
  }
  if (!refs.has(id)) {
    refs.set(id, { id, paths: [], names: new Set() });
  }
  const ref = refs.get(id);
  if (meta.path) {
    ref.paths.push(meta.path);
  }
  if (meta.name) {
    ref.names.add(meta.name);
  }
}

export function collectCatalogRefs(node, refs, path = "", sourceName = "") {
  if (!node) return;
  if (Array.isArray(node)) {
    node.forEach((item, index) =>
      collectCatalogRefs(item, refs, `${path}[${index}]`, sourceName),
    );
    return;
  }
  if (typeof node !== "object") {
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    const nextPath = path ? `${path}.${key}` : key;
    if (CATALOG_ID_KEYS.has(key)) {
      addScalarIdRef(refs.catalogs, value, {
        path: nextPath,
        name: sourceName,
      });
    }
    if (PRODUCT_SET_ID_KEYS.has(key)) {
      addScalarIdRef(refs.productSets, value, {
        path: nextPath,
        name: sourceName,
      });
    }
    if (key === "product_catalog" && value && typeof value === "object") {
      addScalarIdRef(refs.catalogs, value.id, {
        path: `${nextPath}.id`,
        name: value.name || sourceName,
      });
    }
    collectCatalogRefs(value, refs, nextPath, sourceName);
  }
}

export function getCatalogRefsFromPackage(packageData) {
  const refs = {
    catalogs: new Map(),
    productSets: new Map(),
  };
  if (!packageData) return refs;
  collectCatalogRefs(
    packageData.campaign,
    refs,
    "campaign",
    packageData.campaign?.name || packageData.source?.campaignName || "",
  );
  for (const adset of packageData.adsets || []) {
    collectCatalogRefs(
      adset,
      refs,
      `adset:${adset.id}`,
      adset.name || adset.id,
    );
  }
  for (const creative of packageData.creatives || []) {
    collectCatalogRefs(
      creative.raw || creative,
      refs,
      `creative:${creative.id}`,
      creative.name || creative.id,
    );
  }
  for (const catalog of packageData.catalogs || []) {
    addScalarIdRef(refs.catalogs, catalog.id, {
      path: "catalogs",
      name: catalog.name || catalog.id,
    });
  }
  for (const catalogExport of packageData.catalogExports || []) {
    addScalarIdRef(
      refs.catalogs,
      catalogExport.catalog?.id || catalogExport.id,
      {
        path: "catalogExports.catalog.id",
        name:
          catalogExport.catalog?.name || catalogExport.name || catalogExport.id,
      },
    );
    for (const productSet of catalogExport.productSets || []) {
      addScalarIdRef(refs.productSets, productSet.id, {
        path: "catalogExports.productSets",
        name: productSet.name || productSet.id,
      });
    }
  }
  for (const productSet of packageData.productSets || []) {
    addScalarIdRef(refs.productSets, productSet.id, {
      path: "productSets",
      name: productSet.name || productSet.id,
    });
    if (productSet.product_catalog?.id) {
      addScalarIdRef(refs.catalogs, productSet.product_catalog.id, {
        path: "productSets.product_catalog.id",
        name:
          productSet.product_catalog.name ||
          productSet.name ||
          productSet.product_catalog.id,
      });
    }
    if (productSet.catalog_id) {
      addScalarIdRef(refs.catalogs, productSet.catalog_id, {
        path: "productSets.catalog_id",
        name:
          productSet.catalog_name || productSet.name || productSet.catalog_id,
      });
    }
  }
  return refs;
}

export function getSourceCatalogsFromPackage(packageData) {
  const refs = getCatalogRefsFromPackage(packageData);
  return [...refs.catalogs.values()].map((ref) => ({
    id: ref.id,
    name: [...ref.names].filter(Boolean)[0] || `Catalog ${ref.id}`,
    paths: ref.paths,
  }));
}

export function getSourceProductSetsFromPackage(packageData) {
  const refs = getCatalogRefsFromPackage(packageData);
  return [...refs.productSets.values()].map((ref) => ({
    id: ref.id,
    name:
      getPackageProductSetById(packageData, ref.id)?.name ||
      [...ref.names].find((name) => !isSyntheticProductSetName(name)) ||
      [...ref.names].filter(Boolean)[0] ||
      `Product set ${ref.id}`,
    paths: ref.paths,
  }));
}

export function mergeEntityHintsById(...hintLists) {
  const merged = new Map();
  for (const hints of hintLists) {
    for (const hint of hints || []) {
      const id = String(hint?.id || "");
      if (!id) {
        continue;
      }
      merged.set(id, {
        ...(merged.get(id) || {}),
        ...hint,
        id,
      });
    }
  }
  return [...merged.values()];
}

export function replaceMappedCatalogReferences(
  node,
  catalogMappings,
  productSetMappings = {},
) {
  if (
    !node ||
    ((!catalogMappings || !Object.keys(catalogMappings).length) &&
      (!productSetMappings || !Object.keys(productSetMappings).length))
  ) {
    return node;
  }
  if (Array.isArray(node)) {
    node.forEach((item) =>
      replaceMappedCatalogReferences(item, catalogMappings, productSetMappings),
    );
    return node;
  }
  if (typeof node !== "object") {
    return node;
  }
  for (const [key, value] of Object.entries(node)) {
    if (CATALOG_ID_KEYS.has(key) && value !== undefined && value !== null) {
      const mapped = catalogMappings[String(value)];
      if (mapped) {
        node[key] = mapped;
        continue;
      }
    }
    if (PRODUCT_SET_ID_KEYS.has(key) && value !== undefined && value !== null) {
      if (Array.isArray(value)) {
        node[key] = value.map(
          (item) => productSetMappings[String(item)] || item,
        );
        continue;
      }
      const mapped = productSetMappings[String(value)];
      if (mapped) {
        node[key] = mapped;
        continue;
      }
    }
    if (
      key === "product_catalog" &&
      value &&
      typeof value === "object" &&
      value.id
    ) {
      const mapped = catalogMappings[String(value.id)];
      if (mapped) {
        value.id = mapped;
      }
    }
    replaceMappedCatalogReferences(value, catalogMappings, productSetMappings);
  }
  return node;
}

export function materializeCatalogMappedPackage(
  packageData,
  catalogMappings,
  productSetMappings = {},
) {
  if (
    !packageData ||
    ((!catalogMappings || !Object.keys(catalogMappings).length) &&
      (!productSetMappings || !Object.keys(productSetMappings).length))
  ) {
    return packageData;
  }
  const next = deepClone(packageData);
  replaceMappedCatalogReferences(next, catalogMappings, productSetMappings);
  return next;
}

export function getPackageProductSetById(packageData, productSetId) {
  const normalizedId = String(productSetId || "");
  if (!normalizedId || !packageData) {
    return null;
  }
  const candidates = [];
  for (const item of packageData.productSets || []) {
    if (String(item?.id || "") === normalizedId) {
      candidates.push(item);
    }
  }
  for (const snapshot of packageData.catalogExports || []) {
    const found = (snapshot?.productSets || []).find(
      (item) => String(item?.id || "") === normalizedId,
    );
    if (found) {
      candidates.push(found);
    }
  }
  if (!candidates.length) {
    return null;
  }
  return candidates.reduce((best, current) =>
    rankProductSetMeta(current) > rankProductSetMeta(best) ? current : best,
  );
}

export function resolveSourceProductSetCatalogId(packageData, productSetId) {
  const normalizedId = String(productSetId || "");
  if (!normalizedId || !packageData) {
    return "";
  }
  const productSet = getPackageProductSetById(packageData, normalizedId);
  if (productSet?.product_catalog?.id) {
    return String(productSet.product_catalog.id);
  }
  if (productSet?.catalog_id) {
    return String(productSet.catalog_id);
  }
  const sourceCatalogs = getSourceCatalogsFromPackage(packageData);
  if (sourceCatalogs.length === 1) {
    return String(sourceCatalogs[0].id || "");
  }
  const candidateCatalogIds = new Set();
  for (const creative of packageData.creatives || []) {
    const raw = creative?.raw || {};
    const matches =
      String(raw.product_set_id || "") === normalizedId ||
      (Array.isArray(raw.product_set_ids) &&
        raw.product_set_ids.some((item) => String(item) === normalizedId));
    if (!matches) {
      continue;
    }
    if (raw.product_catalog_id) {
      candidateCatalogIds.add(String(raw.product_catalog_id));
    }
    if (raw.catalog_id) {
      candidateCatalogIds.add(String(raw.catalog_id));
    }
  }
  return candidateCatalogIds.size === 1 ? [...candidateCatalogIds][0] : "";
}
