import { deepClone } from "../utils/object.mjs";

export function getAccountLabel(account) {
  const owner = account.ownerName ? `${account.ownerName} / ` : "";
  const count =
    typeof account.campaignsCount === "number"
      ? ` (${account.campaignsCount})`
      : "";
  return `${owner}${account.name}${count} [${account.id}]`;
}

export function getSourcePageId(creative) {
  if (creative?.raw?.object_story_spec?.page_id) {
    return String(creative.raw.object_story_spec.page_id);
  }
  if (creative?.raw?.object_story_id) {
    return String(creative.raw.object_story_id).split("_")[0] || "";
  }
  return "";
}

export function appendCreativeUrlTags(body, raw) {
  if (raw?.url_tags) {
    body.url_tags = raw.url_tags;
  }
  return body;
}

export function isGeneratedVideoThumbnailSource(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return (
    !normalized ||
    normalized === "generated_default" ||
    normalized === "default" ||
    normalized === "auto"
  );
}

export function extractMediaExtensionFromUrl(url, fallback = ".jpg") {
  if (!url) {
    return fallback;
  }
  try {
    const pathname = new URL(String(url)).pathname || "";
    const match = pathname.match(/(\.[a-z0-9]{2,5})$/i);
    if (match) {
      const ext = match[1].toLowerCase();
      if ([".jpg", ".jpeg", ".png", ".webp"].includes(ext)) {
        return ext === ".jpeg" ? ".jpg" : ext;
      }
    }
  } catch (_error) {
    // noop
  }
  return fallback;
}

export function hasStandaloneCustomVideoThumbnail(videoData) {
  if (!videoData || typeof videoData !== "object") {
    return false;
  }
  if (videoData.image_hash) {
    return true;
  }
  if (
    videoData.image_url &&
    !isGeneratedVideoThumbnailSource(videoData.video_thumbnail_source)
  ) {
    return true;
  }
  return false;
}

export function hasAssetFeedCustomVideoThumbnail(videoSpec) {
  if (!videoSpec || typeof videoSpec !== "object") {
    return false;
  }
  if (videoSpec.thumbnail_hash) {
    return true;
  }
  if (
    videoSpec.thumbnail_url &&
    !isGeneratedVideoThumbnailSource(videoSpec.thumbnail_source)
  ) {
    return true;
  }
  return false;
}

export function getVideoThumbnailOriginalName(videoId, ext = ".jpg") {
  return `${String(videoId || "")}__preview${ext}`;
}

export function buildDraftStandaloneVideoCreative(raw, fallbackName = "") {
  if (!raw || typeof raw !== "object") {
    return {};
  }
  const osp = raw.object_story_spec || {};
  const videoData = osp.video_data || {};
  const payload = {};
  if (raw.name || fallbackName) {
    payload.name = raw.name || fallbackName;
  }
  for (const field of [
    "degrees_of_freedom_spec",
    "creative_sourcing_spec",
    "contextual_multi_ads",
    "actor_type",
    "authorization_category",
    "branded_content_sponsor_page_id",
    "destination_spec",
    "instagram_actor_id",
    "product_set_id",
    "template_url_spec",
    "object_type",
    "thumbnail_url",
    "uca_draft_version",
    "use_page_actor_override",
  ]) {
    if (raw[field] !== undefined) {
      payload[field] = deepClone(raw[field]);
    }
  }
  if (payload.actor_type === undefined) {
    payload.actor_type = "PAGE";
  }
  if (payload.object_type === undefined) {
    payload.object_type = "VIDEO";
  }
  if (raw.url_tags) {
    payload.url_tags = raw.url_tags;
  }
  const objectStorySpec = deepClone(osp);
  delete objectStorySpec.link_data;
  const normalizedVideoData = deepClone(videoData);
  for (const [field, value] of Object.entries(normalizedVideoData)) {
    if (value === undefined || value === null || value === "") {
      delete normalizedVideoData[field];
    }
  }
  if (Object.keys(normalizedVideoData).length) {
    objectStorySpec.video_data = normalizedVideoData;
  } else {
    delete objectStorySpec.video_data;
  }
  if (Object.keys(objectStorySpec).length) {
    payload.object_story_spec = objectStorySpec;
  }
  return payload;
}

export function buildImportedCreativePayload(raw) {
  const payload = {};
  if (!raw || typeof raw !== "object") {
    return payload;
  }
  for (const field of [
    "degrees_of_freedom_spec",
    "creative_sourcing_spec",
    "contextual_multi_ads",
    "actor_type",
    "authorization_category",
    "branded_content_sponsor_page_id",
    "destination_spec",
    "instagram_actor_id",
    "product_set_id",
    "template_url_spec",
    "object_type",
    "thumbnail_url",
    "uca_draft_version",
    "use_page_actor_override",
  ]) {
    if (raw[field] !== undefined) {
      payload[field] = deepClone(raw[field]);
    }
  }
  if (raw.object_story_spec) {
    payload.object_story_spec = deepClone(raw.object_story_spec);
  }
  if (raw.asset_feed_spec) {
    payload.asset_feed_spec = deepClone(raw.asset_feed_spec);
  }
  return appendCreativeUrlTags(payload, raw);
}

export function resolveMutuallyExclusiveStoryImageFields(payload) {
  const objectStorySpec = payload?.object_story_spec;
  if (!objectStorySpec || typeof objectStorySpec !== "object") {
    return payload;
  }

  const seen = new Set();
  const normalizeNode = (node) => {
    if (!node || typeof node !== "object" || seen.has(node)) {
      return;
    }
    seen.add(node);
    if (
      !Array.isArray(node) &&
      node.image_hash &&
      Object.prototype.hasOwnProperty.call(node, "picture")
    ) {
      delete node.picture;
    }
    if (Array.isArray(node)) {
      for (const item of node) {
        normalizeNode(item);
      }
      return;
    }
    for (const value of Object.values(node)) {
      if (value && typeof value === "object") {
        normalizeNode(value);
      }
    }
  };
  normalizeNode(objectStorySpec);
  return payload;
}

export function setStoryImageHash(target, imageHash) {
  if (!target || typeof target !== "object") {
    return target;
  }
  target.image_hash = imageHash;
  delete target.picture;
  return target;
}

export function buildCreativeValidationPayload(payload, creativeName) {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const body = {};
  for (const field of [
    "degrees_of_freedom_spec",
    "creative_sourcing_spec",
    "contextual_multi_ads",
    "actor_type",
    "authorization_category",
    "branded_content_sponsor_page_id",
    "destination_spec",
    "instagram_actor_id",
    "product_set_id",
    "template_url_spec",
    "object_type",
    "thumbnail_url",
    "uca_draft_version",
    "use_page_actor_override",
  ]) {
    if (payload[field] !== undefined) {
      body[field] = deepClone(payload[field]);
    }
  }
  if (payload.object_story_id) {
    body.object_story_id = payload.object_story_id;
  }
  if (payload.object_story_spec) {
    body.object_story_spec = deepClone(payload.object_story_spec);
  }
  if (payload.asset_feed_spec) {
    body.asset_feed_spec = deepClone(payload.asset_feed_spec);
  }
  if (payload.url_tags) {
    body.url_tags = payload.url_tags;
  }
  if (payload.name || creativeName) {
    body.name = payload.name || creativeName;
  }
  return resolveMutuallyExclusiveStoryImageFields(body);
}

export function stripCreativePreviewIdentifiers(raw) {
  if (!raw || typeof raw !== "object") {
    return raw;
  }
  delete raw.id;
  delete raw.object_story_id;
  delete raw.effective_object_story_id;
  delete raw.effective_instagram_media_id;
  delete raw.effective_instagram_story_id;
  delete raw.instagram_permalink_url;
  return raw;
}

export function synchronizeCreativeIdentityFields(raw, osp) {
  if (!raw || typeof raw !== "object") {
    return raw;
  }
  if (osp?.instagram_actor_id) {
    raw.instagram_actor_id = osp.instagram_actor_id;
  } else {
    delete raw.instagram_actor_id;
  }
  return raw;
}

export function replaceCreativePageReferences(
  node,
  sourcePageId,
  mappedPageId,
) {
  if (
    !node ||
    !sourcePageId ||
    !mappedPageId ||
    sourcePageId === mappedPageId
  ) {
    return node;
  }
  if (Array.isArray(node)) {
    node.forEach((item) =>
      replaceCreativePageReferences(item, sourcePageId, mappedPageId),
    );
    return node;
  }
  if (typeof node !== "object") {
    return node;
  }
  for (const [key, value] of Object.entries(node)) {
    if (
      (key === "page_id" ||
        key === "pageId" ||
        key === "pageID" ||
        key === "source_page_id") &&
      String(value) === sourcePageId
    ) {
      node[key] = mappedPageId;
      continue;
    }
    replaceCreativePageReferences(value, sourcePageId, mappedPageId);
  }
  return node;
}

export function stripAssetFeedLabelIdsForImport(node, parentKey = "") {
  if (!node) {
    return node;
  }
  if (!parentKey) {
    const labelNamesById = new Map();
    const collectLabels = (current, currentParentKey = "") => {
      if (!current) return;
      if (Array.isArray(current)) {
        current.forEach((item) => collectLabels(item, currentParentKey));
        return;
      }
      if (typeof current !== "object") return;
      if (
        (currentParentKey === "adlabels" || /_label$/.test(currentParentKey)) &&
        current.id &&
        current.name
      ) {
        labelNamesById.set(String(current.id), String(current.name));
      }
      for (const [key, value] of Object.entries(current)) {
        collectLabels(value, key);
      }
    };
    collectLabels(node);

    const applyLabelNames = (current, currentParentKey = "") => {
      if (!current) return;
      if (Array.isArray(current)) {
        current.forEach((item) => applyLabelNames(item, currentParentKey));
        return;
      }
      if (typeof current !== "object") return;
      const isLabel =
        currentParentKey === "adlabels" || /_label$/.test(currentParentKey);
      if (isLabel && current.id && !current.name) {
        current.name =
          labelNamesById.get(String(current.id)) ||
          `adreplica_label_${String(current.id).replace(/[^a-z0-9]+/gi, "_")}`;
      }
      for (const [key, value] of Object.entries(current)) {
        applyLabelNames(value, key);
      }
    };
    applyLabelNames(node);
  }
  if (Array.isArray(node)) {
    node.forEach((item) => stripAssetFeedLabelIdsForImport(item, parentKey));
    return node;
  }
  if (typeof node !== "object") {
    return node;
  }
  if (
    parentKey === "adlabels" ||
    (/_label$/.test(parentKey) &&
      Object.prototype.hasOwnProperty.call(node, "name"))
  ) {
    delete node.id;
  }
  for (const [key, value] of Object.entries(node)) {
    stripAssetFeedLabelIdsForImport(value, key);
  }
  return node;
}

export function materializePageMappedPackage(packageData, pageMappings) {
  if (!packageData || !pageMappings || !Object.keys(pageMappings).length) {
    return packageData;
  }
  const next = deepClone(packageData);
  for (const creative of next.creatives || []) {
    const sourcePageId = getSourcePageId(creative);
    const mappedPageId = pageMappings[sourcePageId] || sourcePageId;
    if (!sourcePageId || !mappedPageId || mappedPageId === sourcePageId) {
      continue;
    }
    replaceCreativePageReferences(creative.raw, sourcePageId, mappedPageId);
    if (creative.raw?.object_story_spec) {
      creative.raw.object_story_spec.page_id = mappedPageId;
      delete creative.raw.object_story_spec.instagram_user_id;
      delete creative.raw.object_story_spec.instagram_actor_id;
    }
  }
  for (const adset of next.adsets || []) {
    if (!adset?.promoted_object) {
      continue;
    }
    for (const [sourcePageId, mappedPageId] of Object.entries(pageMappings)) {
      if (!sourcePageId || !mappedPageId || sourcePageId === mappedPageId) {
        continue;
      }
      replaceCreativePageReferences(
        adset.promoted_object,
        sourcePageId,
        mappedPageId,
      );
    }
  }
  return next;
}

export function replacePixelIdsInUrlTags(urlTags, pixelMappings) {
  let next = String(urlTags || "");
  for (const [sourceId, targetId] of Object.entries(pixelMappings || {})) {
    if (!sourceId || !targetId || sourceId === targetId) {
      continue;
    }
    next = next.split(String(sourceId)).join(String(targetId));
  }
  return next;
}

export function materializePixelMappedPackage(packageData, pixelMappings) {
  if (!packageData || !pixelMappings || !Object.keys(pixelMappings).length) {
    return packageData;
  }
  const next = deepClone(packageData);
  for (const adset of next.adsets || []) {
    const pixelId = String(adset?.promoted_object?.pixel_id || "");
    if (pixelId && pixelMappings[pixelId]) {
      adset.promoted_object.pixel_id = pixelMappings[pixelId];
    }
  }
  for (const creative of next.creatives || []) {
    if (creative?.raw?.url_tags) {
      creative.raw.url_tags = replacePixelIdsInUrlTags(
        creative.raw.url_tags,
        pixelMappings,
      );
    }
  }
  return next;
}
