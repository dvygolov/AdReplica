export function buildDefaultCloneCampaignName(sourceName) {
  const normalized = String(sourceName || "").trim();
  return normalized ? `${normalized} (Clone)` : "";
}

export function buildDefaultCloneCatalogName(sourceCatalog) {
  const sourceName =
    sourceCatalog?.name ||
    (sourceCatalog?.id ? `Catalog ${sourceCatalog.id}` : "Catalog");
  return buildDefaultCloneCampaignName(sourceName) || "Catalog (Clone)";
}
