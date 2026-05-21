import { Config } from "./config.mjs";
import { APP_ID, APP_TITLE, APP_MARK_SVG, NATIVE_FETCH_FRAME_ID, PAGE_IDENTITY_HINTS_KEY } from "./app/constants.mjs";
import { AdReplicaApp } from "./app/ad-replica-app.mjs";
import { AdReplicaState } from "./state/ad-replica-state.mjs";
import { Logger } from "./core/logger.mjs";
import { sleep, deepClone } from "./utils/object.mjs";
import { escapeHtml, stripFacebookPrelude, sanitizeFileName } from "./utils/string.mjs";
import { isPermissionDeniedGraphError, isCatalogCreateAdminPermissionError } from "./utils/graph-errors.mjs";
import { getFacebookModule } from "./utils/facebook-runtime.mjs";
import { AdReplicaPanel } from "./ui/ad-replica-panel.mjs";
import { buildAdReplicaStyles } from "./ui/styles.mjs";
import { createServiceRegistry } from "./services/index.mjs";
(function adReplicaBootstrap() {
  "use strict";



  if (window.AdReplica && typeof window.AdReplica.destroy === "function") {
    window.AdReplica.destroy();
  }

  const state = new AdReplicaState();

  const dom = {};

  const logger = new Logger({ appTitle: APP_TITLE, state, onRender: () => renderLogs() });

  function log(level, message, details) {
    return logger.log(level, message, details);
  }

  function setBusy(isBusy) {
    state.busy = isBusy;
    renderStatus();
    renderButtons();
  }


  function getNativeFetchWindow() {
    let frame = document.getElementById(NATIVE_FETCH_FRAME_ID);
    if (!frame || !frame.contentWindow || typeof frame.contentWindow.fetch !== "function") {
      frame = document.createElement("iframe");
      frame.id = NATIVE_FETCH_FRAME_ID;
      frame.setAttribute("aria-hidden", "true");
      frame.tabIndex = -1;
      frame.style.cssText = "display:none!important;width:0;height:0;border:0;position:absolute;left:-9999px;";
      document.documentElement.appendChild(frame);
    }
    return frame.contentWindow;
  }

  function adReplicaFetch(input, init = {}) {
    return getNativeFetchWindow().fetch(input, init);
  }

  function hasAdsetDayParting(adset) {
    if (Array.isArray(adset?.adset_schedule)) {
      return adset.adset_schedule.length > 0;
    }
    if (typeof adset?.adset_schedule === "string" && adset.adset_schedule.trim()) {
      try {
        const parsed = JSON.parse(adset.adset_schedule);
        return Array.isArray(parsed) && parsed.length > 0;
      } catch (_error) {
        return true;
      }
    }
    return false;
  }

  function packageHasDayParting(pkg) {
    return Array.isArray(pkg?.adsets) && pkg.adsets.some((adset) => hasAdsetDayParting(adset));
  }

  function hasCampaignLevelBudget(campaign) {
    return hasPositiveBudget(campaign?.daily_budget) || hasPositiveBudget(campaign?.lifetime_budget);
  }

  function shouldIncludeAdsetSchedule(adset, options = {}) {
    return Boolean(adset?.adset_schedule) && !(options.hasCampaignBudget && hasAdsetDayParting(adset));
  }

  function normalizeDraftId(value) {
    return String(value ?? "").replace(/^addraft_/, "");
  }

  function nextDraftTempId() {
    if (!Number.isInteger(state.tempIdCursor)) {
      state.tempIdCursor = -Date.now();
    } else {
      state.tempIdCursor -= 1;
    }
    return state.tempIdCursor;
  }


  function hasPositiveBudget(value) {
    if (value === null || value === undefined || value === "") {
      return false;
    }
    const numeric = Number(value);
    if (!Number.isNaN(numeric)) {
      return numeric > 0;
    }
    return Boolean(String(value).trim());
  }

  function hasDynamicCreativeInPackage(packageData) {
    if (!packageData || !Array.isArray(packageData.adsets)) {
      return false;
    }
    return packageData.adsets.some((adset) =>
      Boolean(adset?.is_dynamic_creative)
      || Boolean(adset?.is_dynamic_creative_optimization)
      || Boolean(adset?.creative_sequence)
      || Boolean(adset?.asset_feed_id));
  }

  function stripVolatileEntityFields(entity) {
    const next = deepClone(entity || {});
    delete next.effective_status;
    return next;
  }

  function normalizeExportScheduleValue(value, options = {}) {
    const dropPast = Boolean(options.dropPast);
    if (!value) return "";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return value;
    }
    if (parsed.getUTCFullYear() <= 1970) {
      return "";
    }
    if (dropPast && parsed.getTime() < Date.now() - 60_000) {
      return "";
    }
    return value;
  }

  function normalizeExportScheduleFields(entity, fields, options = {}) {
    const next = deepClone(entity || {});
    for (const field of fields) {
      if (!Object.prototype.hasOwnProperty.call(next, field)) {
        continue;
      }
      const normalized = normalizeExportScheduleValue(next[field], options);
      if (normalized) {
        next[field] = normalized;
      } else {
        delete next[field];
      }
    }
    return next;
  }

  function normalizeCreativeExportRaw(raw) {
    return deepClone(raw || {});
  }

  function loadPageIdentityHints() {
    if (state.pageIdentityHints) {
      return state.pageIdentityHints;
    }
    try {
      const raw = window.localStorage.getItem(PAGE_IDENTITY_HINTS_KEY);
      state.pageIdentityHints = raw ? JSON.parse(raw) : {};
    } catch (_error) {
      state.pageIdentityHints = {};
    }
    return state.pageIdentityHints;
  }

  function getPageIdentityHint(pageId) {
    const hints = loadPageIdentityHints();
    return hints[String(pageId || "")] || null;
  }

  function savePageIdentityHint(pageId, hint) {
    const normalizedPageId = String(pageId || "");
    if (!normalizedPageId || !hint || typeof hint !== "object") {
      return;
    }
    const hints = loadPageIdentityHints();
    hints[normalizedPageId] = {
      ...(hints[normalizedPageId] || {}),
      ...deepClone(hint),
      pageId: normalizedPageId,
      savedAt: new Date().toISOString(),
    };
    try {
      window.localStorage.setItem(PAGE_IDENTITY_HINTS_KEY, JSON.stringify(hints));
    } catch (_error) {
      // noop
    }
  }

  function getAccountLabel(account) {
    const owner = account.ownerName ? `${account.ownerName} / ` : "";
    const count = typeof account.campaignsCount === "number" ? ` (${account.campaignsCount})` : "";
    return `${owner}${account.name}${count} [${account.id}]`;
  }

  function getSourcePageId(creative) {
    if (creative?.raw?.object_story_spec?.page_id) {
      return String(creative.raw.object_story_spec.page_id);
    }
    if (creative?.raw?.object_story_id) {
      return String(creative.raw.object_story_id).split("_")[0] || "";
    }
    return "";
  }

  function appendCreativeUrlTags(body, raw) {
    if (raw?.url_tags) {
      body.url_tags = raw.url_tags;
    }
    return body;
  }

  function isGeneratedVideoThumbnailSource(value) {
    const normalized = String(value || "").trim().toLowerCase();
    return !normalized || normalized === "generated_default" || normalized === "default" || normalized === "auto";
  }

  function extractMediaExtensionFromUrl(url, fallback = ".jpg") {
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

  function hasStandaloneCustomVideoThumbnail(videoData) {
    if (!videoData || typeof videoData !== "object") {
      return false;
    }
    if (videoData.image_hash) {
      return true;
    }
    if (videoData.image_url && !isGeneratedVideoThumbnailSource(videoData.video_thumbnail_source)) {
      return true;
    }
    return false;
  }

  function hasAssetFeedCustomVideoThumbnail(videoSpec) {
    if (!videoSpec || typeof videoSpec !== "object") {
      return false;
    }
    if (videoSpec.thumbnail_hash) {
      return true;
    }
    if (videoSpec.thumbnail_url && !isGeneratedVideoThumbnailSource(videoSpec.thumbnail_source)) {
      return true;
    }
    return false;
  }

  function getVideoThumbnailOriginalName(videoId, ext = ".jpg") {
    return `${String(videoId || "")}__preview${ext}`;
  }

  function buildDraftStandaloneVideoCreative(raw, fallbackName = "") {
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
      "enable_direct_install",
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
    if (payload.enable_direct_install === undefined) {
      payload.enable_direct_install = false;
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

  function buildImportedCreativePayload(raw) {
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
      "enable_direct_install",
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

  function buildCreativeValidationPayload(payload, creativeName) {
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
      "enable_direct_install",
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
    return body;
  }

  function stripCreativePreviewIdentifiers(raw) {
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

  function synchronizeCreativeIdentityFields(raw, osp) {
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

  function replaceCreativePageReferences(node, sourcePageId, mappedPageId) {
    if (!node || !sourcePageId || !mappedPageId || sourcePageId === mappedPageId) {
      return node;
    }
    if (Array.isArray(node)) {
      node.forEach((item) => replaceCreativePageReferences(item, sourcePageId, mappedPageId));
      return node;
    }
    if (typeof node !== "object") {
      return node;
    }
    for (const [key, value] of Object.entries(node)) {
      if (
        (key === "page_id" || key === "pageId" || key === "pageID" || key === "source_page_id")
        && String(value) === sourcePageId
      ) {
        node[key] = mappedPageId;
        continue;
      }
      replaceCreativePageReferences(value, sourcePageId, mappedPageId);
    }
    return node;
  }

  function stripAssetFeedLabelIdsForImport(node, parentKey = "") {
    if (!node) {
      return node;
    }
    if (Array.isArray(node)) {
      node.forEach((item) => stripAssetFeedLabelIdsForImport(item, parentKey));
      return node;
    }
    if (typeof node !== "object") {
      return node;
    }
    if (
      parentKey === "adlabels"
      || (/_label$/.test(parentKey) && Object.prototype.hasOwnProperty.call(node, "name"))
    ) {
      delete node.id;
    }
    for (const [key, value] of Object.entries(node)) {
      stripAssetFeedLabelIdsForImport(value, key);
    }
    return node;
  }

  function materializePageMappedPackage(packageData, pageMappings) {
    if (!packageData || !pageMappings || !Object.keys(pageMappings).length) {
      return packageData;
    }
    const next = deepClone(packageData);
    for (const creative of (next.creatives || [])) {
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
    return next;
  }

  function replacePixelIdsInUrlTags(urlTags, pixelMappings) {
    let next = String(urlTags || "");
    for (const [sourceId, targetId] of Object.entries(pixelMappings || {})) {
      if (!sourceId || !targetId || sourceId === targetId) {
        continue;
      }
      next = next.split(String(sourceId)).join(String(targetId));
    }
    return next;
  }

  function materializePixelMappedPackage(packageData, pixelMappings) {
    if (!packageData || !pixelMappings || !Object.keys(pixelMappings).length) {
      return packageData;
    }
    const next = deepClone(packageData);
    for (const adset of (next.adsets || [])) {
      const pixelId = String(adset?.promoted_object?.pixel_id || "");
      if (pixelId && pixelMappings[pixelId]) {
        adset.promoted_object.pixel_id = pixelMappings[pixelId];
      }
    }
    for (const creative of (next.creatives || [])) {
      if (creative?.raw?.url_tags) {
        creative.raw.url_tags = replacePixelIdsInUrlTags(creative.raw.url_tags, pixelMappings);
      }
    }
    return next;
  }

  function getCreativeMediaSlots(creative) {
    const raw = creative.raw || {};
    const slots = [];
    const fnMap = state.importPackage?.fileNameMap;

    if (raw.asset_feed_spec) {
      const afs = raw.asset_feed_spec;
      if (Array.isArray(afs.images)) {
        afs.images.forEach((img, index) => {
          if (img.hash) {
            const hash = String(img.hash);
            const originalName = `${hash}.jpg`;
            slots.push({
              key: `${creative.id}:afs_image_${index}`,
              creativeId: creative.id,
              creativeName: creative.name,
              type: "image",
              expectedFileName: (fnMap && fnMap[originalName]) || originalName,
              sourceId: hash,
            });
          }
        });
      }
      if (Array.isArray(afs.videos)) {
        afs.videos.forEach((vid, index) => {
          if (vid.video_id) {
            const videoId = String(vid.video_id);
            const originalName = `${videoId}.mp4`;
            slots.push({
              key: `${creative.id}:afs_video_${index}`,
              creativeId: creative.id,
              creativeName: creative.name,
              type: "video",
              expectedFileName: (fnMap && fnMap[originalName]) || originalName,
              sourceId: videoId,
            });
            if (hasAssetFeedCustomVideoThumbnail(vid)) {
              const ext = extractMediaExtensionFromUrl(vid.thumbnail_url, ".jpg");
              const thumbOriginalName = getVideoThumbnailOriginalName(videoId, ext);
              slots.push({
                key: `${creative.id}:afs_video_thumb_${index}`,
                creativeId: creative.id,
                creativeName: creative.name,
                type: "image",
                expectedFileName: (fnMap && fnMap[thumbOriginalName]) || thumbOriginalName,
                sourceId: `${videoId}:preview`,
              });
            }
          }
        });
      }
    }

    const osp = raw.object_story_spec || {};
    if (raw.object_story_id) {
      return slots;
    }
    if (osp.video_data?.video_id) {
      const videoId = String(osp.video_data.video_id);
      const originalName = `${videoId}.mp4`;
      slots.push({
        key: `${creative.id}:video`,
        creativeId: creative.id,
        creativeName: creative.name,
        type: "video",
        expectedFileName: (fnMap && fnMap[originalName]) || originalName,
        sourceId: videoId,
      });
      if (hasStandaloneCustomVideoThumbnail(osp.video_data)) {
        const ext = extractMediaExtensionFromUrl(osp.video_data.image_url, ".jpg");
        const thumbOriginalName = getVideoThumbnailOriginalName(videoId, ext);
        slots.push({
          key: `${creative.id}:video_preview`,
          creativeId: creative.id,
          creativeName: creative.name,
          type: "image",
          expectedFileName: (fnMap && fnMap[thumbOriginalName]) || thumbOriginalName,
          sourceId: `${videoId}:preview`,
        });
      }
    } else if (osp.link_data?.image_hash) {
      const imageHash = String(osp.link_data.image_hash);
      const originalName = `${imageHash}.jpg`;
      slots.push({
        key: `${creative.id}:image`,
        creativeId: creative.id,
        creativeName: creative.name,
        type: "image",
        expectedFileName: (fnMap && fnMap[originalName]) || originalName,
        sourceId: imageHash,
      });
    }
    return slots;
  }

  function isCatalogTemplateCreative(raw) {
    const osp = raw?.object_story_spec || {};
    return Boolean(
      osp.template_data
      || raw?.template_url_spec
      || raw?.template_url
      || raw?.product_set_id
      || raw?.catalog_id
      || raw?.product_catalog_id
    );
  }

  function getSourcePagesFromPackage(packageData) {
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

  function getSourcePixelsFromPackage(packageData) {
    if (!packageData) return [];
    const pixels = new Map();
    for (const adset of packageData.adsets || []) {
      const pixelId = adset?.promoted_object?.pixel_id ? String(adset.promoted_object.pixel_id) : "";
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

  const CATALOG_ID_KEYS = new Set([
    "catalog_id",
    "product_catalog_id",
    "product_catalogID",
    "productCatalogId",
  ]);

  const PRODUCT_SET_ID_KEYS = new Set([
    "product_set_id",
    "product_set_ids",
    "productSetId",
    "productSetIds",
  ]);

  function addScalarIdRef(refs, value, meta = {}) {
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

  function collectCatalogRefs(node, refs, path = "", sourceName = "") {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach((item, index) => collectCatalogRefs(item, refs, `${path}[${index}]`, sourceName));
      return;
    }
    if (typeof node !== "object") {
      return;
    }
    for (const [key, value] of Object.entries(node)) {
      const nextPath = path ? `${path}.${key}` : key;
      if (CATALOG_ID_KEYS.has(key)) {
        addScalarIdRef(refs.catalogs, value, { path: nextPath, name: sourceName });
      }
      if (PRODUCT_SET_ID_KEYS.has(key)) {
        addScalarIdRef(refs.productSets, value, { path: nextPath, name: sourceName });
      }
      if (key === "product_catalog" && value && typeof value === "object") {
        addScalarIdRef(refs.catalogs, value.id, { path: `${nextPath}.id`, name: value.name || sourceName });
      }
      collectCatalogRefs(value, refs, nextPath, sourceName);
    }
  }

  function getCatalogRefsFromPackage(packageData) {
    const refs = {
      catalogs: new Map(),
      productSets: new Map(),
    };
    if (!packageData) return refs;
    collectCatalogRefs(packageData.campaign, refs, "campaign", packageData.campaign?.name || packageData.source?.campaignName || "");
    for (const adset of packageData.adsets || []) {
      collectCatalogRefs(adset, refs, `adset:${adset.id}`, adset.name || adset.id);
    }
    for (const creative of packageData.creatives || []) {
      collectCatalogRefs(creative.raw || creative, refs, `creative:${creative.id}`, creative.name || creative.id);
    }
    for (const catalog of packageData.catalogs || []) {
      addScalarIdRef(refs.catalogs, catalog.id, { path: "catalogs", name: catalog.name || catalog.id });
    }
    for (const catalogExport of packageData.catalogExports || []) {
      addScalarIdRef(refs.catalogs, catalogExport.catalog?.id || catalogExport.id, {
        path: "catalogExports.catalog.id",
        name: catalogExport.catalog?.name || catalogExport.name || catalogExport.id,
      });
      for (const productSet of catalogExport.productSets || []) {
        addScalarIdRef(refs.productSets, productSet.id, {
          path: "catalogExports.productSets",
          name: productSet.name || productSet.id,
        });
      }
    }
    for (const productSet of packageData.productSets || []) {
      addScalarIdRef(refs.productSets, productSet.id, { path: "productSets", name: productSet.name || productSet.id });
      if (productSet.product_catalog?.id) {
        addScalarIdRef(refs.catalogs, productSet.product_catalog.id, {
          path: "productSets.product_catalog.id",
          name: productSet.product_catalog.name || productSet.name || productSet.product_catalog.id,
        });
      }
      if (productSet.catalog_id) {
        addScalarIdRef(refs.catalogs, productSet.catalog_id, {
          path: "productSets.catalog_id",
          name: productSet.catalog_name || productSet.name || productSet.catalog_id,
        });
      }
    }
    return refs;
  }

  function getSourceCatalogsFromPackage(packageData) {
    const refs = getCatalogRefsFromPackage(packageData);
    return [...refs.catalogs.values()].map((ref) => ({
      id: ref.id,
      name: [...ref.names].filter(Boolean)[0] || `Catalog ${ref.id}`,
      paths: ref.paths,
    }));
  }

  function getSourceProductSetsFromPackage(packageData) {
    const refs = getCatalogRefsFromPackage(packageData);
    return [...refs.productSets.values()].map((ref) => ({
      id: ref.id,
      name:
        getPackageProductSetById(packageData, ref.id)?.name
        || [...ref.names].find((name) => !isSyntheticProductSetName(name))
        || [...ref.names].filter(Boolean)[0]
        || `Product set ${ref.id}`,
      paths: ref.paths,
    }));
  }

  function mergeEntityHintsById(...hintLists) {
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

  function replaceMappedCatalogReferences(node, catalogMappings, productSetMappings = {}) {
    if (
      !node
      || (
        (!catalogMappings || !Object.keys(catalogMappings).length)
        && (!productSetMappings || !Object.keys(productSetMappings).length)
      )
    ) {
      return node;
    }
    if (Array.isArray(node)) {
      node.forEach((item) => replaceMappedCatalogReferences(item, catalogMappings, productSetMappings));
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
          node[key] = value.map((item) => productSetMappings[String(item)] || item);
          continue;
        }
        const mapped = productSetMappings[String(value)];
        if (mapped) {
          node[key] = mapped;
          continue;
        }
      }
      if (key === "product_catalog" && value && typeof value === "object" && value.id) {
        const mapped = catalogMappings[String(value.id)];
        if (mapped) {
          value.id = mapped;
        }
      }
      replaceMappedCatalogReferences(value, catalogMappings, productSetMappings);
    }
    return node;
  }

  function materializeCatalogMappedPackage(packageData, catalogMappings, productSetMappings = {}) {
    if (
      !packageData
      || (
        (!catalogMappings || !Object.keys(catalogMappings).length)
        && (!productSetMappings || !Object.keys(productSetMappings).length)
      )
    ) {
      return packageData;
    }
    const next = deepClone(packageData);
    replaceMappedCatalogReferences(next, catalogMappings, productSetMappings);
    return next;
  }

  function getMediaSlotsFromPackage(packageData) {
    if (!packageData) return [];
    const creativeIdToAdName = new Map();
    for (const ad of (packageData.ads || [])) {
      const cid = String(ad?.creative?.id);
      if (cid && !creativeIdToAdName.has(cid)) {
        creativeIdToAdName.set(cid, ad.name || ad.id);
      }
    }
    const previousPackage = state.importPackage;
    state.importPackage = packageData;
    const allSlots = (packageData.creatives || []).flatMap(getCreativeMediaSlots);
    state.importPackage = previousPackage;
    const seen = new Map();
    const unique = [];
    for (const slot of allSlots) {
      if (seen.has(slot.sourceId)) {
        continue;
      }
      seen.set(slot.sourceId, true);
      const adName = creativeIdToAdName.get(slot.creativeId) || slot.creativeName || slot.creativeId;
      unique.push({ ...slot, creativeName: adName });
    }
    return unique;
  }

  function getImportSourcePages() {
    return getSourcePagesFromPackage(state.importPackage);
  }

  function getImportSourcePixels() {
    return getSourcePixelsFromPackage(state.importPackage);
  }

  function getImportMediaSlots() {
    return getMediaSlotsFromPackage(state.importPackage);
  }

  function getSharedMediaOverrideKey(expectedFileName) {
    return `expected:${String(expectedFileName || "")}`;
  }

  function getDefaultMediaFile(slot, mediaOverrides = state.importMediaOverrides, mediaFiles = state.importMediaFiles) {
    return mediaOverrides.get(slot.key)
      || mediaOverrides.get(getSharedMediaOverrideKey(slot.expectedFileName))
      || mediaFiles.get(slot.expectedFileName)
      || null;
  }

  function renderPackageSummary(packageData) {
    if (!packageData) {
      return "";
    }
    return `
      <div class="sk-mapping-block">
        <div class="sk-subtitle">Package</div>
        <div class="sk-summary-grid">
          <div><span>Campaign</span><strong>${escapeHtml(packageData.source.campaignName || packageData.campaign?.name || "-")}</strong></div>
          <div><span>Adsets</span><strong>${escapeHtml(packageData.adsets.length)}</strong></div>
          <div><span>Creatives</span><strong>${escapeHtml(packageData.creatives.length)}</strong></div>
        </div>
      </div>
    `;
  }

  function renderCloneCampaignSummary(packageData) {
    if (!packageData) {
      return "";
    }
    return `
      <div class="sk-note sk-clone-summary">
        Adsets: <strong>${escapeHtml(packageData.adsets.length)}</strong>
        &nbsp;|&nbsp;
        Creatives: <strong>${escapeHtml(packageData.creatives.length)}</strong>
      </div>
    `;
  }

  function buildDefaultCloneCampaignName(sourceName) {
    const normalized = String(sourceName || "").trim();
    return normalized ? `${normalized} (Clone)` : "";
  }

  function buildDefaultCloneCatalogName(sourceCatalog) {
    const sourceName = sourceCatalog?.name || (sourceCatalog?.id ? `Catalog ${sourceCatalog.id}` : "Catalog");
    return buildDefaultCloneCampaignName(sourceName) || "Catalog (Clone)";
  }

  function parseGraphError(error) {
    if (!error) return null;
    if (typeof error === "object" && (error.error || error.message || error.code)) {
      return error.error || error;
    }
    try {
      return JSON.parse(String(error).replace(/^Error:\s*/, ""));
    } catch (_parseError) {
      return null;
    }
  }

  function getGraphErrorSubcode(error) {
    const parsed = parseGraphError(error);
    return Number(parsed?.error_subcode || parsed?.error?.error_subcode || 0);
  }

  function isDirectAdCreativeGateError(error) {
    const parsed = parseGraphError(error);
    const code = Number(parsed?.code || parsed?.error?.code || 0);
    const haystack = JSON.stringify(parsed || error || "");
    return code === 3 && /neko_direct_api_enable/i.test(haystack);
  }

  function isVideoNotReadyError(error) {
    const parsed = parseGraphError(error);
    const haystack = JSON.stringify(parsed || error || "");
    return getGraphErrorSubcode(error) === 1885252
      || /video not ready for use in an ad|video is still being processed/i.test(haystack);
  }

  function creativePayloadHasVideo(payload) {
    if (!payload || typeof payload !== "object") {
      return false;
    }
    if (payload.object_story_spec?.video_data?.video_id) {
      return true;
    }
    return Array.isArray(payload.asset_feed_spec?.videos)
      && payload.asset_feed_spec.videos.some((item) => item?.video_id);
  }

  function getAccountIdFromGraphPath(pathOrUrl) {
    const text = String(pathOrUrl || "");
    const match = text.match(/act_(\d{6,})/);
    return match?.[1] || "";
  }

  function getGraphRuntimeTemplate(accountId) {
    const normalizedAccountId = String(accountId || "").replace(/^act_/, "");
    if (
      state.graphTemplateParams
      && state.graphTemplateAccountId === normalizedAccountId
    ) {
      return state.graphTemplateParams;
    }

    const resourceUrls = performance.getEntriesByType("resource")
      .map((entry) => entry?.name || "")
      .filter((name) => name.includes("adsmanager-graph.facebook.com"))
      .reverse();

    const parsedUrls = resourceUrls.map((name) => {
      try {
        return new URL(name);
      } catch (_error) {
        return null;
      }
    }).filter(Boolean);

    const matched = parsedUrls.find((url) =>
      !normalizedAccountId
      || String(url.searchParams.get("__aaid") || "").replace(/^act_/, "") === normalizedAccountId,
    ) || parsedUrls[0];

    if (!matched) {
      return null;
    }

    const template = {
      __aaid: matched.searchParams.get("__aaid") || normalizedAccountId,
      _sessionID: matched.searchParams.get("_sessionID") || "",
      ads_manager_write_regions: matched.searchParams.get("ads_manager_write_regions") || "",
      include_headers: matched.searchParams.get("include_headers") || "",
      pretty: matched.searchParams.get("pretty") || "0",
      suppress_http_code: matched.searchParams.get("suppress_http_code") || "1",
    };

    state.graphTemplateAccountId = normalizedAccountId;
    state.graphTemplateParams = template;
    return template;
  }

  function applyGraphRuntimeTemplate(url, method, accountId) {
    const template = getGraphRuntimeTemplate(accountId);
    if (!template) {
      url.searchParams.set("method", String(method || "GET").toLowerCase());
      url.searchParams.set("suppress_http_code", "1");
      url.searchParams.set("pretty", "0");
      return;
    }

    if (template.__aaid && !url.searchParams.has("__aaid")) {
      url.searchParams.set("__aaid", template.__aaid);
    }
    if (template._sessionID && !url.searchParams.has("_sessionID")) {
      url.searchParams.set("_sessionID", template._sessionID);
    }

    for (const key of ["ads_manager_write_regions", "include_headers"]) {
      if (template[key] && !url.searchParams.has(key)) {
        url.searchParams.set(key, template[key]);
      }
    }

    url.searchParams.set("method", String(method || "GET").toLowerCase());
    if (!url.searchParams.has("suppress_http_code")) {
      url.searchParams.set("suppress_http_code", template.suppress_http_code || "1");
    }
    if (!url.searchParams.has("pretty")) {
      url.searchParams.set("pretty", template.pretty || "0");
    }
  }

  function renderCampaignOptionsList(campaigns, selectedId, emptyText = "Select account first") {
    if (!campaigns.length) {
      return `<option value="">${escapeHtml(emptyText)}</option>`;
    }
    const options = [`<option value="">Select campaign</option>`];
    for (const campaign of campaigns) {
      options.push(
        `<option value="${escapeHtml(campaign.id)}" ${campaign.id === selectedId ? "selected" : ""}>${escapeHtml(campaign.name || campaign.id)}</option>`,
      );
    }
    return options.join("");
  }

  function renderMappingsPanel({
    packageData,
    pages,
    pixels,
    catalogs,
    targetBusiness,
    pageMappings,
    pixelMappings,
    catalogMappings,
    mediaOverrides,
    mediaFiles,
    allowMediaOverrides,
    showPackageSection = true,
    showMediaSection = true,
    emptyMessage,
    pageAction,
    pixelAction,
    catalogAction,
    mediaAction,
    mediaSubtitle,
    mediaEmptyText,
  }) {
    if (!packageData) {
      return `<div class="sk-empty">${escapeHtml(emptyMessage)}</div>`;
    }

    const sourcePages = getSourcePagesFromPackage(packageData);
    const sourcePixels = getSourcePixelsFromPackage(packageData);
    const sourceCatalogs = getSourceCatalogsFromPackage(packageData);
    const sourceProductSets = getSourceProductSetsFromPackage(packageData);
    const mediaSlots = getMediaSlotsFromPackage(packageData);

    const pageRows = sourcePages.map((page) => {
      const selected = pageMappings[page.id] || page.id;
      const options = [`<option value="">Not selected</option>`]
        .concat((pages || []).map((item) => (
          `<option value="${escapeHtml(item.id)}" ${item.id === selected ? "selected" : ""}>${escapeHtml(item.name)} (${escapeHtml(item.id)})</option>`
        )))
        .join("");
      return `
        <label class="sk-field">
          <span>Source Fan Page: ${escapeHtml(page.name)} (${escapeHtml(page.id)})</span>
          <select data-action="${escapeHtml(pageAction)}" data-source-page-id="${escapeHtml(page.id)}">
            ${options}
          </select>
        </label>
      `;
    }).join("");

    const pixelRows = sourcePixels.map((pixel) => {
      const current = pixelMappings[pixel.id]
        || ((pixels || []).some((item) => item.id === pixel.id) ? pixel.id : "__create__");
      const options = [`<option value="__create__">Create new pixel</option>`]
        .concat((pixels || []).map((item) => (
          `<option value="${escapeHtml(item.id)}" ${item.id === current ? "selected" : ""}>${escapeHtml(item.name || item.id)} (${escapeHtml(item.id)})</option>`
        )))
        .join("");
      return `
        <label class="sk-field">
          <span>Source Pixel: ${escapeHtml(pixel.id)}</span>
          <select data-action="${escapeHtml(pixelAction)}" data-source-pixel-id="${escapeHtml(pixel.id)}">
            ${options}
          </select>
        </label>
      `;
    }).join("");

    const catalogRows = sourceCatalogs.map((catalog) => {
      const current = catalogMappings[catalog.id]
        || ((catalogs || []).some((item) => item.id === catalog.id) ? catalog.id : "");
      const options = [`<option value="">Not selected</option>`]
        .concat(targetBusiness?.id ? [`<option value="__copy__" ${current === "__copy__" ? "selected" : ""}>Copy to target BM</option>`] : [])
        .concat((catalogs || []).map((item) => (
          `<option value="${escapeHtml(item.id)}" ${item.id === current ? "selected" : ""}>${escapeHtml(item.name || item.id)} (${escapeHtml(item.id)})</option>`
        )))
        .join("");
      return `
        <label class="sk-field">
          <span>Source Catalog: ${escapeHtml(catalog.name)} (${escapeHtml(catalog.id)})</span>
          <select data-action="${escapeHtml(catalogAction)}" data-source-catalog-id="${escapeHtml(catalog.id)}">
            ${options}
          </select>
        </label>
      `;
    }).join("");

    const catalogWarning = sourceCatalogs.length
      ? targetBusiness?.id
        ? `<div class="sk-note sk-warning">
            Catalog campaign detected for target BM ${escapeHtml(targetBusiness.name || targetBusiness.id)}.
            Select the same visible catalog, copy into a visible target catalog, or choose "Copy to target BM" to create/copy catalog settings when Meta permissions allow it.
            ${sourceProductSets.length ? `Product sets detected: ${escapeHtml(sourceProductSets.map((item) => item.id).join(", "))}.` : ""}
          </div>`
        : (catalogs || []).length
          ? `<div class="sk-note sk-warning">
              Catalog campaign detected. The target ad account has no visible Business Manager on its ad account object,
              but Meta exposes ${escapeHtml(String((catalogs || []).length))} eligible target catalog(s) for this ad account.
              You can map into one of those existing target catalogs, but "Copy to target BM" is unavailable without visible BM access.
              ${sourceProductSets.length ? `Product sets detected: ${escapeHtml(sourceProductSets.map((item) => item.id).join(", "))}.` : ""}
            </div>`
          : `<div class="sk-note sk-warning">
              Catalog campaign detected, but the target ad account has no visible Business Manager on its ad account object
              and Meta does not expose any eligible target catalogs for this ad account.
              Catalog campaigns cannot be cloned/imported here until Meta exposes a reusable target catalog or you choose a BM-owned or BM-assigned target ad account.
            </div>`
      : "";

    const mediaRows = mediaSlots.map((slot) => {
      const file = getDefaultMediaFile(slot, mediaOverrides, mediaFiles);
      const typeBadge = slot.type === "video" ? "VIDEO" : "IMAGE";
      if (!allowMediaOverrides) {
        return `
          <div class="sk-creative-row">
            <div class="sk-creative-info">
              <div class="sk-creative-name">
                <span class="sk-badge sk-badge-${escapeHtml(slot.type)}">${typeBadge}</span>
                ${escapeHtml(slot.creativeName || slot.creativeId)}
              </div>
              <div class="sk-creative-file">${escapeHtml(file ? file.name : slot.expectedFileName)}</div>
            </div>
          </div>
        `;
      }
      return `
        <div class="sk-creative-row">
          <div class="sk-creative-info">
            <div class="sk-creative-name">
              <span class="sk-badge sk-badge-${escapeHtml(slot.type)}">${typeBadge}</span>
              ${escapeHtml(slot.expectedFileName)}
            </div>
            <div class="sk-creative-file">${escapeHtml(slot.creativeName || slot.creativeId)}</div>
            <div class="sk-creative-status">${escapeHtml(file ? `Selected: ${file.name}` : "Awaiting file selection")}</div>
          </div>
          <label class="sk-file-trigger">
            <span>Choose file</span>
            <input class="sk-file-input" type="file"
              data-action="${escapeHtml(mediaAction)}"
              data-media-key="${escapeHtml(slot.key)}"
              data-expected-file="${escapeHtml(slot.expectedFileName)}"
              accept="${slot.type === "video" ? "video/*" : "image/*"}" />
          </label>
        </div>
      `;
    }).join("");

    return `
      ${showPackageSection ? renderPackageSummary(packageData) : ""}
      <div class="sk-mapping-block">
        <div class="sk-subtitle">Fan Page</div>
        ${pageRows || `<div class="sk-empty">No page-based creatives.</div>`}
      </div>
      <div class="sk-mapping-block">
        <div class="sk-subtitle">Pixels</div>
        ${pixelRows || `<div class="sk-empty">No pixel-based adsets.</div>`}
      </div>
      ${sourceCatalogs.length ? `
      <div class="sk-mapping-block">
        <div class="sk-subtitle">Catalogs</div>
        ${catalogWarning}
        ${catalogRows || `<div class="sk-empty">No catalog references.</div>`}
      </div>` : ""}
      ${showMediaSection ? `
      <div class="sk-mapping-block">
        <div class="sk-subtitle">${escapeHtml(mediaSubtitle)}</div>
        ${mediaRows || `<div class="sk-empty">${escapeHtml(mediaEmptyText)}</div>`}
      </div>` : ""}
    `;
  }

  function renderStatus() {
    if (!dom.status) return;
    const pieces = [];
    if (state.loadingSession) {
      pieces.push("Looking for access_token...");
    } else if (state.sessionReady) {
      pieces.push("Session ready");
    } else {
      pieces.push("Session not loaded");
    }
    if (state.busy) {
      pieces.push("operation in progress");
    }
    dom.status.textContent = pieces.join(" / ");
  }

  function renderButtons() {
    if (!dom.root) return;
    dom.root.querySelectorAll("[data-role='busy-lock']").forEach((element) => {
      element.disabled = state.busy || state.loadingSession;
    });
    if (dom.initButton) {
      dom.initButton.disabled = state.busy || state.loadingSession;
    }
  }

  function renderLogs() {
    if (!dom.logs) return;
    const text = state.logs.map((entry) => {
      const time = entry.createdAt.slice(11, 19);
      const lvl = entry.level.toUpperCase().padEnd(5);
      let line = `[${time}] ${lvl} ${entry.message}`;
      if (entry.details) {
        const d = typeof entry.details === "string"
          ? entry.details
          : JSON.stringify(entry.details, null, 2);
        line += `\n${d}`;
      }
      return line;
    }).join("\n");
    dom.logs.value = text;
    dom.logs.scrollTop = dom.logs.scrollHeight;
  }

  function renderAccountOptions(selectedId) {
    if (!state.accounts.length) {
      return `<option value="">Load session first</option>`;
    }
    const options = [`<option value="">Select account</option>`];
    for (const account of state.accounts) {
      options.push(
        `<option value="${escapeHtml(account.id)}" ${account.id === selectedId ? "selected" : ""}>${escapeHtml(getAccountLabel(account))}</option>`,
      );
    }
    return options.join("");
  }

  function renderCampaignOptions() {
    return renderCampaignOptionsList(state.exportCampaigns, state.exportCampaignId);
  }

  function renderCloneSourceCampaignOptions() {
    return renderCampaignOptionsList(state.cloneSourceCampaigns, state.cloneSourceCampaignId);
  }

  function renderSectionLoading(message) {
    return `
      <div class="sk-inline-loading">
        <div class="sk-inline-spinner"></div>
        <div>${escapeHtml(message)}</div>
      </div>
    `;
  }

  function renderImportMappings() {
    if (!dom.importMappings) return;
    dom.importMappings.innerHTML = renderMappingsPanel({
      packageData: state.importPackage,
      pages: state.pages,
      pixels: state.importAccountPixels,
      catalogs: state.importTargetCatalogs,
      targetBusiness: state.importTargetBusiness,
      pageMappings: state.importPageMappings,
      pixelMappings: state.importPixelMappings,
      catalogMappings: state.importCatalogMappings,
      mediaOverrides: state.importMediaOverrides,
      mediaFiles: state.importMediaFiles,
      allowMediaOverrides: true,
      showPackageSection: true,
      showMediaSection: true,
      emptyMessage: "Load an export JSON file.",
      pageAction: "page-map",
      pixelAction: "pixel-map",
      catalogAction: "catalog-map",
      mediaAction: "media-override",
      mediaSubtitle: "Creatives — Media Files",
      mediaEmptyText: "No creatives with media files.",
    });
  }

  function renderCloneMappings() {
    if (!dom.cloneMappings) return;
    if (state.clonePackageLoading) {
      dom.cloneMappings.innerHTML = renderSectionLoading("Loading source campaign structure, pages, pixels, and mappings...");
      if (dom.clonePackageSummary) {
        dom.clonePackageSummary.innerHTML = renderSectionLoading("Loading source campaign package...");
      }
      return;
    }
    dom.cloneMappings.innerHTML = renderMappingsPanel({
      packageData: state.clonePackage,
      pages: state.clonePages,
      pixels: state.cloneTargetPixels,
      catalogs: state.cloneTargetCatalogs,
      targetBusiness: state.cloneTargetBusiness,
      pageMappings: state.clonePageMappings,
      pixelMappings: state.clonePixelMappings,
      catalogMappings: state.cloneCatalogMappings,
      mediaOverrides: new Map(),
      mediaFiles: new Map(),
      allowMediaOverrides: false,
      showPackageSection: false,
      showMediaSection: false,
      emptyMessage: "Select source account, campaign, and target account.",
      pageAction: "clone-page-map",
      pixelAction: "clone-pixel-map",
      catalogAction: "clone-catalog-map",
      mediaAction: "clone-media-readonly",
      mediaSubtitle: "Creatives — Media Files",
      mediaEmptyText: "Media will be copied automatically from source.",
    }) + renderManualCloneCatalogSelector();
    if (dom.clonePackageSummary) {
      dom.clonePackageSummary.innerHTML = state.clonePackage
        ? renderCloneCampaignSummary(state.clonePackage)
        : "";
    }
  }

  function renderManualCloneCatalogSelector() {
    if (!state.clonePackage || getSourceCatalogsFromPackage(state.clonePackage).length) {
      return "";
    }
    if (!state.cloneSourceCatalogs.length) {
      return "";
    }
    const sourceOptions = [`<option value="">No manual source catalog</option>`]
      .concat(state.cloneSourceCatalogs.map((item) => (
        `<option value="${escapeHtml(item.id)}" ${item.id === state.cloneManualSourceCatalogId ? "selected" : ""}>${escapeHtml(item.name || item.id)} (${escapeHtml(item.id)})</option>`
      )))
      .join("");
    const mapped = state.cloneManualSourceCatalogId
      ? (state.cloneCatalogMappings[state.cloneManualSourceCatalogId] || "__copy__")
      : "";
    const targetOptions = [`<option value="">Not selected</option>`]
      .concat(state.cloneTargetBusiness?.id ? [`<option value="__copy__" ${mapped === "__copy__" ? "selected" : ""}>Copy to target BM</option>`] : [])
      .concat(state.cloneTargetCatalogs.map((item) => (
        `<option value="${escapeHtml(item.id)}" ${item.id === mapped ? "selected" : ""}>${escapeHtml(item.name || item.id)} (${escapeHtml(item.id)})</option>`
      )))
      .join("");
    return `
      <div class="sk-mapping-block">
        <div class="sk-subtitle">Catalogs</div>
        <div class="sk-note sk-warning">
          No catalog IDs were exposed by Graph export. Select the source catalog manually if this is a catalog ad.
        </div>
        <label class="sk-field">
          <span>Manual Source Catalog</span>
          <select data-action="clone-manual-source-catalog">
            ${sourceOptions}
          </select>
        </label>
        ${state.cloneManualSourceCatalogId ? `
        <label class="sk-field">
          <span>Target Catalog</span>
          <select data-action="clone-catalog-map" data-source-catalog-id="${escapeHtml(state.cloneManualSourceCatalogId)}">
            ${targetOptions}
          </select>
        </label>` : ""}
      </div>
    `;
  }

  function renderUI() {
    if (!state.uiReady) return;
    if (dom.loadingOverlay) {
      dom.loadingOverlay.style.display = (state.sessionReady && !state.loadingSession) ? "none" : "flex";
    }
    if (dom.exportAccountSelect) {
      dom.exportAccountSelect.innerHTML = renderAccountOptions(state.exportAccountId);
    }
    if (dom.importAccountSelect) {
      dom.importAccountSelect.innerHTML = renderAccountOptions(state.importAccountId);
    }
    if (dom.exportCampaignSelect) {
      dom.exportCampaignSelect.innerHTML = renderCampaignOptions();
    }
    if (dom.importModeSelect) {
      dom.importModeSelect.innerHTML = getModeOptionsMarkup(importRequiresDraftOnly());
      dom.importModeSelect.disabled = importRequiresDraftOnly();
      dom.importModeSelect.value = state.importAsDraft ? "DRAFT" : state.importStatus;
    }
    if (dom.cloneSourceAccountSelect) {
      dom.cloneSourceAccountSelect.innerHTML = renderAccountOptions(state.cloneSourceAccountId);
    }
    if (dom.cloneSourceCampaignSelect) {
      dom.cloneSourceCampaignSelect.innerHTML = renderCloneSourceCampaignOptions();
    }
    if (dom.cloneTargetAccountSelect) {
      dom.cloneTargetAccountSelect.innerHTML = renderAccountOptions(state.cloneTargetAccountId);
    }
    if (dom.cloneModeSelect) {
      dom.cloneModeSelect.innerHTML = getModeOptionsMarkup(cloneRequiresDraftOnly());
      dom.cloneModeSelect.disabled = cloneRequiresDraftOnly();
      dom.cloneModeSelect.value = state.cloneAsDraft ? "DRAFT" : state.cloneStatus;
    }
    if (dom.cloneCampaignName && dom.cloneCampaignName.value !== state.cloneCampaignName) {
      dom.cloneCampaignName.value = state.cloneCampaignName;
    }
    renderButtons();
    renderLogs();
    renderImportMappings();
    renderCloneMappings();
  }

  function mount() {
    injectStyles();

    const root = document.createElement("div");
    root.id = APP_ID;
    root.innerHTML = `
      <div class="sk-shell">
        <div class="sk-loading-overlay" id="${APP_ID}-loading">
          <div class="sk-spinner"></div>
        </div>
        <div class="sk-head">
          <div>
            <div class="sk-title-row">${APP_MARK_SVG}<h2>${APP_TITLE} <span class="sk-build">build ${Config.VERSION}</span></h2></div>
            <a class="sk-byline" href="https://yellowweb.top" target="_blank">by Yellow Web</a>
          </div>
          <button id="${APP_ID}-close" class="sk-close" title="Close">&#x2715;</button>
        </div>

        <div class="sk-tabs">
          <button class="sk-tab sk-tab-active" data-tab="export">Export</button>
          <button class="sk-tab" data-tab="import">Import</button>
          <button class="sk-tab" data-tab="clone">Clone</button>
        </div>

        <div class="sk-tab-panel" id="${APP_ID}-panel-export">
          <section class="sk-card">
            <label class="sk-field">
              <span>Account</span>
              <select id="${APP_ID}-export-account"></select>
            </label>
            <label class="sk-field">
              <span>Campaign</span>
              <select id="${APP_ID}-export-campaign"></select>
            </label>
            <div class="sk-actions">
              <button data-role="busy-lock" id="${APP_ID}-export">Export</button>
            </div>
            <p class="sk-note">Export saves JSON and media files.</p>
          </section>
        </div>

        <div class="sk-tab-panel sk-hidden" id="${APP_ID}-panel-import">
          <section class="sk-card">
            <label class="sk-field">
              <span>Account</span>
              <select id="${APP_ID}-import-account"></select>
            </label>
            <label class="sk-field">
              <span>Export JSON file</span>
              <input type="file" id="${APP_ID}-import-json" accept=".json,application/json" />
            </label>
            <label class="sk-field">
              <span>Campaign name</span>
              <input type="text" id="${APP_ID}-import-campaign-name" placeholder="Will use original name if empty" />
            </label>
            <label class="sk-field">
              <span>Import mode</span>
              <select id="${APP_ID}-import-mode">
                <option value="DRAFT">DRAFT</option>
                <option value="ACTIVE">ACTIVE</option>
                <option value="PAUSED" selected>PAUSED</option>
              </select>
            </label>
            <div id="${APP_ID}-import-mappings"></div>
            <div class="sk-actions">
              <button data-role="busy-lock" id="${APP_ID}-import">Import</button>
            </div>
          </section>
        </div>

        <div class="sk-tab-panel sk-hidden" id="${APP_ID}-panel-clone">
          <section class="sk-card">
            <label class="sk-field">
              <span>Source Account</span>
              <select id="${APP_ID}-clone-source-account"></select>
            </label>
            <label class="sk-field">
              <span>Source Campaign</span>
              <select id="${APP_ID}-clone-source-campaign"></select>
            </label>
            <div id="${APP_ID}-clone-package-summary"></div>
            <label class="sk-field">
              <span>Target Account</span>
              <select id="${APP_ID}-clone-target-account"></select>
            </label>
            <label class="sk-field">
              <span>Campaign name</span>
              <input type="text" id="${APP_ID}-clone-campaign-name" placeholder="Will use source campaign name if empty" />
            </label>
            <label class="sk-field">
              <span>Clone mode</span>
              <select id="${APP_ID}-clone-mode">
                <option value="DRAFT">DRAFT</option>
                <option value="ACTIVE">ACTIVE</option>
                <option value="PAUSED" selected>PAUSED</option>
              </select>
            </label>
            <div id="${APP_ID}-clone-mappings"></div>
            <div class="sk-actions">
              <button data-role="busy-lock" id="${APP_ID}-clone">Clone</button>
            </div>
            <p class="sk-note">Clone copies JSON structure and source media directly in memory, without saving files to disk.</p>
          </section>
        </div>

        <details class="sk-logs">
          <summary>Log</summary>
          <textarea id="${APP_ID}-logs" class="sk-log-area" readonly></textarea>
        </details>

      </div>
    `;

    document.body.appendChild(root);

    dom.root = root;
    dom.loadingOverlay = root.querySelector(`#${APP_ID}-loading`);
    dom.exportAccountSelect = root.querySelector(`#${APP_ID}-export-account`);
    dom.importAccountSelect = root.querySelector(`#${APP_ID}-import-account`);
    dom.exportCampaignSelect = root.querySelector(`#${APP_ID}-export-campaign`);
    dom.importMappings = root.querySelector(`#${APP_ID}-import-mappings`);
    dom.importCampaignName = root.querySelector(`#${APP_ID}-import-campaign-name`);
    dom.importModeSelect = root.querySelector(`#${APP_ID}-import-mode`);
    dom.cloneSourceAccountSelect = root.querySelector(`#${APP_ID}-clone-source-account`);
    dom.cloneSourceCampaignSelect = root.querySelector(`#${APP_ID}-clone-source-campaign`);
    dom.clonePackageSummary = root.querySelector(`#${APP_ID}-clone-package-summary`);
    dom.cloneTargetAccountSelect = root.querySelector(`#${APP_ID}-clone-target-account`);
    dom.cloneCampaignName = root.querySelector(`#${APP_ID}-clone-campaign-name`);
    dom.cloneModeSelect = root.querySelector(`#${APP_ID}-clone-mode`);
    dom.cloneMappings = root.querySelector(`#${APP_ID}-clone-mappings`);
    dom.logs = root.querySelector(`#${APP_ID}-logs`);

    root.querySelector(`#${APP_ID}-close`).addEventListener("click", destroy);
    root.querySelectorAll(".sk-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        root.querySelectorAll(".sk-tab").forEach((t) => t.classList.remove("sk-tab-active"));
        root.querySelectorAll(".sk-tab-panel").forEach((p) => p.classList.add("sk-hidden"));
        btn.classList.add("sk-tab-active");
        root.querySelector(`#${APP_ID}-panel-${btn.dataset.tab}`).classList.remove("sk-hidden");
      });
    });
    root.querySelector(`#${APP_ID}-export`).addEventListener("click", exportSelectedCampaign);
    root.querySelector(`#${APP_ID}-import`).addEventListener("click", importPackage);
    root.querySelector(`#${APP_ID}-clone`).addEventListener("click", cloneCampaignToAccount);
    dom.exportAccountSelect.addEventListener("change", async (event) => {
      state.exportAccountId = event.target.value;
      state.exportCampaignId = "";
      state.exportCampaigns = [];
      renderUI();
      if (state.exportAccountId) {
        await loadExportCampaigns();
      }
    });
    dom.importAccountSelect.addEventListener("change", async (event) => {
      state.importAccountId = event.target.value;
      await refreshImportAccountContext();
      renderUI();
    });
    dom.exportCampaignSelect.addEventListener("change", (event) => {
      state.exportCampaignId = event.target.value;
      renderButtons();
    });
    root.querySelector(`#${APP_ID}-import-json`).addEventListener("change", handleImportJsonSelected);
    dom.importCampaignName.addEventListener("input", (event) => {
      state.importCampaignName = event.target.value;
    });
    dom.importModeSelect.addEventListener("change", (event) => {
      const val = event.target.value;
      if (importRequiresDraftOnly()) {
        state.importAsDraft = true;
        state.importStatus = "PAUSED";
        renderUI();
        return;
      }
      state.importAsDraft = val === "DRAFT";
      state.importStatus = val === "DRAFT" ? "PAUSED" : val;
    });
    dom.cloneSourceAccountSelect.addEventListener("change", async (event) => {
      state.cloneSourceAccountId = event.target.value;
      state.cloneSourceCampaignId = "";
      state.cloneSourceCampaigns = [];
      state.clonePackage = null;
      state.clonePackageLoading = false;
      state.clonePageMappings = {};
      state.clonePixelMappings = {};
      state.cloneCatalogMappings = {};
      state.cloneManualSourceCatalogId = "";
      state.cloneSourceBusiness = null;
      state.cloneSourceCatalogs = [];
      renderUI();
      if (state.cloneSourceAccountId) {
        await loadCloneSourceCampaigns();
        await refreshCloneSourceContext();
      }
    });
    dom.cloneSourceCampaignSelect.addEventListener("change", async (event) => {
      state.cloneSourceCampaignId = event.target.value;
      state.clonePackage = null;
      state.cloneCatalogMappings = {};
      state.cloneManualSourceCatalogId = "";
      state.clonePackageLoading = Boolean(state.cloneSourceCampaignId);
      renderUI();
      if (state.cloneSourceCampaignId) {
        await ensureClonePackageLoaded();
      } else {
        state.clonePackageLoading = false;
        renderUI();
      }
    });
    dom.cloneTargetAccountSelect.addEventListener("change", async (event) => {
      state.cloneTargetAccountId = event.target.value;
      await refreshCloneTargetContext();
      renderUI();
    });
    dom.cloneCampaignName.addEventListener("input", (event) => {
      state.cloneCampaignName = event.target.value;
    });
    dom.cloneModeSelect.addEventListener("change", (event) => {
      const val = event.target.value;
      if (cloneRequiresDraftOnly()) {
        state.cloneAsDraft = true;
        state.cloneStatus = "PAUSED";
        renderUI();
        return;
      }
      state.cloneAsDraft = val === "DRAFT";
      state.cloneStatus = val === "DRAFT" ? "PAUSED" : val;
    });
    dom.importMappings.addEventListener("change", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
      let shouldRerender = true;
      if (target.dataset.action === "page-map") {
        state.importPageMappings[target.dataset.sourcePageId] = target.value;
      }
      if (target.dataset.action === "pixel-map") {
        state.importPixelMappings[target.dataset.sourcePixelId] = target.value;
      }
      if (target.dataset.action === "catalog-map") {
        state.importCatalogMappings[target.dataset.sourceCatalogId] = target.value;
      }
      if (target.dataset.action === "media-override" && target instanceof HTMLInputElement) {
        const file = target.files && target.files[0] ? target.files[0] : null;
        const expectedFile = String(target.dataset.expectedFile || "");
        const sharedKey = getSharedMediaOverrideKey(target.dataset.expectedFile || "");
        if (file) {
          state.importMediaOverrides.set(target.dataset.mediaKey, file);
          if (sharedKey !== getSharedMediaOverrideKey("")) {
            state.importMediaOverrides.set(sharedKey, file);
          }
          if (expectedFile) {
            state.importMediaFiles.set(expectedFile, file);
          }
          log("info", `Selected replacement media: ${file.name}`);
        } else {
          state.importMediaOverrides.delete(target.dataset.mediaKey);
          if (sharedKey !== getSharedMediaOverrideKey("")) {
            state.importMediaOverrides.delete(sharedKey);
          }
          if (expectedFile) {
            state.importMediaFiles.delete(expectedFile);
          }
        }
        const row = target.closest(".sk-creative-row");
        const statusNode = row?.querySelector(".sk-creative-status");
        if (statusNode) {
          statusNode.textContent = file ? `Selected: ${file.name}` : "Awaiting file selection";
        }
        shouldRerender = false;
      }
      if (shouldRerender) {
        renderImportMappings();
      }
    });
    dom.cloneMappings.addEventListener("change", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
      if (target.dataset.action === "clone-page-map") {
        state.clonePageMappings[target.dataset.sourcePageId] = target.value;
      }
      if (target.dataset.action === "clone-pixel-map") {
        state.clonePixelMappings[target.dataset.sourcePixelId] = target.value;
      }
      if (target.dataset.action === "clone-manual-source-catalog") {
        if (state.cloneManualSourceCatalogId) {
          delete state.cloneCatalogMappings[state.cloneManualSourceCatalogId];
        }
        state.cloneManualSourceCatalogId = target.value;
        if (state.cloneManualSourceCatalogId) {
          state.cloneCatalogMappings[state.cloneManualSourceCatalogId] = state.cloneTargetBusiness?.id ? "__copy__" : "";
        }
      }
      if (target.dataset.action === "clone-catalog-map") {
        state.cloneCatalogMappings[target.dataset.sourceCatalogId] = target.value;
      }
      renderCloneMappings();
    });

    state.uiReady = true;
    renderUI();
    log("info", "UI ready. Connecting session...");
    if (!window.__ADREPLICA_QA_SUPPRESS_AUTO_INIT__) { initializeSession().catch(() => {}); }
  }

  function destroy() {
    if (dom.root?.parentNode) {
      dom.root.parentNode.removeChild(dom.root);
    }
    document.getElementById(NATIVE_FETCH_FRAME_ID)?.remove();
    delete window.AdReplica;
  }

  function injectStyles() {
    if (document.getElementById(`${APP_ID}-styles`)) return;
    const style = document.createElement("style");
    style.id = `${APP_ID}-styles`;
    style.textContent = buildAdReplicaStyles(APP_ID);
    document.head.appendChild(style);
  }

  async function fetchText(url, options = {}) {
    const response = await adReplicaFetch(url, {
      credentials: "include",
      redirect: "follow",
      ...options,
    });
    const text = stripFacebookPrelude(await response.text());
    return { response, text };
  }

  function extractPrivateTokens(text) {
    const fbDtsg =
      text.match(/DTSGInitialData",\[\],\{"token":"([^"]+)/)?.[1]
      || text.match(/"dtsg":\{"token":"([^"]+)/)?.[1]
      || "";
    const asyncGetToken =
      text.match(/"async_get_token":"([^"]+)/)?.[1]
      || text.match(/"dtsg_ag":\{"token":"([^"]+)/)?.[1]
      || "";
    const lsd = text.match(/LSD",\[\],\{"token":"([^"]+)/)?.[1] || "";
    return fbDtsg && lsd ? { fbDtsg, asyncGetToken, lsd } : null;
  }

  function extractAccessToken(text) {
    return text.match(/EAAB[a-zA-Z0-9]+/)?.[0] || "";
  }

  function getCurrentActorId() {
    return (document.cookie.match(/(?:^|;\s)c_user=(\d+)/) || [])[1]
      || getFacebookModule("CurrentUserInitialData")?.USER_ID
      || "";
  }

  function getDraftApplicationId() {
    const html = document.documentElement?.outerHTML || "";
    const match =
      html.match(/current_addrafts\{\\?"cross_application_id\\?":\\?"(\d+)"/)
      || html.match(/cross_application_id\\?":\\?"(\d+)"/)
      || html.match(/cross_application_id":"(\d+)"/);
    return match?.[1] || Config.ADS_MANAGER_APPLICATION_ID;
  }

  async function discoverSession() {
    const htmlCandidates = [];

    const currentHtml = document.documentElement?.outerHTML || "";
    if (currentHtml) {
      htmlCandidates.push(currentHtml);
    }

    try {
      const managerUrl = new URL("/ads/manager?locale=en_US", window.location.origin).toString();
      const firstFetch = await fetchText(managerUrl);
      htmlCandidates.push(firstFetch.text);
      const redirect = firstFetch.text.match(/window\.location\.replace\("([^"]+)/)?.[1]?.replaceAll("\\", "");
      if (redirect) {
        try {
          const redirected = await fetchText(redirect);
          htmlCandidates.push(redirected.text);
        } catch (error) {
          log("warn", "Failed to follow ads manager redirect for token.", String(error));
        }
      }
    } catch (error) {
      log("warn", "Failed to fetch ads manager for token.", String(error));
    }

    for (const html of htmlCandidates) {
      const token = extractAccessToken(html);
      const privateTokens = extractPrivateTokens(html);
      if (token) {
        return {
          token,
          privateTokens,
        };
      }
    }

    for (const html of htmlCandidates) {
      const privateTokens = extractPrivateTokens(html);
      if (privateTokens) {
        return {
          token: "",
          privateTokens,
        };
      }
    }

    return {
      token: "",
      privateTokens: null,
    };
  }

  async function initializeSession(force = false) {
    if (state.loadingSession) return;
    if (state.sessionReady && !force) return;
    state.loadingSession = true;
    renderStatus();
    renderButtons();
    try {
      const runtimeToken = typeof __accessToken !== "undefined" ? __accessToken : "";
      const runtimeDtsg =
        getFacebookModule("DTSGInitialData")?.token
          || getFacebookModule("DTSGInitData")?.token
          || "";
      const runtimeLsd = getFacebookModule("LSD")?.token || "";

      if (runtimeToken) {
        state.token = runtimeToken;
        state.privateTokens = runtimeDtsg && runtimeLsd
          ? { fbDtsg: runtimeDtsg, asyncGetToken: "", lsd: runtimeLsd }
          : null;
        if (!state.privateTokens) {
          const session = await discoverSession();
          state.privateTokens = session.privateTokens;
          if (!state.token && session.token) {
            state.token = session.token;
          }
        }
      } else {
        const session = await discoverSession();
        state.privateTokens = session.privateTokens;
        state.token = session.token;
      }
      if (!state.token) {
        throw new Error("Could not extract access_token. Run the script on the Ads Manager page.");
      }
      state.sessionReady = true;
      log("info", "Session connected.");
      await loadAccounts();
    } catch (error) {
      state.sessionReady = false;
      log("error", "Session initialization error.", String(error));
      throw error;
    } finally {
      state.loadingSession = false;
      renderUI();
    }
  }

  async function graphFetch(pathOrUrl, options = {}) {
    if (!state.token) {
      throw new Error("No access_token.");
    }

    const {
      method = "GET",
      query = {},
      body = null,
      formData = null,
      fullUrl = false,
      raw = false,
      apiBase = Config.API_URL,
    } = options;

    const url = fullUrl
      ? new URL(pathOrUrl)
      : new URL(pathOrUrl.replace(/^\/+/, ""), apiBase);
    const templateAccountId =
      String(query?.__aaid || body?.account_id || "").replace(/^act_/, "")
      || getAccountIdFromGraphPath(pathOrUrl);

    if (!url.searchParams.has("access_token")) {
      url.searchParams.set("access_token", state.token);
    }
    if (!url.searchParams.has("locale")) {
      url.searchParams.set("locale", "en_US");
    }
    applyGraphRuntimeTemplate(url, method, templateAccountId);

    Object.entries(query || {}).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") return;
      url.searchParams.set(key, typeof value === "string" ? value : JSON.stringify(value));
    });

    const init = {
      method,
      mode: "cors",
      credentials: "include",
      referrer: "https://business.facebook.com/",
      referrerPolicy: "origin-when-cross-origin",
      headers: {
        accept: "*/*",
        "accept-language": "en-US,en;q=0.9",
        "sec-ch-ua": '"Google Chrome";v="107", "Chromium";v="107", "Not=A?Brand";v="24"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-site",
      },
    };

    if (formData) {
      formData.set("access_token", state.token);
      if (!formData.has("locale")) {
        formData.set("locale", "en_US");
      }
      init.body = formData;
    } else if (body) {
      init.headers["content-type"] = "application/x-www-form-urlencoded";
      const payload = new URLSearchParams();
      payload.set("access_token", state.token);
      payload.set("locale", "en_US");
      Object.entries(body).forEach(([key, value]) => {
        if (value === undefined || value === null || value === "") return;
        payload.set(key, typeof value === "string" ? value : JSON.stringify(value));
      });
      init.body = payload;
    }

    let response;
    let lastFetchError = null;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        response = await adReplicaFetch(url.toString(), init);
        lastFetchError = null;
        break;
      } catch (error) {
        lastFetchError = error;
        const message = String(error?.message || error || "");
        const isTransientNetworkError = /failed to fetch|networkerror|load failed|network request failed|fetch failed|aborterror/i.test(message);
        if (!isTransientNetworkError || attempt === 3) {
          throw error;
        }
        log("warn", `Transient fetch failure on attempt ${attempt} for ${url.pathname}. Retrying...`, message);
        await sleep(600 * attempt);
      }
    }
    if (!response && lastFetchError) {
      throw lastFetchError;
    }
    if (raw) {
      return response;
    }
    const text = stripFacebookPrelude(await response.text());
    let json;
    try {
      json = text ? JSON.parse(text) : {};
    } catch (_error) {
      throw new Error(`Failed to parse JSON: ${text.slice(0, 300)}`);
    }
    if (!response.ok || json.error) {
      throw new Error(JSON.stringify(json.error || { status: response.status, text }, null, 2));
    }
    return json;
  }

  async function graphGetAll(path, query = {}) {
    const first = await graphFetch(path, { query });
    const rows = [...(first.data || [])];
    let next = first.paging?.next || "";
    while (next) {
      const page = await graphFetch(next, { fullUrl: true });
      rows.push(...(page.data || []));
      next = page.paging?.next || "";
    }
    return rows;
  }

  async function graphPageFetch(pathOrUrl, options = {}) {
    return graphFetch(pathOrUrl, {
      ...options,
      apiBase: Config.PAGE_API_URL,
    });
  }

  async function graphPageGetAll(path, query = {}) {
    const first = await graphPageFetch(path, { query });
    const rows = [...(first.data || [])];
    let next = first.paging?.next || "";
    while (next) {
      const page = await graphPageFetch(next, { fullUrl: true });
      rows.push(...(page.data || []));
      next = page.paging?.next || "";
    }
    return rows;
  }

  function parsePrivateGraphqlText(text) {
    const stripped = stripFacebookPrelude(text || "");
    if (!stripped.trim()) {
      return {};
    }
    try {
      return JSON.parse(stripped);
    } catch (_error) {
      const chunks = stripped
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          try {
            return JSON.parse(line);
          } catch (_lineError) {
            return null;
          }
        })
        .filter(Boolean);
      if (!chunks.length) {
        throw new Error(`Failed to parse private GraphQL response: ${stripped.slice(0, 300)}`);
      }
      return {
        ...(chunks[0] || {}),
        __chunks: chunks,
      };
    }
  }

  async function privateGraphqlRequest(docId, friendlyName, variables, options = {}) {
    if (!state.privateTokens?.fbDtsg || !state.privateTokens?.lsd) {
      throw new Error("No private GraphQL tokens. Reinitialize session from an Ads Manager page.");
    }
    const actorId = String(getCurrentActorId() || "");
    if (!actorId) {
      throw new Error("Could not resolve actor id for private GraphQL request.");
    }

    const body = new URLSearchParams();
    body.set("av", actorId);
    body.set("__user", actorId);
    body.set("__a", "1");
    body.set("fb_dtsg", state.privateTokens.fbDtsg);
    body.set("lsd", state.privateTokens.lsd);
    body.set("fb_api_caller_class", "RelayModern");
    body.set("fb_api_req_friendly_name", friendlyName);
    body.set("server_timestamps", "true");
    body.set("doc_id", String(docId));
    body.set("variables", JSON.stringify(variables || {}));

    const response = await adReplicaFetch(options.endpoint || "https://www.facebook.com/api/graphql/", {
      method: "POST",
      credentials: "include",
      mode: "cors",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "*/*",
      },
      body,
    });
    const text = await response.text();
    const json = parsePrivateGraphqlText(text);
    if (!response.ok || json.errors) {
      throw new Error(JSON.stringify(json.errors || { status: response.status, text }, null, 2));
    }
    return json;
  }

  async function businessGraphqlRequest(docId, friendlyName, variables) {
    return privateGraphqlRequest(docId, friendlyName, variables, {
      endpoint: "https://business.facebook.com/api/graphql/",
    });
  }

  function getIdentityLookupAccountId(accountId = "") {
    return String(accountId || state.cloneTargetAccountId || state.importAccountId || state.exportAccountId || state.accounts[0]?.id || "")
      .replace(/^act_/, "");
  }

  function getBusinessIdFromLocation() {
    const params = new URLSearchParams(window.location.search || "");
    return String(params.get("business_id") || params.get("global_scope_id") || "").replace(/^act_/, "");
  }

  function buildPageBackedDestinationSpec() {
    return {
      native_commerce_experience: {
        shop: {
          action_metadata: {
            type: "DEFAULT_OFF",
          },
        },
      },
    };
  }

  async function fetchAdsManagerInstagramObjectRecord(instagramObjectId, accountId = "") {
    const normalizedInstagramObjectId = String(instagramObjectId || "");
    const normalizedAccountId = getIdentityLookupAccountId(accountId);
    if (!normalizedInstagramObjectId || !normalizedAccountId) {
      return null;
    }
    return graphFetch(normalizedInstagramObjectId, {
      apiBase: "https://adsmanager-graph.facebook.com/v22.0/",
      query: {
        __aaid: normalizedAccountId,
        _reqName: "object:instagram_object",
        _reqSrc: "AdsInstagramUsernameDataManager",
        fields: [
          "id",
          "legacy_instagram_user_id",
          "threads_user_id",
        ],
        include_headers: false,
        method: "get",
        pretty: 0,
        suppress_http_code: 1,
      },
    });
  }

  function buildIdentityHintFromInstagramObject(instagramObject) {
    const instagramUserId = String(instagramObject?.id || "");
    const instagramActorId = String(instagramObject?.legacy_instagram_user_id || "");
    if (!instagramActorId || !instagramUserId || instagramActorId === instagramUserId) {
      return null;
    }
    return {
      instagramUserId,
      instagramActorId,
      threadsUserId: String(instagramObject?.threads_user_id || ""),
      source: "AdsInstagramUsernameDataManager",
      destinationSpec: buildPageBackedDestinationSpec(),
    };
  }

  async function privateGraphqlMutation(docId, friendlyName, variables) {
    return privateGraphqlRequest(docId, friendlyName, variables);
  }

  async function loadAccounts() {
    const rows = await graphGetAll("me/adaccounts", {
      fields: [
        "id",
        "name",
        "account_status",
        "disable_reason",
        "currency",
        "business_country_code",
        "timezone_id",
        "adspaymentcycle",
        "funding_source_details",
        "campaigns.limit(1).summary(true){id}",
      ].join(","),
    });

    const deduped = new Map();
    for (const row of rows) {
      const account = {
        id: String(row.id).replace(/^act_/, ""),
        name: row.name || row.id,
        ownerId: "me",
        ownerName: "",
        campaignsCount: Number(row.campaigns?.summary?.total_count ?? 0),
        raw: row,
      };
      if (!deduped.has(account.id)) {
        deduped.set(account.id, account);
      }
    }
    state.accounts = [...deduped.values()];

    state.accounts = state.accounts.sort((left, right) =>
      getAccountLabel(left).localeCompare(getAccountLabel(right), "ru"),
    );
    const currentAccountId =
      getFacebookModule("BusinessUnifiedNavigationContext")?.adAccountID
        ? String(getFacebookModule("BusinessUnifiedNavigationContext").adAccountID).replace(/^act_/, "")
        : "";
    if (!state.exportAccountId) {
      state.exportAccountId = currentAccountId || state.accounts[0]?.id || "";
    }
    if (!state.importAccountId) {
      state.importAccountId = currentAccountId || state.accounts[0]?.id || "";
    }
    if (!state.cloneSourceAccountId) {
      state.cloneSourceAccountId = currentAccountId || state.accounts[0]?.id || "";
    }
    if (!state.cloneTargetAccountId) {
      state.cloneTargetAccountId = currentAccountId || state.accounts[0]?.id || "";
    }
    if (state.importAccountId && state.importAccountId === state.cloneTargetAccountId) {
      const sharedContext = await fetchAccountContext(state.importAccountId);
      state.pages = sharedContext.pages;
      state.importAccountPixels = sharedContext.pixels;
      state.importTargetBusiness = sharedContext.business;
      state.importTargetCatalogs = sharedContext.catalogs;
      state.clonePages = sharedContext.pages;
      state.cloneTargetPixels = sharedContext.pixels;
      state.cloneTargetBusiness = sharedContext.business;
      state.cloneTargetCatalogs = sharedContext.catalogs;
      applyDefaultMappings(
        state.importPackage,
        state.pages,
        state.importAccountPixels,
        state.importTargetCatalogs,
        state.importPageMappings,
        state.importPixelMappings,
        state.importCatalogMappings,
      );
      applyDefaultMappings(
        state.clonePackage,
        state.clonePages,
        state.cloneTargetPixels,
        state.cloneTargetCatalogs,
        state.clonePageMappings,
        state.clonePixelMappings,
        state.cloneCatalogMappings,
      );
    } else {
      await refreshImportAccountContext();
      await refreshCloneTargetContext();
    }
    renderUI();
    log("info", `Accounts loaded: ${state.accounts.length}`);
    if (state.exportAccountId) {
      await loadExportCampaigns();
    }
    if (state.cloneSourceAccountId) {
      await loadCloneSourceCampaigns();
    }
  }

  async function fetchAdAccountBusiness(accountId) {
    const normalizedAccountId = String(accountId || "").replace(/^act_/, "");
    try {
      const account = await graphFetch(`act_${normalizedAccountId}`, {
        query: {
          fields: [
            "id",
            "name",
            "business{id,name}",
            "owner_business{id,name}",
          ].join(","),
        },
      });
      const business = account.business || null;
      if (business?.id) {
        return { id: String(business.id), name: business.name || business.id, source: "business" };
      }
      const ownerBusiness = account.owner_business || null;
      if (ownerBusiness?.id) {
        return { id: String(ownerBusiness.id), name: ownerBusiness.name || ownerBusiness.id, source: "owner_business" };
      }
      log("info", `No Business Manager is visible on act_${normalizedAccountId}; catalog campaign clone/import will be blocked for this target.`);
      return null;
    } catch (error) {
      const level = isPermissionDeniedGraphError(error) ? "info" : "warn";
      log(level, `Business lookup failed for act_${normalizedAccountId}; treating it as no visible Business Manager for catalog checks.`, String(error));
      return null;
    }
  }

  async function fetchBusinessCatalogs(businessId) {
    if (!businessId) {
      return [];
    }
    const catalogMap = new Map();
    const edges = ["owned_product_catalogs", "client_product_catalogs"];
    for (const edge of edges) {
      try {
        const rows = await graphGetAll(`${businessId}/${edge}`, {
          fields: "id,name,vertical,product_count,business",
        });
        for (const row of rows) {
          const id = String(row.id || "");
          if (!id) continue;
          catalogMap.set(id, {
            id,
            name: row.name || id,
            vertical: row.vertical || "",
            productCount: row.product_count ?? null,
            edge,
          });
        }
      } catch (error) {
        const level = isPermissionDeniedGraphError(error) ? "info" : "warn";
        log(level, `Catalog lookup failed on ${edge} for business ${businessId}.`, String(error));
      }
    }
    return [...catalogMap.values()].sort((left, right) =>
      (left.name || left.id).localeCompare(right.name || right.id, "ru"));
  }

  async function fetchEligibleCatalogsForAccount(accountId) {
    const normalizedAccountId = String(accountId || "").replace(/^act_/, "");
    if (!normalizedAccountId) {
      return [];
    }
    try {
      const result = await graphFetch(`act_${normalizedAccountId}/dpa_eligible_product_catalogs`, {
        query: {
          fields: "id,name,vertical,product_count",
          limit: 100,
          request_source: "PRODUCT_EXTENSIONS_ELIGIBILITY_CHECK",
        },
      });
      return (result.data || [])
        .map((row) => {
          const id = String(row?.id || "");
          if (!id) {
            return null;
          }
          return {
            id,
            name: row.name || id,
            vertical: row.vertical || "",
            productCount: row.product_count ?? null,
            edge: "dpa_eligible_product_catalogs",
          };
        })
        .filter(Boolean)
        .sort((left, right) => (left.name || left.id).localeCompare(right.name || right.id, "ru"));
    } catch (error) {
      const level = isPermissionDeniedGraphError(error) ? "info" : "warn";
      log(level, `Eligible catalog lookup failed for act_${normalizedAccountId}.`, String(error));
      return [];
    }
  }

  function mergeCatalogLists(primaryCatalogs = [], secondaryCatalogs = []) {
    const catalogMap = new Map();
    for (const row of [...(primaryCatalogs || []), ...(secondaryCatalogs || [])]) {
      const id = String(row?.id || "");
      if (!id) {
        continue;
      }
      if (!catalogMap.has(id)) {
        catalogMap.set(id, {
          id,
          name: row.name || id,
          vertical: row.vertical || "",
          productCount: row.productCount ?? row.product_count ?? null,
          edge: row.edge || "",
        });
        continue;
      }
      const existing = catalogMap.get(id);
      if (!existing.name && row.name) {
        existing.name = row.name;
      }
      if (!existing.vertical && row.vertical) {
        existing.vertical = row.vertical;
      }
      if ((existing.productCount === null || existing.productCount === undefined) && (row.productCount !== null && row.productCount !== undefined)) {
        existing.productCount = row.productCount;
      }
      if (!existing.edge && row.edge) {
        existing.edge = row.edge;
      } else if (row.edge && !String(existing.edge || "").includes(row.edge)) {
        existing.edge = `${existing.edge},${row.edge}`;
      }
    }
    return [...catalogMap.values()].sort((left, right) =>
      (left.name || left.id).localeCompare(right.name || right.id, "ru"));
  }

  async function fetchAccountContext(accountId) {
    const normalizedAccountId = String(accountId || "").replace(/^act_/, "");
    if (state.accountContextCache[normalizedAccountId]) {
      return state.accountContextCache[normalizedAccountId];
    }

    if (!Array.isArray(state.accessiblePagesCache)) {
      try {
        const allPages = await graphPageGetAll("me/accounts", {
          type: "page",
          fields: "id,name,is_published,access_token",
        });
        const pageMap = new Map();
        for (const page of allPages) {
          const pageId = String(page.id);
          pageMap.set(pageId, {
            id: pageId,
            name: page.name || pageId,
            instagramId: "",
            accessToken: page.access_token || "",
          });
        }
        state.accessiblePagesCache = [...pageMap.values()].sort((left, right) =>
          left.name.localeCompare(right.name, "ru"));
        log("info", `Loaded ${state.accessiblePagesCache.length} accessible pages from me/accounts.`);
      } catch (error) {
        state.accessiblePagesCache = [];
        log("warn", "Page account lookup failed.", String(error));
      }
    }

    const pixels = await graphGetAll(`act_${normalizedAccountId}/adspixels`, {
      fields: "id,name",
    });
    const business = await fetchAdAccountBusiness(normalizedAccountId);
    const businessCatalogs = await fetchBusinessCatalogs(business?.id || "");
    const eligibleCatalogs = await fetchEligibleCatalogsForAccount(normalizedAccountId);
    const catalogs = mergeCatalogLists(businessCatalogs, eligibleCatalogs);
    if (eligibleCatalogs.length > businessCatalogs.length) {
      log("info", `Expanded target catalog list for act_${normalizedAccountId} via dpa_eligible_product_catalogs: ${businessCatalogs.length} -> ${catalogs.length}.`);
    }
    const context = {
      pages: state.accessiblePagesCache,
      pixels: pixels.map((pixel) => ({
        id: String(pixel.id),
        name: pixel.name || pixel.id,
      })),
      business,
      catalogs,
    };
    state.accountContextCache[normalizedAccountId] = context;
    return context;
  }

  function invalidateAccountContextCache(accountId) {
    const normalizedAccountId = String(accountId || "").replace(/^act_/, "");
    if (normalizedAccountId) {
      delete state.accountContextCache[normalizedAccountId];
    }
  }

  function applyDefaultMappings(packageData, pages, pixels, catalogs, pageMappings, pixelMappings, catalogMappings) {
    for (const page of getSourcePagesFromPackage(packageData)) {
      const current = pageMappings[page.id];
      if (current && (pages || []).some((item) => item.id === current)) {
        continue;
      }
      pageMappings[page.id] = (pages || []).some((item) => item.id === page.id)
        ? page.id
        : (pages?.[0]?.id || "");
    }
    for (const pixel of getSourcePixelsFromPackage(packageData)) {
      const current = pixelMappings[pixel.id];
      if (current === "__create__" || (current && (pixels || []).some((item) => item.id === current))) {
        continue;
      }
      pixelMappings[pixel.id] = (pixels || []).some((item) => item.id === pixel.id)
        ? pixel.id
        : "__create__";
    }
    for (const catalog of getSourceCatalogsFromPackage(packageData)) {
      const current = catalogMappings[catalog.id];
      if (current === "__copy__") {
        continue;
      }
      if (current && (catalogs || []).some((item) => item.id === current)) {
        continue;
      }
      catalogMappings[catalog.id] = (catalogs || []).some((item) => item.id === catalog.id)
        ? catalog.id
        : "";
    }
  }

  function packageUsesCatalogs(packageData) {
    return getSourceCatalogsFromPackage(packageData).length > 0;
  }

  function importRequiresDraftOnly(packageData = state.importPackage) {
    return packageUsesCatalogs(packageData);
  }

  function cloneRequiresDraftOnly(packageData = state.clonePackage) {
    return packageUsesCatalogs(packageData) || Boolean(state.cloneManualSourceCatalogId);
  }

  function getModeOptionsMarkup(draftOnly) {
    return `
      <option value="DRAFT">DRAFT</option>
      ${draftOnly ? "" : `
      <option value="ACTIVE">ACTIVE</option>
      <option value="PAUSED">PAUSED</option>`}
    `;
  }

  function enforceImportModeConstraints() {
    if (!importRequiresDraftOnly()) {
      return;
    }
    state.importAsDraft = true;
    state.importStatus = "PAUSED";
  }

  function enforceCloneModeConstraints() {
    if (!cloneRequiresDraftOnly()) {
      return;
    }
    state.cloneAsDraft = true;
    state.cloneStatus = "PAUSED";
  }

  async function refreshImportAccountContext() {
    if (!state.importAccountId || !state.sessionReady) return;
    try {
      const context = await fetchAccountContext(state.importAccountId);
      state.pages = context.pages;
      state.importAccountPixels = context.pixels;
      state.importTargetBusiness = context.business;
      state.importTargetCatalogs = context.catalogs;
      applyDefaultMappings(
        state.importPackage,
        state.pages,
        state.importAccountPixels,
        state.importTargetCatalogs,
        state.importPageMappings,
        state.importPixelMappings,
        state.importCatalogMappings,
      );
    } catch (error) {
      log("error", "Failed to refresh import context.", String(error));
    }
  }

  async function refreshCloneTargetContext() {
    if (!state.cloneTargetAccountId || !state.sessionReady) return;
    try {
      const context = await fetchAccountContext(state.cloneTargetAccountId);
      state.clonePages = context.pages;
      state.cloneTargetPixels = context.pixels;
      state.cloneTargetBusiness = context.business;
      state.cloneTargetCatalogs = context.catalogs;
      applyDefaultMappings(
        state.clonePackage,
        state.clonePages,
        state.cloneTargetPixels,
        state.cloneTargetCatalogs,
        state.clonePageMappings,
        state.clonePixelMappings,
        state.cloneCatalogMappings,
      );
    } catch (error) {
      log("error", "Failed to refresh clone target context.", String(error));
    }
  }

  async function refreshCloneSourceContext() {
    if (!state.cloneSourceAccountId || !state.sessionReady) return;
    try {
      const context = await fetchAccountContext(state.cloneSourceAccountId);
      state.cloneSourceBusiness = context.business;
      state.cloneSourceCatalogs = context.catalogs;
    } catch (error) {
      log("error", "Failed to refresh clone source context.", String(error));
    }
  }

  async function fetchCampaignsForAccount(accountId) {
    const normalizedAccountId = String(accountId || "").replace(/^act_/, "");
    if (state.accountCampaignsCache[normalizedAccountId]) {
      return state.accountCampaignsCache[normalizedAccountId];
    }
    const campaigns = await graphGetAll(`act_${normalizedAccountId}/campaigns`, {
      fields: [
        "id",
        "name",
        "status",
        "effective_status",
        "objective",
        "daily_budget",
        "lifetime_budget",
        "bid_strategy",
        "buying_type",
        "special_ad_categories",
        "special_ad_category",
        "special_ad_category_country",
        "start_time",
        "stop_time",
      ].join(","),
    });
    state.accountCampaignsCache[normalizedAccountId] = campaigns;
    return campaigns;
  }

  async function loadCampaignsIntoState(accountId, fieldName, selectedFieldName) {
    const campaigns = await fetchCampaignsForAccount(accountId);
    state[fieldName] = campaigns.map((campaign) => ({
      id: String(campaign.id),
      name: campaign.name || campaign.id,
      raw: campaign,
    }));
    if (!state[selectedFieldName] && state[fieldName][0]) {
      state[selectedFieldName] = state[fieldName][0].id;
    }
  }

  async function loadCloneSourceCampaigns() {
    if (!state.cloneSourceAccountId) {
      log("warn", "Select a source account for clone first.");
      return;
    }
    setBusy(true);
    try {
      await initializeSession();
      await loadCampaignsIntoState(state.cloneSourceAccountId, "cloneSourceCampaigns", "cloneSourceCampaignId");
      renderUI();
      log("info", `Clone source campaigns found: ${state.cloneSourceCampaigns.length}`);
      if (state.cloneSourceCampaignId) {
        await ensureClonePackageLoaded();
      }
    } catch (error) {
      log("error", "Failed to load clone source campaigns.", String(error));
    } finally {
      setBusy(false);
    }
  }

  async function loadExportCampaigns() {
    if (!state.exportAccountId) {
      log("warn", "Select an account for export first.");
      return;
    }
    setBusy(true);
    try {
      await initializeSession();
      const campaigns = await graphGetAll(`act_${state.exportAccountId}/campaigns`, {
        fields: [
          "id",
          "name",
          "status",
          "effective_status",
          "objective",
          "daily_budget",
          "lifetime_budget",
          "bid_strategy",
          "buying_type",
          "special_ad_categories",
          "special_ad_category",
          "special_ad_category_country",
          "start_time",
          "stop_time",
        ].join(","),
      });
      state.exportCampaigns = campaigns.map((campaign) => ({
        id: String(campaign.id),
        name: campaign.name || campaign.id,
        raw: campaign,
      }));
      if (!state.exportCampaignId && state.exportCampaigns[0]) {
        state.exportCampaignId = state.exportCampaigns[0].id;
      }
      renderUI();
      log("info", `Campaigns found: ${state.exportCampaigns.length}`);
    } catch (error) {
      log("error", "Failed to load campaigns.", String(error));
    } finally {
      setBusy(false);
    }
  }

  async function getPageName(pageId) {
    if (!pageId) return "";
    try {
      const page = await graphPageFetch(pageId, {
        query: { fields: "id,name,is_published" },
      });
      return page.name || page.id || "";
    } catch (_error) {
      return pageId;
    }
  }

  function isLikelyCatalogCreative(creative) {
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
    if (osp.link_data?.multi_share_end_card || osp.link_data?.show_multiple_images) {
      return true;
    }
    return false;
  }

  function isSyntheticProductSetName(value) {
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

  function rankProductSetMeta(item) {
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

  function normalizeDpaCatalogHint(item, fallbackAdName = "") {
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
        cpas_category_product_set_id: productSet.cpas_category_product_set_id || "",
        capability: productSet.capability || "",
        product_catalog: {
          id: String(catalogId),
          name: productCatalog?.name || item?.name || `Catalog ${catalogId}`,
          vertical: productCatalog?.vertical || item?.vertical || "commerce",
          catalog_item_type: productCatalog?.catalog_item_type || item?.catalog_item_type || "",
        },
        source: "dpa_eligible_product_catalogs",
      }));
    return {
      catalog: {
        id: String(catalogId),
        name: productCatalog?.name || item?.name || fallbackAdName || `Catalog ${catalogId}`,
        vertical: productCatalog?.vertical || item?.vertical || "commerce",
        catalog_item_type: productCatalog?.catalog_item_type || item?.catalog_item_type || "",
        source: "dpa_eligible_product_catalogs",
      },
      productSets,
    };
  }

  async function fetchDpaCatalogHintsForAds(accountId, ads, creatives) {
    const creativeById = new Map((creatives || []).map((creative) => [String(creative.id), creative]));
    const catalogMap = new Map();
    const productSetMap = new Map();
    const adCandidateProductSetIds = new Map();
    const fields = [
      "product_sets.limit(10).filtering([",
      "{\"field\":\"product_count\",\"operator\":\"GREATER_THAN\",\"value\":0}",
      "]){id,name,filter,capability,cpas_category_product_set_id,is_autogen_product_set,",
      "is_eligible_for_value_optimization,is_eligible_for_value_optimization_new,",
      "da_approved_items_count,original_creation_source,checkout_eligible_item_count,",
      "collection{url},product_catalog{id,name,vertical,has_localized_overrides,catalog_item_type}}",
    ].join("");
    const filtering = [
      { field: "product_set_count", operator: "GREATER_THAN_OR_EQUAL", value: 1 },
      { field: "exclude_child_catalogs", operator: "EQUAL", value: true },
      {
        field: "vertical",
        operator: "IN",
        value: ["commerce", "automotive_models", "destinations", "flights", "home_listings", "hotels", "vehicle_offers", "vehicles"],
      },
      { field: "include_business_catalogs_only", operator: "EQUAL", value: true },
      { field: "prioritize_non_empty_catalogs", operator: "EQUAL", value: true },
    ];

    for (const ad of ads || []) {
      const creative = creativeById.get(String(ad?.creative?.id || ""));
      if (!creative || !isLikelyCatalogCreative(creative)) {
        continue;
      }
      const pageId = getSourcePageId(creative);
      try {
        const result = await graphFetch(`act_${accountId}/dpa_eligible_product_catalogs`, {
          query: {
            adgroup_id: String(ad.id),
            page_id: pageId || undefined,
            fields,
            filtering,
            limit: 5,
            sort_by: "default",
            request_source: "PRODUCT_EXTENSIONS_ELIGIBILITY_CHECK",
          },
        });
        for (const item of result.data || []) {
          const hint = normalizeDpaCatalogHint(item, ad.name || creative.name || "");
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
            adCandidateProductSetIds.get(String(ad.id)).add(String(productSet.id));
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
        log("warn", `Catalog discovery skipped for ad ${ad.name || ad.id}.`, String(error));
      }
    }

    for (const [adId, candidateIds] of adCandidateProductSetIds.entries()) {
      const ad = ads.find((item) => String(item.id) === String(adId));
      const creative = creatives.find((item) => String(item.id) === String(ad?.creative?.id || ""));
      if (!creative?.raw || creative.raw.product_set_id) {
        continue;
      }
      const candidates = [...candidateIds]
        .map((id) => productSetMap.get(String(id)))
        .filter(Boolean);
      if (!candidates.length) {
        continue;
      }
      const nonAutogenCandidates = candidates.filter((item) => !item.is_autogen_product_set);
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

  async function fetchCatalogExportSnapshot(catalogHint) {
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
      log("warn", `Product sets export failed for catalog ${catalogId}.`, String(error));
      return [];
    });
    const hasFeed = productFeeds.length > 0 || Number(catalog.feed_count || 0) > 0;
    const products = hasFeed ? [] : await fetchCatalogManualProducts(catalogId);
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      exportMode: hasFeed ? "feed" : "manual_products",
      catalog: {
        id: String(catalog.id),
        name: catalog.name || catalogHint.name || catalog.id,
        vertical: catalog.vertical || catalogHint.vertical || "commerce",
        catalog_item_type: catalog.catalog_item_type || catalogHint.catalog_item_type || "",
        productCount: catalog.product_count ?? products.length,
        business: catalog.business || null,
        creation_source: catalog.creation_source || "",
        feed_count: catalog.feed_count ?? productFeeds.length,
        parent_catalog_id: catalog.parent_catalog_id || "",
        source_app: catalog.source_app || "",
      },
      productFeeds,
      productSets: productSets.map((item) => ({ ...item, id: String(item.id) })),
      products: products.map((item) => ({ ...item, id: String(item.id) })),
    };
  }

  async function fetchCatalogExportsForPackage(catalogs) {
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
          log("info", `Catalog exported: ${snapshot.catalog.name} (${snapshot.exportMode}).`);
        }
      } catch (error) {
        log("warn", `Catalog export skipped for ${catalog.name || catalogId}.`, String(error));
      }
    }
    return exports;
  }

  async function fetchCatalogProductFeeds(catalogId, options = {}) {
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
      log("info", `Product feed Graph edge unavailable for catalog ${catalogId}; exported via Commerce Manager data-source queries.`);
      return commerceFeeds;
    }
    if (lastGraphError && !options.suppressEmptyLog) {
      const level = isPermissionDeniedGraphError(lastGraphError) ? "info" : "warn";
      log(level, `Product feed export returned no feeds for catalog ${catalogId}; Graph edge failed and Commerce Manager fallback was empty.`, String(lastGraphError));
    }
    return commerceFeeds;
  }

  async function fetchCatalogProductFeedsFromCommerce(catalogId) {
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
          feeds.push(normalizeCatalogFeedExport({
            ...node,
            ...dataSource,
            id: dataSource.id || dataSourceId,
            raw: dataSource,
            commerce_query: {
              selector_doc_id: "24399249673110817",
              details_doc_id: "27127405650294914",
            },
          }));
        } catch (detailError) {
          log("warn", `Commerce feed detail export failed for feed ${dataSourceId}.`, String(detailError));
          feeds.push(normalizeCatalogFeedExport(node));
        }
      }
      return feeds;
    } catch (error) {
      log("warn", `Commerce data-source feed export failed for catalog ${catalogId}.`, String(error));
    }
    return [];
  }

  function normalizeCatalogFeedExport(feed) {
    const schedule = feed?.schedule && typeof feed.schedule === "object"
      ? deepClone(feed.schedule)
      : feed?.schedule || null;
    if (schedule && typeof schedule === "object" && schedule.uri && !schedule.url) {
      schedule.url = schedule.uri;
    }
    return {
      id: String(feed?.id || feed?.data_source_id || ""),
      name: feed?.name || feed?.file_name || feed?.data_source_display_name || feed?.id || "AdReplica feed",
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

  async function fetchCatalogManualProducts(catalogId) {
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
      log("warn", `Manual product export failed for catalog ${catalogId}.`, String(error));
      return [];
    });
  }

  async function fetchCampaignExportPackage(accountId, campaignId) {
    const account = state.accounts.find((item) => item.id === accountId);
    const campaign = normalizeExportScheduleFields(stripVolatileEntityFields(await graphFetch(campaignId, {
      query: {
        fields: [
          "id",
          "name",
          "status",
          "effective_status",
          "objective",
          "daily_budget",
          "lifetime_budget",
          "bid_strategy",
          "buying_type",
          "special_ad_categories",
          "special_ad_category",
          "special_ad_category_country",
          "start_time",
          "stop_time",
        ].join(","),
      },
    })), ["start_time", "stop_time"]);
    const adsets = (await graphGetAll(`${campaignId}/adsets`, {
      fields: [
        "id",
        "name",
        "status",
        "effective_status",
        "is_dynamic_creative",
        "daily_budget",
        "lifetime_budget",
        "optimization_goal",
        "billing_event",
        "targeting",
        "bid_strategy",
        "bid_amount",
        "promoted_object",
        "attribution_spec",
        "asset_feed_id",
        "destination_type",
        "is_dynamic_creative_optimization",
        "is_dynamic_creative_asset_customization",
        "is_dynamic_creative_format_automation",
        "optimization_sub_event",
        "adset_schedule",
        "pacing_type",
        "use_new_app_click",
        "is_autobid",
        "multi_optimization_goal_weight",
        "creative_sequence",
        "dynamic_ad_voice",
        "targeting_as_signal",
        "automatic_manual_state",
        "campaign_attribution",
        "attribution_count_type",
        "start_time",
        "end_time",
        "dsa_beneficiary",
        "dsa_payor",
      ].join(","),
    })).map((item) => normalizeExportScheduleFields(stripVolatileEntityFields(item), ["start_time", "end_time"]));
    const ads = (await graphGetAll(`${campaignId}/ads`, {
      fields: [
        "id",
        "name",
        "status",
        "effective_status",
        "creative",
        "adset",
        "conversion_domain",
      ].join(","),
    })).map(stripVolatileEntityFields);

    const creativeIds = [...new Set(ads.map((ad) => ad?.creative?.id).filter(Boolean).map(String))];
    const creatives = [];
    const downloadQueue = [];
    const pageNames = new Map();
    const fileNameMap = {};
    const usedFileNames = new Set();
    const sourceToFriendly = new Map();

    const creativeIdToAdName = new Map();
    for (const ad of ads) {
      const cid = String(ad?.creative?.id);
      if (cid && !creativeIdToAdName.has(cid)) {
        creativeIdToAdName.set(cid, ad.name || ad.id);
      }
    }

    function makeFriendlyFileName(baseName, ext) {
      let candidate = `${sanitizeFileName(baseName)}${ext}`;
      if (!usedFileNames.has(candidate)) {
        usedFileNames.add(candidate);
        return candidate;
      }
      let n = 2;
      while (usedFileNames.has(`${sanitizeFileName(baseName)}_${n}${ext}`)) {
        n++;
      }
      candidate = `${sanitizeFileName(baseName)}_${n}${ext}`;
      usedFileNames.add(candidate);
      return candidate;
    }

    function makeFriendlyMediaFileName(baseName, type, index, ext) {
      const safeType = sanitizeFileName(type === "video" || type === "image" ? type : String(type || "media")) || "media";
      const ordinal = Number.isFinite(index) ? String(index).padStart(2, "0") : "01";
      return makeFriendlyFileName(`${baseName}__${safeType}_${ordinal}`, ext);
    }

    for (const creativeId of creativeIds) {
      const creative = await graphFetch(creativeId, {
        query: {
          fields: [
            "id",
            "name",
      "object_story_spec",
      "object_story_id",
      "asset_feed_spec",
      "template_url_spec",
      "url_tags",
      "object_type",
      "product_set_id",
      "body",
      "title",
            "degrees_of_freedom_spec",
            "creative_sourcing_spec",
            "contextual_multi_ads",
            "actor_type",
            "authorization_category",
            "branded_content_sponsor_page_id",
            "destination_spec",
            "effective_instagram_media_id",
            "effective_instagram_story_id",
            "effective_object_story_id",
            "enable_direct_install",
            "instagram_actor_id",
            "instagram_permalink_url",
            "thumbnail_url",
            "uca_draft_version",
            "use_page_actor_override",
          ].join(","),
        },
      });

      const sourcePageId =
        creative?.object_story_spec?.page_id
        || (creative?.object_story_id ? String(creative.object_story_id).split("_")[0] : "");
      if (sourcePageId && !pageNames.has(sourcePageId)) {
        pageNames.set(sourcePageId, await getPageName(sourcePageId));
      }

      const creativeEntry = {
        id: String(creative.id),
        name: creative.name || creative.id,
        raw: normalizeCreativeExportRaw(creative),
        sourcePageId: sourcePageId || "",
        sourcePageName: sourcePageId ? (pageNames.get(sourcePageId) || sourcePageId) : "",
        unsupportedReason: "",
      };

      const adName = creativeIdToAdName.get(String(creative.id)) || creative.name || creative.id;
      const osp = creative.object_story_spec || {};
      let hasAssetFeedMedia = false;
      if (creative.asset_feed_spec) {
        const afs = creative.asset_feed_spec;
        if (Array.isArray(afs.images)) {
          for (const img of afs.images) {
            if (!img.hash) continue;
            hasAssetFeedMedia = true;
            const imageHash = String(img.hash);
            const originalName = `${imageHash}.jpg`;
            if (sourceToFriendly.has(originalName)) {
              continue;
            }
            const images = await graphFetch(`act_${accountId}/adimages`, {
              query: {
                hashes: [imageHash],
                fields: "hash,url,permalink_url",
              },
            });
            const image = images.data?.[0];
            const imageUrl = image?.url || image?.permalink_url;
            if (imageUrl) {
              const friendly = makeFriendlyMediaFileName(adName, "image", afs.images.indexOf(img) + 1, ".jpg");
              sourceToFriendly.set(originalName, friendly);
              fileNameMap[originalName] = friendly;
              downloadQueue.push({
                type: "image",
                fileName: friendly,
                sourceUrl: imageUrl,
                sourceAccountId: accountId,
                sourceId: imageHash,
                sourceKind: "adimage",
              });
            }
          }
        }
        if (Array.isArray(afs.videos)) {
          for (const vid of afs.videos) {
            if (!vid.video_id) continue;
            hasAssetFeedMedia = true;
            const videoId = String(vid.video_id);
            const originalName = `${videoId}.mp4`;
            if (sourceToFriendly.has(originalName)) {
              continue;
            }
            const video = await graphFetch(videoId, {
              query: { fields: "id,source" },
            });
            if (video.source) {
              const friendly = makeFriendlyMediaFileName(adName, "video", afs.videos.indexOf(vid) + 1, ".mp4");
              sourceToFriendly.set(originalName, friendly);
              fileNameMap[originalName] = friendly;
              downloadQueue.push({
                type: "video",
                fileName: friendly,
                sourceUrl: video.source,
                sourceAccountId: accountId,
                sourceId: videoId,
                sourceKind: "advideo",
              });
            }
            if (hasAssetFeedCustomVideoThumbnail(vid)) {
              const previewExt = extractMediaExtensionFromUrl(vid.thumbnail_url, ".jpg");
              const previewOriginalName = getVideoThumbnailOriginalName(videoId, previewExt);
              if (!sourceToFriendly.has(previewOriginalName)) {
                let previewUrl = vid.thumbnail_url || "";
                if (!previewUrl && vid.thumbnail_hash) {
                  const images = await graphFetch(`act_${accountId}/adimages`, {
                    query: {
                      hashes: [String(vid.thumbnail_hash)],
                      fields: "hash,url,permalink_url",
                    },
                  });
                  const image = images.data?.[0];
                  previewUrl = image?.url || image?.permalink_url || "";
                }
                if (previewUrl) {
                  const friendly = makeFriendlyMediaFileName(adName, "preview", afs.videos.indexOf(vid) + 1, previewExt);
                  sourceToFriendly.set(previewOriginalName, friendly);
                  fileNameMap[previewOriginalName] = friendly;
                  downloadQueue.push({
                    type: "image",
                    fileName: friendly,
                    sourceUrl: previewUrl,
                    sourceAccountId: accountId,
                    sourceId: vid.thumbnail_hash ? String(vid.thumbnail_hash) : "",
                    sourceKind: "thumbnail",
                  });
                }
              }
            }
          }
        }
      }
      if (!creative.object_story_id && !hasAssetFeedMedia) {
        if (osp.video_data?.video_id) {
          const videoId = String(osp.video_data.video_id);
          const originalName = `${videoId}.mp4`;
          if (!sourceToFriendly.has(originalName)) {
            const video = await graphFetch(videoId, {
              query: { fields: "id,source" },
            });
            const friendly = makeFriendlyMediaFileName(adName, "video", 1, ".mp4");
            sourceToFriendly.set(originalName, friendly);
            fileNameMap[originalName] = friendly;
            downloadQueue.push({
              type: "video",
              fileName: friendly,
              sourceUrl: video.source,
              sourceAccountId: accountId,
              sourceId: videoId,
              sourceKind: "advideo",
            });
          }
          if (hasStandaloneCustomVideoThumbnail(osp.video_data)) {
            const previewExt = extractMediaExtensionFromUrl(osp.video_data.image_url, ".jpg");
            const previewOriginalName = getVideoThumbnailOriginalName(videoId, previewExt);
            if (!sourceToFriendly.has(previewOriginalName)) {
              let previewUrl = osp.video_data.image_url || "";
              if (!previewUrl && osp.video_data.image_hash) {
                const images = await graphFetch(`act_${accountId}/adimages`, {
                  query: {
                    hashes: [String(osp.video_data.image_hash)],
                    fields: "hash,url,permalink_url",
                  },
                });
                const image = images.data?.[0];
                previewUrl = image?.url || image?.permalink_url || "";
              }
              if (previewUrl) {
                const friendly = makeFriendlyMediaFileName(adName, "preview", 1, previewExt);
                sourceToFriendly.set(previewOriginalName, friendly);
                fileNameMap[previewOriginalName] = friendly;
                downloadQueue.push({
                  type: "image",
                  fileName: friendly,
                  sourceUrl: previewUrl,
                  sourceAccountId: accountId,
                  sourceId: osp.video_data.image_hash ? String(osp.video_data.image_hash) : "",
                  sourceKind: "thumbnail",
                });
              }
            }
          }
        } else if (osp.link_data?.image_hash) {
          const imageHash = String(osp.link_data.image_hash);
          const originalName = `${imageHash}.jpg`;
          if (!sourceToFriendly.has(originalName)) {
            const images = await graphFetch(`act_${accountId}/adimages`, {
              query: {
                hashes: [imageHash],
                fields: "hash,url,permalink_url",
              },
            });
            const image = images.data?.[0];
            const imageUrl = image?.url || image?.permalink_url;
            if (imageUrl) {
              const friendly = makeFriendlyMediaFileName(adName, "image", 1, ".jpg");
              sourceToFriendly.set(originalName, friendly);
              fileNameMap[originalName] = friendly;
              downloadQueue.push({
                type: "image",
                fileName: friendly,
                sourceUrl: imageUrl,
                sourceAccountId: accountId,
                sourceId: imageHash,
                sourceKind: "adimage",
              });
            }
          }
        }
      }

      creatives.push(creativeEntry);
    }

    const dpaCatalogHints = await fetchDpaCatalogHintsForAds(accountId, ads, creatives);
    if (dpaCatalogHints.catalogs.length) {
      log("info", `Detected catalog ad source: ${dpaCatalogHints.catalogs.map((item) => `${item.name} (${item.id})`).join(", ")}`);
    }
    for (const ad of ads || []) {
      const creative = creatives.find((item) => String(item.id) === String(ad?.creative?.id || ""));
      if (!creative || !isLikelyCatalogCreative(creative)) {
        continue;
      }
      if (!creative?.raw?.product_set_id) {
        log("warn", `Catalog creative ${creative.name || creative.id} exported without product_set_id after DPA hint enrichment.`);
      }
    }
    const provisionalPackage = {
      campaign,
      adsets,
      ads,
      creatives,
      catalogs: dpaCatalogHints.catalogs,
      productSets: dpaCatalogHints.productSets,
    };
    const sourceCatalogs = mergeEntityHintsById(
      dpaCatalogHints.catalogs,
      getSourceCatalogsFromPackage(provisionalPackage),
    );
    const sourceProductSets = mergeEntityHintsById(
      dpaCatalogHints.productSets,
      getSourceProductSetsFromPackage(provisionalPackage),
    );
    const catalogExports = await fetchCatalogExportsForPackage(sourceCatalogs);

    const dedupedFiles = new Map();
    for (const item of downloadQueue) {
      if (!dedupedFiles.has(item.fileName)) {
        dedupedFiles.set(item.fileName, item);
      }
    }

    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      source: {
        origin: window.location.origin,
        accountId,
        accountName: account?.name || accountId,
        campaignId: String(campaign.id),
        campaignName: campaign.name || campaign.id,
      },
      campaign,
      adsets,
      ads,
      creatives,
      catalogs: sourceCatalogs,
      productSets: sourceProductSets,
      catalogExports,
      fileNameMap,
      files: [...dedupedFiles.values()].map((item) => ({
        type: item.type,
        fileName: item.fileName,
      })),
      warnings: creatives
        .filter((item) => item.unsupportedReason)
        .map((item) => `Creative ${item.name} marked as unsupported: ${item.unsupportedReason}`),
      _downloadQueue: [...dedupedFiles.values()],
    };
  }

  async function responseToBlob(response) {
    const buffer = await response.arrayBuffer();
    return new Blob([buffer], {
      type: response.headers.get("content-type") || "application/octet-stream",
    });
  }

  function getMediaFileName(file) {
    return String(file?.name || file?.fileName || "");
  }

  function isRemoteMediaFile(file) {
    return Boolean(file?.__adReplicaRemoteMedia);
  }

  function createRemoteMediaFile(file, error = null) {
    return {
      __adReplicaRemoteMedia: true,
      name: file.fileName,
      fileName: file.fileName,
      type: file.type,
      sourceUrl: file.sourceUrl || "",
      sourceAccountId: String(file.sourceAccountId || "").replace(/^act_/, ""),
      sourceId: String(file.sourceId || ""),
      sourceKind: file.sourceKind || "",
      downloadError: String(error?.message || error || ""),
    };
  }

  async function downloadFile(sourceUrl, fileName) {
    const isCdn = /fbcdn\.net|scontent/.test(sourceUrl);
    const response = await adReplicaFetch(sourceUrl, {
      credentials: isCdn ? "omit" : "include",
      mode: "cors",
    });
    if (!response.ok) {
      throw new Error(`Download error ${fileName}: ${response.status}`);
    }
    return responseToBlob(response);
  }

  function triggerDownload(fileName, blob) {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      URL.revokeObjectURL(link.href);
      link.remove();
    }, 1500);
  }

  async function exportSelectedCampaign() {
    if (!state.exportAccountId || !state.exportCampaignId) {
      log("warn", "Select an account and a campaign for export.");
      return;
    }

    setBusy(true);
    try {
      await initializeSession();
      const packageData = await fetchCampaignExportPackage(state.exportAccountId, state.exportCampaignId);
      const jsonBlob = new Blob(
        [JSON.stringify({
          ...packageData,
          _downloadQueue: undefined,
        }, null, 2)],
        { type: "application/json" },
      );

      const jsonFileName = `${sanitizeFileName(packageData.source.campaignName)}.json`;
      triggerDownload(jsonFileName, jsonBlob);
      await sleep(150);

      for (const file of packageData._downloadQueue) {
        log("info", `Downloading ${file.fileName}...`);
        const blob = await downloadFile(file.sourceUrl, file.fileName);
        triggerDownload(file.fileName, blob);
        await sleep(250);
      }

      if (packageData.warnings.length) {
        packageData.warnings.forEach((warning) => log("warn", warning));
      }

      if (packageData.catalogExports?.length) {
        log(
          "info",
          `Catalog settings embedded in JSON: ${packageData.catalogExports.map((item) => `${item.catalog?.name || item.catalog?.id} (${item.exportMode})`).join(", ")}.`,
        );
      }
      log("info", `Export complete. Files: ${packageData.files.length + 1}`);
    } catch (error) {
      log("error", "Campaign export error.", String(error));
    } finally {
      setBusy(false);
    }
  }

  function applyPackageToImportState(data, options = {}) {
    state.importPackage = data;
    state.importCampaignName = options.campaignName ?? (data?.campaign?.name || data?.source?.campaignName || "");
    state.importPageMappings = { ...(options.pageMappings || {}) };
    state.importPixelMappings = { ...(options.pixelMappings || {}) };
    state.importCatalogMappings = { ...(options.catalogMappings || {}) };
    state.importMediaFiles = options.mediaFiles instanceof Map ? new Map(options.mediaFiles) : new Map();
    state.importMediaOverrides = options.mediaOverrides instanceof Map ? new Map(options.mediaOverrides) : new Map();
    state.importAsDraft = options.asDraft ?? true;
    state.importStatus = options.status ?? "PAUSED";
    state.importPreserveSchedule = options.preserveSchedule ?? false;
    enforceImportModeConstraints();
    if (dom.importCampaignName) {
      dom.importCampaignName.value = state.importCampaignName;
    }
    if (dom.importModeSelect) {
      dom.importModeSelect.value = state.importAsDraft ? "DRAFT" : state.importStatus;
    }
  }

  async function ensureClonePackageLoaded() {
    if (!state.cloneSourceAccountId || !state.cloneSourceCampaignId) {
      state.clonePackageLoading = false;
      return null;
    }
    const currentKey = `${state.cloneSourceAccountId}:${state.cloneSourceCampaignId}`;
    const cachedKey = state.clonePackage
      ? `${state.clonePackage.source?.accountId || ""}:${state.clonePackage.source?.campaignId || ""}`
      : "";
    if (currentKey === cachedKey) {
      state.clonePackageLoading = true;
      renderCloneMappings();
      await refreshCloneTargetContext();
      state.clonePackageLoading = false;
      renderCloneMappings();
      return state.clonePackage;
    }
    setBusy(true);
    state.clonePackageLoading = true;
    renderCloneMappings();
    try {
      await initializeSession();
      const existingPageMappings = { ...state.clonePageMappings };
      const existingPixelMappings = { ...state.clonePixelMappings };
      const existingCatalogMappings = { ...state.cloneCatalogMappings };
      await refreshCloneSourceContext();
      state.clonePackage = await fetchCampaignExportPackage(state.cloneSourceAccountId, state.cloneSourceCampaignId);
      const sourceCampaignName = state.clonePackage.campaign?.name || state.clonePackage.source?.campaignName || "";
      state.cloneCampaignName = buildDefaultCloneCampaignName(sourceCampaignName);
      state.clonePageMappings = existingPageMappings;
      state.clonePixelMappings = existingPixelMappings;
      state.cloneCatalogMappings = existingCatalogMappings;
      enforceCloneModeConstraints();
      if (dom.cloneCampaignName) {
        dom.cloneCampaignName.value = state.cloneCampaignName;
      }
      await refreshCloneTargetContext();
      renderCloneMappings();
      log("info", `Clone package loaded: ${state.clonePackage.source?.campaignName || state.cloneSourceCampaignId}`);
      return state.clonePackage;
    } catch (error) {
      state.clonePackage = null;
      log("error", "Failed to load clone package.", String(error));
      throw error;
    } finally {
      state.clonePackageLoading = false;
      renderCloneMappings();
      setBusy(false);
    }
  }

  async function buildMediaFilesFromPackage(packageData) {
    const files = new Map();
    for (const file of packageData?._downloadQueue || []) {
      log("info", `Preparing server-side media copy for ${file.fileName}...`);
      files.set(file.fileName, createRemoteMediaFile(file));
    }
    return files;
  }

  function withManualSourceCatalog(packageData) {
    if (!packageData || !state.cloneManualSourceCatalogId) {
      return packageData;
    }
    if (getSourceCatalogsFromPackage(packageData).length) {
      return packageData;
    }
    const sourceCatalog = state.cloneSourceCatalogs.find((item) => item.id === state.cloneManualSourceCatalogId)
      || { id: state.cloneManualSourceCatalogId, name: state.cloneManualSourceCatalogId };
    return {
      ...packageData,
      catalogs: [{
        id: sourceCatalog.id,
        name: sourceCatalog.name || sourceCatalog.id,
        manual: true,
      }],
    };
  }

  function snapshotImportState() {
    return {
      importAccountId: state.importAccountId,
      importPackage: state.importPackage,
      importMediaFiles: new Map(state.importMediaFiles),
      importMediaOverrides: new Map(state.importMediaOverrides),
      importPageMappings: { ...state.importPageMappings },
      importPixelMappings: { ...state.importPixelMappings },
      importCatalogMappings: { ...state.importCatalogMappings },
      importCampaignName: state.importCampaignName,
      importAsDraft: state.importAsDraft,
      importStatus: state.importStatus,
      importPreserveSchedule: state.importPreserveSchedule,
    };
  }

  async function restoreImportState(snapshot) {
    state.importAccountId = snapshot.importAccountId;
    applyPackageToImportState(snapshot.importPackage, {
      campaignName: snapshot.importCampaignName,
      pageMappings: snapshot.importPageMappings,
      pixelMappings: snapshot.importPixelMappings,
      catalogMappings: snapshot.importCatalogMappings,
      mediaFiles: snapshot.importMediaFiles,
      mediaOverrides: snapshot.importMediaOverrides,
      asDraft: snapshot.importAsDraft,
      status: snapshot.importStatus,
      preserveSchedule: snapshot.importPreserveSchedule,
    });
    if (state.importAccountId) {
      await refreshImportAccountContext();
    } else {
      state.pages = [];
      state.importAccountPixels = [];
      state.importTargetBusiness = null;
      state.importTargetCatalogs = [];
    }
    renderUI();
  }

  async function cloneCampaignToAccount(options = {}) {
    const cloneOptions = normalizeImportOptions(options);
    if (!state.cloneSourceAccountId || !state.cloneSourceCampaignId || !state.cloneTargetAccountId) {
      log("warn", "Select source account, source campaign, and target account first.");
      return;
    }
    setBusy(true);
    const importSnapshot = snapshotImportState();
    let shouldRestoreImportState = true;
    try {
      await initializeSession();
      if (dom.cloneCampaignName) {
        state.cloneCampaignName = dom.cloneCampaignName.value.trim();
      }
      const packageData = withManualSourceCatalog(await ensureClonePackageLoaded());
      const mediaFiles = await buildMediaFilesFromPackage(packageData);
      state.importAccountId = state.cloneTargetAccountId;
      applyPackageToImportState(packageData, {
        campaignName: state.cloneCampaignName || packageData.campaign?.name || packageData.source?.campaignName || "",
        pageMappings: state.clonePageMappings,
        pixelMappings: state.clonePixelMappings,
        catalogMappings: state.cloneCatalogMappings,
        mediaFiles,
        mediaOverrides: new Map(),
        asDraft: state.cloneAsDraft,
        status: state.cloneAsDraft ? "PAUSED" : state.cloneStatus,
        preserveSchedule: true,
      });
      await refreshImportAccountContext();
      log("info", `Clone started: ${packageData.source?.campaignName || state.cloneSourceCampaignId} -> ${state.cloneTargetAccountId}`);
      const success = await importPackage({
        pageMappings: state.clonePageMappings,
        pixelMappings: state.clonePixelMappings,
        catalogMappings: state.cloneCatalogMappings,
        reloadOnSuccess: cloneOptions.reloadOnSuccess !== false,
      });
      if (success) {
        log("info", "Clone pipeline finished.");
      } else {
        log("warn", "Clone pipeline stopped because import did not complete successfully.");
      }
      shouldRestoreImportState = !success;
    } catch (error) {
      log("error", "Clone error.", String(error));
    } finally {
      if (shouldRestoreImportState) {
        await restoreImportState(importSnapshot);
      }
      setBusy(false);
    }
  }

  async function handleImportJsonSelected(event) {
    const file = event.target.files && event.target.files[0] ? event.target.files[0] : null;
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data || typeof data !== "object" || !data.campaign || !Array.isArray(data.adsets) || !Array.isArray(data.ads) || !Array.isArray(data.creatives)) {
        throw new Error("JSON format does not match export package.");
      }
      applyPackageToImportState(data, {
        campaignName: data.campaign?.name || data.source?.campaignName || "",
        pageMappings: {},
        pixelMappings: {},
        catalogMappings: {},
        mediaFiles: new Map(),
        mediaOverrides: new Map(),
        asDraft: state.importAsDraft,
        status: state.importStatus,
      });
      await refreshImportAccountContext();
      renderImportMappings();
      log("info", `JSON loaded: ${file.name}`);
    } catch (error) {
      log("error", "Error reading JSON.", String(error));
    }
  }

  async function handleImportMediaSelected(event) {
    const files = [...(event.target.files || [])];
    state.importMediaFiles = new Map(files.map((file) => [file.name, file]));
    renderImportMappings();
    log("info", `Media files loaded: ${files.length}`);
  }

  function getKnownPageRecord(pageId) {
    const normalizedPageId = String(pageId || "");
    const known =
      state.pages.find((item) => item.id === normalizedPageId)
      || state.clonePages.find((item) => item.id === normalizedPageId)
      || (Array.isArray(state.accessiblePagesCache)
        ? state.accessiblePagesCache.find((item) => item.id === normalizedPageId)
        : null);
    if (known) {
      return known;
    }
    return {
      id: normalizedPageId,
      name: normalizedPageId,
      instagramId: "",
      accessToken: "",
      threadsUserId: "",
    };
  }

  async function fetchInstagramIdentityForPageRecord(page, accountId = "") {
    if (!page) {
      return {
        instagramUserId: "",
        instagramActorId: "",
        threadsUserId: "",
        source: "",
      };
    }
    const savedHint = getPageIdentityHint(page.id);
    if (page.instagramIdentity) {
      return page.instagramIdentity;
    }

    if (
      savedHint?.source === "AdsInstagramUsernameDataManager"
      && savedHint.instagramUserId
      && savedHint.instagramActorId
      && String(savedHint.instagramUserId) !== String(savedHint.instagramActorId)
    ) {
      return {
        instagramUserId: String(savedHint.instagramUserId),
        instagramActorId: String(savedHint.instagramActorId),
        threadsUserId: String(savedHint.threadsUserId || page.threadsUserId || ""),
        source: "AdsInstagramUsernameDataManager",
      };
    }

    page.instagramIdentity = {
      instagramUserId: "",
      instagramActorId: "",
      threadsUserId: String(page.threadsUserId || ""),
      source: "",
    };
    return page.instagramIdentity;
  }

  async function ensurePageIdentityProfiles(pageId, itemName, accountId = "") {
    const page = getKnownPageRecord(pageId);
    if (page.identityProvisionPromise) {
      return page.identityProvisionPromise;
    }
    page.identityProvisionPromise = (async () => {
      if (page.instagramIdentity?.instagramUserId && page.instagramIdentity?.instagramActorId) {
        return page.instagramIdentity;
      }
      try {
        const response = await privateGraphqlMutation("25221386390872351", "AdsPageInstagramAccountMutation", {
          page_id: String(pageId),
        });
        const returnedInstagramId = String(
          response?.data?.xfb_create_page_backed_instagram_accounts?.iguser_v2_id
          || response?.data?.xfb_create_page_backed_instagram_account?.iguser_v2_id
          || "",
        );
        if (!returnedInstagramId) {
          throw new Error("AdsPageInstagramAccountMutation did not return iguser_v2_id.");
        }
        const instagramObject = await fetchAdsManagerInstagramObjectRecord(returnedInstagramId, accountId);
        const identityHint = buildIdentityHintFromInstagramObject(instagramObject);
        if (!identityHint) {
          throw new Error(`AdsInstagramUsernameDataManager did not return distinct id/legacy_instagram_user_id for ${returnedInstagramId}.`);
        }
        if (identityHint.threadsUserId) {
          page.threadsUserId = identityHint.threadsUserId;
        }
        page.instagramIdentity = {
          instagramUserId: String(identityHint.instagramUserId || ""),
          instagramActorId: String(identityHint.instagramActorId || ""),
          threadsUserId: String(identityHint.threadsUserId || page.threadsUserId || ""),
          source: "AdsInstagramUsernameDataManager",
        };
        savePageIdentityHint(pageId, identityHint);
        return page.instagramIdentity;
      } catch (error) {
        log("warn", `Failed to ensure Instagram profile for page ${pageId}${itemName ? ` (${itemName})` : ""}.`, String(error || ""));
        page.instagramIdentity = {
          instagramUserId: "",
          instagramActorId: "",
          threadsUserId: String(page.threadsUserId || ""),
          source: "",
        };
        return page.instagramIdentity;
      }
    })().finally(() => {
      page.identityProvisionPromise = null;
    });
    return page.identityProvisionPromise;
  }

  async function resolveInstagramIdentityForPage(pageId, accountId = "") {
    const page = getKnownPageRecord(pageId);
    return fetchInstagramIdentityForPageRecord(page, accountId);
  }

  async function applyInstagramIdentity(osp, pageId, itemName, accountId = "") {
    osp.page_id = pageId;
    const existingInstagramUserId = String(osp.instagram_user_id || "");
    const existingInstagramActorId = String(osp.instagram_actor_id || "");
    const existingThreadsUserId = String(osp.threads_user_id || osp.th_user_id || "");
    const identity = await ensurePageIdentityProfiles(pageId, itemName, accountId);
    if (identity.instagramUserId) {
      osp.instagram_user_id = identity.instagramUserId;
    } else if (existingInstagramUserId) {
      osp.instagram_user_id = existingInstagramUserId;
    } else {
      delete osp.instagram_user_id;
    }
    if (identity.instagramActorId) {
      osp.instagram_actor_id = identity.instagramActorId;
    } else if (existingInstagramActorId && existingInstagramActorId !== existingInstagramUserId) {
      osp.instagram_actor_id = existingInstagramActorId;
    } else {
      delete osp.instagram_actor_id;
    }
    if (osp.instagram_actor_id && String(osp.instagram_actor_id) === String(osp.instagram_user_id || "")) {
      delete osp.instagram_actor_id;
    }
    if (Object.prototype.hasOwnProperty.call(osp, "threads_user_id")) {
      if (identity.threadsUserId) {
        osp.threads_user_id = identity.threadsUserId;
      } else if (existingThreadsUserId) {
        osp.threads_user_id = existingThreadsUserId;
      } else {
        delete osp.threads_user_id;
      }
    }
    if (Object.prototype.hasOwnProperty.call(osp, "th_user_id")) {
      if (identity.threadsUserId) {
        osp.th_user_id = identity.threadsUserId;
      } else if (existingThreadsUserId) {
        osp.th_user_id = existingThreadsUserId;
      } else {
        delete osp.th_user_id;
      }
    }
    const hasUsableInstagramIdentity = Boolean(osp.instagram_user_id) && Boolean(osp.instagram_actor_id);
    if (!hasUsableInstagramIdentity && itemName) {
      log("warn", `Page ${pageId} has no accessible Instagram identity for ${itemName}.`);
    }
    return identity;
  }

  function stripUnsupportedInstagramEnhancements(raw, identity, itemName) {
    const afs = raw?.asset_feed_spec;
    if (!afs || !Array.isArray(afs.audios) || !afs.audios.length) {
      return;
    }
    const hasFullInstagramAccount =
      identity?.source === "instagram_business_account"
      || identity?.source === "connected_instagram_account";
    if (hasFullInstagramAccount) {
      return;
    }
    delete afs.audios;
    if (!Object.keys(afs).length) {
      delete raw.asset_feed_spec;
    }
    log("warn", `Removed asset_feed_spec.audios for ${itemName}: current page has no linked professional Instagram account.`);
  }

  function getAssetFeedFallbackTemplate(excludeCreativeId, mediaType) {
    const creatives = state.importPackage?.creatives || [];
    for (const candidate of creatives) {
      if (String(candidate?.id || "") === String(excludeCreativeId || "")) {
        continue;
      }
      const afs = candidate?.raw?.asset_feed_spec;
      if (!afs) {
        continue;
      }
      if (mediaType === "image" && Array.isArray(afs.images) && afs.images.length) {
        return deepClone(afs);
      }
      if (mediaType === "video" && Array.isArray(afs.videos) && afs.videos.length) {
        return deepClone(afs);
      }
    }
    return null;
  }

  async function buildDraftAssetFeedFallbackFromLinkData(accountId, creative, raw, mediaCache) {
    const linkData = raw?.object_story_spec?.link_data;
    if (!linkData?.image_hash) {
      return null;
    }

    const template = getAssetFeedFallbackTemplate(creative.id, "image");
    const slot = getCreativeMediaSlots(creative).find((item) => item.type === "image");
    const mediaFile = slot ? getDefaultMediaFile(slot) : null;
    let uploadedHash = String(linkData.image_hash);
    if (mediaFile) {
      uploadedHash = mediaCache.images.get(mediaFile.name);
      if (!uploadedHash) {
        log("info", `Uploading image ${mediaFile.name}...`);
        uploadedHash = await uploadImage(accountId, mediaFile);
        mediaCache.images.set(mediaFile.name, uploadedHash);
      }
    }

    if (!template) {
      const objectStorySpec = deepClone(raw.object_story_spec || {});
      objectStorySpec.link_data = {
        ...deepClone(linkData),
        image_hash: uploadedHash,
      };
      delete objectStorySpec.video_data;
      log("info", `Creative ${creative.name}: rebuilt unsupported audio-only draft into object_story_spec fallback.`);
      return appendCreativeUrlTags({
        name: raw.name || creative.name,
        object_story_spec: objectStorySpec,
      }, raw);
    }

    const ctaType = String(
      linkData.call_to_action?.type
      || template.call_to_actions?.[0]?.type
      || template.call_to_action_types?.[0]
      || "LEARN_MORE",
    );
    const websiteUrl = String(linkData.link || template.link_urls?.[0]?.website_url || "");
    const displayUrl = String(linkData.caption || template.link_urls?.[0]?.display_url || "");
    const titleText = String(
      raw.title
      || linkData.name
      || linkData.caption
      || template.titles?.[0]?.text
      || "",
    );
    const bodyText = String(linkData.message || template.bodies?.[0]?.text || "");
    const descriptionText = String(linkData.description || template.descriptions?.[0]?.text || "");

    const assetFeedSpec = deepClone(template);
    delete assetFeedSpec.audios;
    assetFeedSpec.images = (Array.isArray(assetFeedSpec.images) && assetFeedSpec.images.length
      ? assetFeedSpec.images
      : [{ hash: uploadedHash }])
      .map((image) => ({
        ...image,
        hash: uploadedHash,
      }));
    delete assetFeedSpec.videos;

    assetFeedSpec.bodies = (Array.isArray(assetFeedSpec.bodies) && assetFeedSpec.bodies.length
      ? assetFeedSpec.bodies
      : [{ text: "" }])
      .map((entry) => ({
        ...entry,
        text: bodyText,
      }));
    assetFeedSpec.descriptions = (Array.isArray(assetFeedSpec.descriptions) && assetFeedSpec.descriptions.length
      ? assetFeedSpec.descriptions
      : [{ text: "" }])
      .map((entry) => ({
        ...entry,
        text: descriptionText,
      }));
    assetFeedSpec.titles = (Array.isArray(assetFeedSpec.titles) && assetFeedSpec.titles.length
      ? assetFeedSpec.titles
      : [{ text: "" }])
      .map((entry) => ({
        ...entry,
        text: titleText,
      }));
    assetFeedSpec.link_urls = (Array.isArray(assetFeedSpec.link_urls) && assetFeedSpec.link_urls.length
      ? assetFeedSpec.link_urls
      : [{ website_url: "", display_url: "" }])
      .map((entry) => ({
        ...entry,
        website_url: websiteUrl,
        display_url: displayUrl,
      }));
    assetFeedSpec.call_to_action_types = [ctaType];
    assetFeedSpec.call_to_actions = [{
      ...(assetFeedSpec.call_to_actions?.[0] || {}),
      type: ctaType,
    }];

    const objectStorySpec = deepClone(raw.object_story_spec || {});
    delete objectStorySpec.link_data;
    delete objectStorySpec.video_data;

    log("info", `Creative ${creative.name}: rebuilt unsupported link_data draft into asset_feed_spec fallback.`);
    return appendCreativeUrlTags({
      object_story_spec: objectStorySpec,
      asset_feed_spec: assetFeedSpec,
    }, raw);
  }

  async function replaceAssetFeedMedia(accountId, creative, osp, afs, mediaCache) {
    const fnMap = state.importPackage?.fileNameMap;
    if (Array.isArray(afs.images)) {
      for (const img of afs.images) {
        if (!img.hash) continue;
        const oldHash = String(img.hash);
        const originalKey = `${oldHash}.jpg`;
        const mediaFile = resolveImportedMediaFile(`${creative.id}:afs_image_${afs.images.indexOf(img)}`, originalKey, fnMap);
        if (mediaFile) {
          const uploaded = await uploadImageAsset(accountId, mediaFile, mediaCache);
          img.hash = uploaded.hash;
        }
      }
    }

    if (Array.isArray(afs.videos)) {
      for (const vid of afs.videos) {
        if (!vid.video_id) continue;
        const oldVideoId = String(vid.video_id);
        const videoIndex = afs.videos.indexOf(vid);
        const originalKey = `${oldVideoId}.mp4`;
        const mediaFile = resolveImportedMediaFile(`${creative.id}:afs_video_${videoIndex}`, originalKey, fnMap);
        if (mediaFile) {
          let newId = mediaCache.videos.get(mediaFile.name);
          if (!newId) {
            log("info", `Uploading video ${mediaFile.name}...`);
            newId = await uploadVideo(accountId, mediaFile);
            mediaCache.videos.set(mediaFile.name, newId);
          }
          vid.video_id = newId;
          const previewOriginalKey = getVideoThumbnailOriginalName(oldVideoId, extractMediaExtensionFromUrl(vid.thumbnail_url, ".jpg"));
          const previewFile = resolveImportedMediaFile(`${creative.id}:afs_video_thumb_${videoIndex}`, previewOriginalKey, fnMap);
          if (previewFile) {
            const uploadedPreview = await uploadImageAsset(accountId, previewFile, mediaCache);
            if (uploadedPreview.url) {
              vid.thumbnail_url = uploadedPreview.url;
            }
            vid.thumbnail_hash = uploadedPreview.hash;
            vid.thumbnail_source = "custom";
          } else {
            vid.thumbnail_url = await getPreferredVideoThumbnail(newId);
            delete vid.thumbnail_hash;
            vid.thumbnail_source = "generated_default";
          }
        }
      }
    }

    if (osp.video_data?.video_id) {
      const oldVideoId = String(osp.video_data.video_id);
      const originalKey = `${oldVideoId}.mp4`;
      const mediaFile = resolveImportedMediaFile(`${creative.id}:video`, originalKey, fnMap);
      if (mediaFile) {
        let newId = mediaCache.videos.get(mediaFile.name);
        if (!newId) {
          log("info", `Uploading video ${mediaFile.name}...`);
          newId = await uploadVideo(accountId, mediaFile);
          mediaCache.videos.set(mediaFile.name, newId);
        }
        if (!osp.video_data) {
          osp.video_data = {};
        }
        osp.video_data.video_id = newId;
        const previewOriginalKey = getVideoThumbnailOriginalName(oldVideoId, extractMediaExtensionFromUrl(osp.video_data.image_url, ".jpg"));
        const previewFile = resolveImportedMediaFile(`${creative.id}:video_preview`, previewOriginalKey, fnMap);
        if (previewFile) {
          const uploadedPreview = await uploadImageAsset(accountId, previewFile, mediaCache);
          osp.video_data.image_hash = uploadedPreview.hash;
          delete osp.video_data.image_url;
          osp.video_data.video_thumbnail_source = "custom";
        } else {
          delete osp.video_data.image_hash;
          osp.video_data.image_url = await getPreferredVideoThumbnail(newId);
          osp.video_data.video_thumbnail_source = "generated_default";
        }
      }
    } else if (osp.link_data?.image_hash) {
      const oldHash = String(osp.link_data.image_hash);
      const originalKey = `${oldHash}.jpg`;
      const mediaFile = resolveImportedMediaFile(`${creative.id}:image`, originalKey, fnMap);
      if (mediaFile) {
        const uploaded = await uploadImageAsset(accountId, mediaFile, mediaCache);
        if (!osp.link_data) {
          osp.link_data = {};
        }
        osp.link_data.image_hash = uploaded.hash;
      }
    }
  }

  async function createPixel(accountId, sourcePixelId, campaignName) {
    // If account already has pixels, use the first one
    if (state.importAccountPixels.length > 0) {
      const existing = state.importAccountPixels[0];
      log("info", `Using existing pixel ${existing.id} for source ${sourcePixelId}.`);
      return String(existing.id);
    }
    const name = `Imported_${sanitizeFileName(campaignName || "campaign")}_${sourcePixelId}`;
    try {
      const created = await graphFetch(`act_${accountId}/adspixels`, {
        method: "POST",
        body: { name },
      });
      invalidateAccountContextCache(accountId);
      log("info", `Created new pixel ${created.id} for source ${sourcePixelId}.`);
      return String(created.id);
    } catch (err) {
      // If pixel already exists, reload and use it
      const pixels = await graphFetch(`act_${accountId}/adspixels`, {
        query: { fields: "id,name", limit: 10 },
      });
      if (pixels.data?.[0]?.id) {
        log("info", `Pixel already exists on account. Using ${pixels.data[0].id} for source ${sourcePixelId}.`);
        return String(pixels.data[0].id);
      }
      throw err;
    }
  }

  function normalizeScheduleValue(value, fallbackFutureDays, options = {}) {
    const preservePast = Boolean(options.preservePast);
    const buildFutureIso = (days) => {
      const offsetMs = days
        ? days * 86400000
        : 5 * 60 * 1000;
      return new Date(Date.now() + offsetMs).toISOString();
    };
    if (!value) {
      if (fallbackFutureDays) {
        return buildFutureIso(fallbackFutureDays);
      }
      return "";
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "";
    if (parsed.getUTCFullYear() <= 1970) {
      return "";
    }
    if (parsed.getTime() < Date.now() - 60_000) {
      if (preservePast) {
        return value;
      }
      if (fallbackFutureDays) {
        return buildFutureIso(fallbackFutureDays);
      }
      return buildFutureIso(0);
    }
    return value;
  }

  function parseScheduleDate(value) {
    if (!value) {
      return null;
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime()) || date.getUTCFullYear() <= 1970) {
      return null;
    }
    return date;
  }

  function buildShiftedScheduleWindow(sourceStart, sourceEnd, options = {}) {
    const requireEnd = Boolean(options.requireEnd);
    const anchor = options.anchor instanceof Date
      ? new Date(options.anchor.getTime())
      : new Date(Date.now() + 5 * 60 * 1000);
    const start = parseScheduleDate(sourceStart);
    const end = parseScheduleDate(sourceEnd);
    const result = {
      start: "",
      end: "",
    };

    if (start || end || requireEnd) {
      result.start = anchor.toISOString();
    }

    if (end && start && end.getTime() > start.getTime()) {
      let durationMs = end.getTime() - start.getTime();
      if (requireEnd) {
        durationMs = Math.max(durationMs, 25 * 60 * 60 * 1000);
      }
      result.end = new Date(anchor.getTime() + durationMs).toISOString();
    } else if (requireEnd) {
      result.end = new Date(anchor.getTime() + 30 * 86400000).toISOString();
    } else if (end && !start) {
      result.end = new Date(anchor.getTime() + 30 * 86400000).toISOString();
    }

    return result;
  }

  function shiftPackageScheduleForImport(packageData) {
    if (!packageData || !state.importPreserveSchedule) {
      return packageData;
    }
    const next = deepClone(packageData);
    const nowAnchor = new Date(Date.now() + 5 * 60 * 1000);
    const sourceCampaign = packageData.campaign || {};
    const targetCampaign = next.campaign || {};
    const campaignUsesLifetime = hasPositiveBudget(sourceCampaign.lifetime_budget);
    const campaignWindow = buildShiftedScheduleWindow(sourceCampaign.start_time, sourceCampaign.stop_time, {
      anchor: nowAnchor,
      requireEnd: campaignUsesLifetime,
    });

    if (campaignWindow.start) {
      targetCampaign.start_time = campaignWindow.start;
    }
    if (campaignWindow.end) {
      targetCampaign.stop_time = campaignWindow.end;
    } else if (state.importPreserveSchedule && sourceCampaign.stop_time) {
      delete targetCampaign.stop_time;
    }

    next.adsets = (next.adsets || []).map((adset, index) => {
      const sourceAdset = packageData.adsets?.[index] || {};
      const shifted = deepClone(adset);
      const adsetUsesLifetime = hasPositiveBudget(sourceAdset.lifetime_budget) || campaignUsesLifetime;
      const adsetWindow = buildShiftedScheduleWindow(
        sourceAdset.start_time || sourceCampaign.start_time,
        sourceAdset.end_time || sourceCampaign.stop_time,
        {
          anchor: nowAnchor,
          requireEnd: adsetUsesLifetime,
        },
      );
      if (adsetWindow.start) {
        shifted.start_time = adsetWindow.start;
      }
      if (adsetWindow.end) {
        shifted.end_time = adsetWindow.end;
      } else if (sourceAdset.end_time) {
        delete shifted.end_time;
      }
      return shifted;
    });

    return next;
  }

  function cleanTargeting(targeting, itemName) {
    if (!targeting || typeof targeting !== "object") return targeting;
    const next = deepClone(targeting);
    if (next.custom_audiences) {
      delete next.custom_audiences;
      log("warn", `Removed custom_audiences from targeting for ${itemName}.`);
    }
    if (next.excluded_custom_audiences) {
      delete next.excluded_custom_audiences;
      log("warn", `Removed excluded_custom_audiences from targeting for ${itemName}.`);
    }
    return next;
  }

  function getAdImageHashFromResponse(json, fileName) {
    if (json?.hash) {
      return String(json.hash);
    }
    const images = json?.images || {};
    const direct = fileName ? images[fileName] : null;
    const first = direct || images[Object.keys(images)[0]];
    if (first?.hash) {
      return String(first.hash);
    }
    if (typeof first?.id === "string" && first.id.includes(":")) {
      return first.id.split(":").pop();
    }
    return "";
  }

  function getFileExtension(fileName) {
    const match = String(fileName || "").match(/(\.[a-z0-9]{1,8})$/i);
    return match ? match[1].toLowerCase() : "";
  }

  function replaceFileExtension(fileName, extension) {
    const safeExtension = String(extension || "").startsWith(".") ? String(extension) : `.${extension}`;
    const name = String(fileName || "image");
    return getFileExtension(name) ? name.replace(/(\.[a-z0-9]{1,8})$/i, safeExtension) : `${name}${safeExtension}`;
  }

  function shouldTranscodeImageForMeta(file) {
    if (!file || isRemoteMediaFile(file)) {
      return false;
    }
    const fileName = getMediaFileName(file);
    return String(file.type || "").toLowerCase() === "image/webp" || getFileExtension(fileName) === ".webp";
  }

  function loadImageElementFromBlob(blob) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Failed to decode image."));
      };
      image.src = url;
    });
  }

  async function transcodeImageFileForMeta(file) {
    if (!shouldTranscodeImageForMeta(file)) {
      return file;
    }
    const image = await loadImageElementFromBlob(file);
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;
    if (!canvas.width || !canvas.height) {
      throw new Error(`Cannot convert ${getMediaFileName(file)}: empty image dimensions.`);
    }
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error(`Cannot convert ${getMediaFileName(file)}: canvas is unavailable.`);
    }
    context.drawImage(image, 0, 0);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    if (!blob) {
      throw new Error(`Cannot convert ${getMediaFileName(file)} to JPEG.`);
    }
    const nextName = replaceFileExtension(getMediaFileName(file), ".jpg");
    log("info", `Converted ${getMediaFileName(file)} to ${nextName} for Meta image upload.`);
    return new File([blob], nextName, {
      type: "image/jpeg",
      lastModified: file.lastModified || Date.now(),
    });
  }

  async function tryUploadRemoteImageCopy(accountId, file) {
    if (!file.sourceAccountId || !file.sourceId) {
      return "";
    }
    const json = await graphFetch(`act_${accountId}/adimages`, {
      method: "POST",
      body: {
        name: getMediaFileName(file),
        copy_from: {
          source_account_id: String(file.sourceAccountId).replace(/^act_/, ""),
          hash: String(file.sourceId),
        },
      },
    });
    return getAdImageHashFromResponse(json, getMediaFileName(file));
  }

  async function tryUploadRemoteImageUrl(accountId, file) {
    if (!file.sourceUrl) {
      return "";
    }
    const json = await graphFetch(`act_${accountId}/adimages`, {
      method: "POST",
      body: {
        name: getMediaFileName(file),
        url: file.sourceUrl,
      },
    });
    return getAdImageHashFromResponse(json, getMediaFileName(file));
  }

  async function downloadRemoteMediaAsFile(file) {
    if (!file.sourceUrl) {
      throw new Error("No source URL.");
    }
    const blob = await downloadFile(file.sourceUrl, getMediaFileName(file));
    return new File([blob], getMediaFileName(file), {
      type: blob.type || (file.type === "video" ? "video/mp4" : "image/jpeg"),
    });
  }

  async function uploadRemoteImageViaBrowser(accountId, file) {
    const downloaded = await downloadRemoteMediaAsFile(file);
    return uploadImage(accountId, downloaded);
  }

  async function uploadRemoteImage(accountId, file) {
    const failures = [];
    try {
      const hash = await tryUploadRemoteImageCopy(accountId, file);
      if (hash) {
        log("info", `Copied image ${getMediaFileName(file)} through Meta copy_from.`);
        return hash;
      }
    } catch (error) {
      failures.push(`copy_from: ${String(error?.message || error)}`);
    }
    try {
      const hash = await tryUploadRemoteImageUrl(accountId, file);
      if (hash) {
        log("info", `Copied image ${getMediaFileName(file)} through Meta URL import.`);
        return hash;
      }
    } catch (error) {
      failures.push(`url: ${String(error?.message || error)}`);
    }
    try {
      const hash = await uploadRemoteImageViaBrowser(accountId, file);
      if (hash) {
        log("info", `Copied image ${getMediaFileName(file)} through browser download fallback.`);
        return hash;
      }
    } catch (error) {
      failures.push(`browser_download: ${String(error?.message || error)}`);
    }
    throw new Error(`Remote image copy failed for ${getMediaFileName(file)}. ${failures.join(" | ")}`);
  }

  async function uploadImage(accountId, file) {
    if (isRemoteMediaFile(file)) {
      return uploadRemoteImage(accountId, file);
    }
    const uploadFile = await transcodeImageFileForMeta(file);
    const formData = new FormData();
    formData.append("image_name", uploadFile, uploadFile.name);
    const json = await graphFetch(`act_${accountId}/adimages`, {
      method: "POST",
      formData,
    });
    const entry = json.images?.[uploadFile.name];
    if (!entry?.hash) {
      throw new Error(`Facebook did not return hash for ${uploadFile.name}.`);
    }
    return String(entry.hash);
  }

  async function uploadRemoteVideo(accountId, file) {
    if (!file.sourceUrl) {
      throw new Error(`Remote video copy failed for ${getMediaFileName(file)}: no source URL.`);
    }
    const failures = [];
    try {
      const json = await graphFetch(`act_${accountId}/advideos`, {
        method: "POST",
        query: { fields: "picture" },
        body: {
          title: getMediaFileName(file),
          file_url: file.sourceUrl,
        },
      });
      if (!json.id) {
        throw new Error("Facebook did not return video id.");
      }
      const videoId = String(json.id);
      await waitForUploadedVideoProcessing(videoId);
      log("info", `Copied video ${getMediaFileName(file)} through Meta URL import.`);
      return videoId;
    } catch (error) {
      failures.push(`file_url: ${String(error?.message || error)}`);
    }
    try {
      const downloaded = await downloadRemoteMediaAsFile(file);
      const videoId = await uploadVideo(accountId, downloaded);
      log("info", `Copied video ${getMediaFileName(file)} through browser download fallback.`);
      return videoId;
    } catch (error) {
      failures.push(`browser_download: ${String(error?.message || error)}`);
    }
    throw new Error(`Remote video copy failed for ${getMediaFileName(file)}. ${failures.join(" | ")}`);
  }

  async function uploadVideo(accountId, file) {
    if (isRemoteMediaFile(file)) {
      return uploadRemoteVideo(accountId, file);
    }
    const formData = new FormData();
    formData.append("source", file, file.name);
    const json = await graphFetch(`act_${accountId}/advideos`, {
      method: "POST",
      query: { fields: "picture" },
      formData,
    });
    if (!json.id) {
      throw new Error(`Facebook did not return video id for ${file.name}.`);
    }
    const videoId = String(json.id);
    await waitForUploadedVideoProcessing(videoId);
    return videoId;
  }

  async function getAdImageUrlByHash(accountId, imageHash) {
    if (!imageHash) {
      return "";
    }
    const images = await graphFetch(`act_${accountId}/adimages`, {
      query: {
        hashes: [String(imageHash)],
        fields: "hash,url,permalink_url",
      },
    });
    const image = images.data?.[0];
    return image?.url || image?.permalink_url || "";
  }

  async function uploadImageAsset(accountId, file, mediaCache) {
    const fileName = getMediaFileName(file);
    let hash = mediaCache.images.get(fileName);
    if (!hash) {
      log("info", `Uploading image ${fileName}...`);
      hash = await uploadImage(accountId, file);
      mediaCache.images.set(fileName, hash);
    }
    let url = mediaCache.imageUrls?.get(String(hash)) || "";
    if (!url) {
      url = await getAdImageUrlByHash(accountId, hash);
      if (!mediaCache.imageUrls) {
        mediaCache.imageUrls = new Map();
      }
      if (url) {
        mediaCache.imageUrls.set(String(hash), url);
      }
    }
    return { hash, url };
  }

  function resolveImportedMediaFile(mediaKey, originalKey, fnMap = state.importPackage?.fileNameMap) {
    const mappedKey = (fnMap && fnMap[originalKey]) || originalKey;
    return state.importMediaOverrides.get(mediaKey)
      || state.importMediaOverrides.get(getSharedMediaOverrideKey(mappedKey))
      || state.importMediaOverrides.get(getSharedMediaOverrideKey(originalKey))
      || state.importMediaFiles.get(mappedKey)
      || state.importMediaFiles.get(originalKey)
      || null;
  }

  async function getVideoProcessingSnapshot(videoId) {
    try {
      return await graphFetch(videoId, {
        query: { fields: "status,picture,thumbnails" },
      });
    } catch (error) {
      const text = String(error || "");
      if (/nonexisting field \(status\)/i.test(text)) {
        return graphFetch(videoId, {
          query: { fields: "picture,thumbnails" },
        });
      }
      throw error;
    }
  }

  async function waitForUploadedVideoProcessing(videoId) {
    let thumbnailEvidenceCount = 0;
    for (let attempt = 1; attempt <= 24; attempt += 1) {
      const json = await getVideoProcessingSnapshot(videoId);
      const thumbs = json.thumbnails?.data || [];
      const preferred = thumbs.find((item) => item.is_preferred) || thumbs[0];
      const states = [
        json?.status?.video_status,
        json?.status?.processing_phase?.status,
        json?.status?.publishing_phase?.status,
      ]
        .map((value) => String(value || "").toLowerCase())
        .filter(Boolean);

      if (states.some((value) => /error|fail|rejected/.test(value))) {
        throw new Error(`Video ${videoId} failed processing: ${states.join(", ")}`);
      }
      if (states.some((value) => /ready|complete|finished|published|success/.test(value))) {
        return json;
      }
      if (preferred?.uri || json?.picture) {
        thumbnailEvidenceCount += 1;
        if (thumbnailEvidenceCount >= 3) {
          return json;
        }
        log("warn", `Video ${videoId} has preview assets but may still be processing on Facebook, waiting 30s...`);
        await sleep(30000);
        continue;
      }

      log("warn", `Video ${videoId} uploaded but still processing on Facebook, waiting 30s...`);
      await sleep(30000);
    }
    throw new Error(`Video ${videoId} did not finish processing on Facebook in time.`);
  }

  async function getPreferredVideoThumbnail(videoId) {
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const json = await getVideoProcessingSnapshot(videoId);
      const thumbs = json.thumbnails?.data || [];
      const preferred = thumbs.find((item) => item.is_preferred) || thumbs[0];
      if (preferred?.uri) {
        return preferred.uri;
      }
      log("warn", `Video ${videoId} not ready yet, waiting for thumbnail...`);
      await sleep(30000);
    }
    throw new Error(`Failed to get thumbnail for video ${videoId}.`);
  }

  async function createCreativeByPostId(accountId, creative) {
    const json = await graphFetch(`act_${accountId}/adcreatives`, {
      method: "POST",
      body: {
        name: creative.name,
        object_story_id: creative.raw.object_story_id,
      },
    });
    return String(json.id);
  }

  async function validateObjectStorySpecCreative(accountId, creativeName, body, options = {}) {
    const retryVideoNotReady = Boolean(options.retryVideoNotReady);
    for (let attempt = 1; attempt <= 12; attempt += 1) {
      try {
        await graphFetch(`act_${accountId}/adcreatives`, {
          method: "POST",
          body: {
            ...body,
            execution_options: ["validate_only"],
          },
        });
        return true;
      } catch (error) {
        const subcode = getGraphErrorSubcode(error);
        if (subcode === 1487194) {
          log("warn", `Creative ${creativeName} skipped: target page cannot create this object_story_spec creative (1487194).`);
          return false;
        }
        if (retryVideoNotReady && isVideoNotReadyError(error)) {
          if (attempt === 12) {
            throw new Error(`Video creative ${creativeName} never became ready for validate_only.`);
          }
          log("warn", `Creative ${creativeName} not ready for validate_only yet, waiting 30s...`);
          await sleep(30000);
          continue;
        }
        throw error;
      }
    }
    return false;
  }

  async function createAdCreativeWithRetries(accountId, creativeName, body) {
    const retryVideoNotReady = creativePayloadHasVideo(body);
    if (!await validateObjectStorySpecCreative(accountId, creativeName, body, {
      retryVideoNotReady,
    })) {
      return null;
    }

    for (let attempt = 1; attempt <= 12; attempt += 1) {
      try {
        const json = await graphFetch(`act_${accountId}/adcreatives`, {
          method: "POST",
          body,
        });
        return String(json.id);
      } catch (error) {
        if (!retryVideoNotReady || !isVideoNotReadyError(error)) {
          throw error;
        }
        if (attempt === 12) {
          throw new Error(`Video creative ${creativeName} never became ready for adcreative.`);
        }
        log("warn", `Creative ${creativeName} not ready for adcreative yet, waiting 30s...`);
        await sleep(30000);
      }
    }
    return null;
  }

  async function validateDraftCreativePayload(accountId, creativeName, payload, options = {}) {
    if (!payload || typeof payload !== "object") {
      return true;
    }
    if (payload.object_story_id) {
      return true;
    }
    if (payload.product_set_id && payload.object_story_spec?.template_data) {
      log("info", `Skipping validate_only for catalog draft creative ${creativeName}: product_set_id payload is validated by draft fragment flow.`);
      return true;
    }
    if (!payload.object_story_spec && !payload.asset_feed_spec) {
      return true;
    }
    const validationPayload = buildCreativeValidationPayload(payload, creativeName);
    if (!validationPayload) {
      return true;
    }
    try {
      return await validateObjectStorySpecCreative(accountId, creativeName, validationPayload, {
        retryVideoNotReady: Boolean(options.forceVideoRetry) || creativePayloadHasVideo(payload),
      });
    } catch (error) {
      if (isDirectAdCreativeGateError(error)) {
        log("warn", `Skipping validate_only for draft creative ${creativeName}: Meta blocked direct adcreative validation with neko_direct_api_enable. Continuing with addraft_fragments flow.`);
        return true;
      }
      throw error;
    }
  }

  async function createImageCreative(accountId, creative, imageHash, mappedPageId) {
    const raw = deepClone(creative.raw);
    const osp = raw.object_story_spec || {};
    const linkData = osp.link_data || {};
    linkData.image_hash = imageHash;
    osp.link_data = linkData;
    await applyInstagramIdentity(osp, mappedPageId, raw.name || creative.name, accountId);
    raw.object_story_spec = osp;
    synchronizeCreativeIdentityFields(raw, osp);
    stripCreativePreviewIdentifiers(raw);
    const body = buildImportedCreativePayload(raw);
    body.name = raw.name || creative.name;
    return createAdCreativeWithRetries(accountId, raw.name || creative.name, body);
  }

  async function createVideoCreative(accountId, creative, uploadedVideoId, mappedPageId, customPreview = null) {
    const raw = deepClone(creative.raw);
    const osp = raw.object_story_spec || {};
    const videoData = osp.video_data || {};
    videoData.video_id = uploadedVideoId;
    if (customPreview?.hash) {
      videoData.image_hash = customPreview.hash;
      delete videoData.image_url;
      videoData.video_thumbnail_source = "custom";
    } else {
      delete videoData.image_hash;
      videoData.image_url = await getPreferredVideoThumbnail(uploadedVideoId);
      videoData.video_thumbnail_source = "generated_default";
    }
    osp.video_data = videoData;
    await applyInstagramIdentity(osp, mappedPageId, raw.name || creative.name, accountId);
    raw.object_story_spec = osp;
    synchronizeCreativeIdentityFields(raw, osp);
    stripCreativePreviewIdentifiers(raw);
    const body = buildImportedCreativePayload(raw);
    body.name = raw.name || creative.name;
    return createAdCreativeWithRetries(accountId, raw.name || creative.name, body);
  }

  async function resolveCreativeImport(accountId, creative, mediaCache) {
    const sourcePageId = getSourcePageId(creative);
    const mappedPageId = state.importPageMappings[sourcePageId] || sourcePageId;
    if (sourcePageId && !mappedPageId) {
      log("warn", `Creative ${creative.name} skipped: no replacement selected for FP ${sourcePageId} .`);
      return null;
    }
    if (sourcePageId && mappedPageId && mappedPageId !== sourcePageId) {
      log("info", `Creative ${creative.name}: remapping FP ${sourcePageId} -> ${mappedPageId}.`);
    }

    if (creative.raw.asset_feed_spec) {
      const raw = deepClone(creative.raw);
      replaceCreativePageReferences(raw, sourcePageId, mappedPageId);
      const osp = raw.object_story_spec || {};

      const identity = await applyInstagramIdentity(osp, mappedPageId, raw.name || creative.name, accountId);
      ensureDraftCreativeDestinationSpec(raw, getPageIdentityHint(mappedPageId)?.destinationSpec || null);
      stripUnsupportedInstagramEnhancements(raw, identity, raw.name || creative.name);
      const afs = raw.asset_feed_spec;
      if (!afs) {
        raw.object_story_spec = osp;
        creative = {
          ...creative,
          raw,
        };
      } else {
        await replaceAssetFeedMedia(accountId, creative, osp, afs, mediaCache);
        stripAssetFeedLabelIdsForImport(afs);
        const body = appendCreativeUrlTags({
          name: raw.name || creative.name,
          object_story_spec: osp,
          asset_feed_spec: afs,
        }, raw);
        return createAdCreativeWithRetries(accountId, raw.name || creative.name, body);
      }
    }

    if (creative.raw.object_story_id) {
      if (mappedPageId && mappedPageId !== sourcePageId) {
        log("warn", `Creative ${creative.name} skipped: object_story_id cannot be transferred to another FP.`);
        return null;
      }
      return createCreativeByPostId(accountId, creative);
    }

    if (isCatalogTemplateCreative(creative.raw)) {
      const raw = deepClone(creative.raw);
      replaceCreativePageReferences(raw, sourcePageId, mappedPageId);
      const osp = raw.object_story_spec || {};
      await applyInstagramIdentity(osp, mappedPageId, raw.name || creative.name, accountId);
      raw.object_story_spec = osp;
      synchronizeCreativeIdentityFields(raw, osp);
      stripCreativePreviewIdentifiers(raw);
      const body = buildImportedCreativePayload(raw);
      return createAdCreativeWithRetries(accountId, raw.name || creative.name, body);
    }

    const slots = getCreativeMediaSlots(creative);
    if (!slots.length) {
      log("warn", `Creative ${creative.name} skipped: no supported media slot.`);
      return null;
    }

    const slot = slots[0];
    const mediaFile = getDefaultMediaFile(slot);
    if (!mediaFile) {
      log("warn", `Creative ${creative.name} skipped: media file not found ${slot.expectedFileName}.`);
      return null;
    }

    if (slot.type === "image") {
      const uploadedImage = await uploadImageAsset(accountId, mediaFile, mediaCache);
      return createImageCreative(accountId, creative, uploadedImage.hash, mappedPageId);
    }

    if (slot.type === "video") {
      let uploadedId = mediaCache.videos.get(mediaFile.name);
      if (!uploadedId) {
        log("info", `Uploading video ${mediaFile.name}...`);
        uploadedId = await uploadVideo(accountId, mediaFile);
        mediaCache.videos.set(mediaFile.name, uploadedId);
      }
      const videoData = creative.raw?.object_story_spec?.video_data || {};
      const previewOriginalKey = getVideoThumbnailOriginalName(String(videoData.video_id || ""), extractMediaExtensionFromUrl(videoData.image_url, ".jpg"));
      const previewFile = resolveImportedMediaFile(`${creative.id}:video_preview`, previewOriginalKey);
      const customPreview = previewFile ? await uploadImageAsset(accountId, previewFile, mediaCache) : null;
      return createVideoCreative(accountId, creative, uploadedId, mappedPageId, customPreview);
    }

    return null;
  }

  async function resolveCreativeDraftPayload(accountId, creative, mediaCache) {
    const sourcePageId = getSourcePageId(creative);
    const mappedPageId = state.importPageMappings[sourcePageId] || sourcePageId;
    if (sourcePageId && !mappedPageId) {
      log("warn", `Creative ${creative.name} skipped: no replacement selected for FP ${sourcePageId} .`);
      return null;
    }
    if (sourcePageId && mappedPageId && mappedPageId !== sourcePageId) {
      log("info", `Creative ${creative.name}: remapping FP ${sourcePageId} -> ${mappedPageId}.`);
    }

    const raw = deepClone(creative.raw);
    replaceCreativePageReferences(raw, sourcePageId, mappedPageId);

    if (raw.asset_feed_spec) {
      const osp = raw.object_story_spec || {};

      const identity = await applyInstagramIdentity(osp, mappedPageId, raw.name || creative.name, accountId);
      ensureDraftCreativeDestinationSpec(raw, getPageIdentityHint(mappedPageId)?.destinationSpec || null);
      stripUnsupportedInstagramEnhancements(raw, identity, raw.name || creative.name);
      const afs = raw.asset_feed_spec;
      if (!afs) {
        raw.object_story_spec = osp;
        const fallbackCreative = await buildDraftAssetFeedFallbackFromLinkData(
          accountId,
          creative,
          raw,
          mediaCache,
        );
        if (fallbackCreative) {
          if (!await validateDraftCreativePayload(accountId, raw.name || creative.name, fallbackCreative)) {
            return null;
          }
          return fallbackCreative;
        }
        creative = {
          ...creative,
          raw,
        };
      } else {
        raw.object_story_spec = osp;
        synchronizeCreativeIdentityFields(raw, osp);
        stripCreativePreviewIdentifiers(raw);
        await replaceAssetFeedMedia(accountId, creative, osp, afs, mediaCache);
        stripAssetFeedLabelIdsForImport(afs);
        const payload = buildImportedCreativePayload(raw);
        if (!await validateDraftCreativePayload(accountId, raw.name || creative.name, payload, {
          forceVideoRetry: Array.isArray(afs.videos) && afs.videos.some((item) => item?.video_id),
        })) {
          return null;
        }
        return payload;
      }
    }

    if (raw.object_story_id) {
      if (mappedPageId && mappedPageId !== sourcePageId) {
        log("warn", `Creative ${creative.name} skipped: object_story_id cannot be transferred to another FP.`);
        return null;
      }
      return {
        object_story_id: raw.object_story_id,
      };
    }

    if (isCatalogTemplateCreative(raw)) {
      const osp = raw.object_story_spec || {};
      await applyInstagramIdentity(osp, mappedPageId, raw.name || creative.name, accountId);
      raw.object_story_spec = osp;
      synchronizeCreativeIdentityFields(raw, osp);
      stripCreativePreviewIdentifiers(raw);
      const payload = buildImportedCreativePayload(raw);
      if (!await validateDraftCreativePayload(accountId, raw.name || creative.name, payload)) {
        return null;
      }
      return payload;
    }

    const slots = getCreativeMediaSlots(creative);
    if (!slots.length) {
      log("warn", `Creative ${creative.name} skipped: no supported media slot.`);
      return null;
    }

    const osp = raw.object_story_spec || {};
    await applyInstagramIdentity(osp, mappedPageId, raw.name || creative.name, accountId);

    const slot = slots[0];
    const mediaFile = getDefaultMediaFile(slot);
    if (!mediaFile) {
      log("warn", `Creative ${creative.name} skipped: media file not found ${slot.expectedFileName}.`);
      return null;
    }

    if (slot.type === "image") {
      const uploadedImage = await uploadImageAsset(accountId, mediaFile, mediaCache);
      if (!osp.link_data) {
        osp.link_data = {};
      }
      osp.link_data.image_hash = uploadedImage.hash;
    }

    if (slot.type === "video") {
      let uploadedId = mediaCache.videos.get(mediaFile.name);
      if (!uploadedId) {
        log("info", `Uploading video ${mediaFile.name}...`);
        uploadedId = await uploadVideo(accountId, mediaFile);
        mediaCache.videos.set(mediaFile.name, uploadedId);
      }
      if (!osp.video_data) {
        osp.video_data = {};
      }
      osp.video_data.video_id = uploadedId;
      const previewOriginalKey = getVideoThumbnailOriginalName(String(slot.sourceId || uploadedId), extractMediaExtensionFromUrl(osp.video_data.image_url, ".jpg"));
      const previewFile = resolveImportedMediaFile(`${creative.id}:video_preview`, previewOriginalKey);
      if (previewFile) {
        const uploadedPreview = await uploadImageAsset(accountId, previewFile, mediaCache);
        osp.video_data.image_hash = uploadedPreview.hash;
        delete osp.video_data.image_url;
        osp.video_data.video_thumbnail_source = "custom";
      } else {
        delete osp.video_data.image_hash;
        osp.video_data.image_url = await getPreferredVideoThumbnail(uploadedId);
        osp.video_data.video_thumbnail_source = "generated_default";
      }
    }

    const payload = slot.type === "video"
      ? buildDraftStandaloneVideoCreative({
        ...raw,
        object_story_spec: osp,
      }, raw.name || creative.name)
      : appendCreativeUrlTags({
        name: raw.name || creative.name,
        object_story_spec: osp,
      }, raw);
    if (!await validateDraftCreativePayload(accountId, raw.name || creative.name, payload, {
      forceVideoRetry: slot.type === "video",
    })) {
      return null;
    }

    if (slot.type === "video") {
      return payload;
    }

    raw.object_story_spec = osp;
    synchronizeCreativeIdentityFields(raw, osp);
    stripCreativePreviewIdentifiers(raw);
    return raw;
  }

  async function createCampaign(accountId, campaign, options = {}) {
    const body = {
      name: state.importCampaignName || campaign.name,
      objective: campaign.objective,
      status: options.status || state.importStatus,
      special_ad_categories: campaign.special_ad_categories || [],
    };
    if (campaign.special_ad_category) {
      body.special_ad_category = campaign.special_ad_category;
    }
    if (campaign.special_ad_category_country) {
      body.special_ad_category_country = campaign.special_ad_category_country;
    }
    if (hasPositiveBudget(campaign.daily_budget)) {
      body.daily_budget = campaign.daily_budget;
    }
    if (hasPositiveBudget(campaign.lifetime_budget)) {
      body.lifetime_budget = campaign.lifetime_budget;
    }
    if (campaign.bid_strategy) {
      body.bid_strategy = campaign.bid_strategy;
    }
    if (campaign.buying_type) {
      body.buying_type = campaign.buying_type;
    }
    const startTime = normalizeScheduleValue(campaign.start_time, 0, {
      preservePast: state.importPreserveSchedule,
    });
    const stopTime = normalizeScheduleValue(campaign.stop_time, campaign.stop_time ? 30 : 0, {
      preservePast: state.importPreserveSchedule,
    });
    if (startTime) {
      body.start_time = startTime;
    }
    if (stopTime) {
      body.stop_time = stopTime;
    }
    const json = await graphFetch(`act_${accountId}/campaigns`, {
      method: "POST",
      body,
    });
    return String(json.id);
  }

  async function createAdset(accountId, campaignId, adset, pixelMap, options = {}) {
    const promotedObject = deepClone(adset.promoted_object || {});
    if (promotedObject.pixel_id) {
      promotedObject.pixel_id = pixelMap[String(promotedObject.pixel_id)] || promotedObject.pixel_id;
    }

    const body = {
      name: adset.name,
      campaign_id: campaignId,
      status: options.status || state.importStatus,
      optimization_goal: adset.optimization_goal,
      billing_event: adset.billing_event,
      targeting: cleanTargeting(adset.targeting, adset.name),
      promoted_object: promotedObject,
      is_dynamic_creative: Boolean(adset.is_dynamic_creative),
    };
    if (adset.destination_type) {
      body.destination_type = adset.destination_type;
    }
    if (adset.asset_feed_id) {
      body.asset_feed_id = adset.asset_feed_id;
    }
    for (const [field, value] of Object.entries({
      optimization_sub_event: adset.optimization_sub_event,
      multi_optimization_goal_weight: adset.multi_optimization_goal_weight,
      automatic_manual_state: adset.automatic_manual_state,
      campaign_attribution: adset.campaign_attribution,
      attribution_count_type: adset.attribution_count_type,
    })) {
      if (value !== undefined && value !== null && value !== "") {
        body[field] = value;
      }
    }
    for (const [field, value] of Object.entries({
      is_dynamic_creative_optimization: adset.is_dynamic_creative_optimization,
      is_dynamic_creative_asset_customization: adset.is_dynamic_creative_asset_customization,
      is_dynamic_creative_format_automation: adset.is_dynamic_creative_format_automation,
    })) {
      if (typeof value === "boolean") {
        body[field] = value;
      }
    }
    if (adset.targeting_as_signal !== undefined && adset.targeting_as_signal !== null && adset.targeting_as_signal !== "") {
      body.targeting_as_signal = adset.targeting_as_signal;
    }
    if (typeof adset.use_new_app_click === "boolean") {
      body.use_new_app_click = adset.use_new_app_click;
    }
    if (typeof adset.is_autobid === "boolean") {
      body.is_autobid = adset.is_autobid;
    }
    if (shouldIncludeAdsetSchedule(adset, options)) {
      body.adset_schedule = adset.adset_schedule;
    }
    if (adset.pacing_type && !hasAdsetDayParting(adset)) {
      body.pacing_type = adset.pacing_type;
    }
    if (adset.creative_sequence !== undefined && adset.creative_sequence !== null && adset.creative_sequence !== "") {
      body.creative_sequence = adset.creative_sequence;
    }
    if (adset.dynamic_ad_voice) {
      body.dynamic_ad_voice = adset.dynamic_ad_voice;
    }

    if (hasPositiveBudget(adset.daily_budget)) {
      body.daily_budget = adset.daily_budget;
    }
    if (hasPositiveBudget(adset.lifetime_budget)) {
      body.lifetime_budget = adset.lifetime_budget;
    }
    if (adset.bid_strategy) {
      body.bid_strategy = adset.bid_strategy;
    }
    if (adset.bid_amount) {
      body.bid_amount = adset.bid_amount;
    }
    if (adset.attribution_spec) {
      body.attribution_spec = adset.attribution_spec;
    }
    if (adset.dsa_beneficiary) {
      body.dsa_beneficiary = adset.dsa_beneficiary;
    }
    if (adset.dsa_payor) {
      body.dsa_payor = adset.dsa_payor;
    }
    const hasEndTime = Boolean(adset.end_time);
    const startTime = normalizeScheduleValue(adset.start_time, 0, {
      preservePast: state.importPreserveSchedule,
    });
    const endTime = normalizeScheduleValue(adset.end_time, hasEndTime ? 30 : 0, {
      preservePast: state.importPreserveSchedule,
    });
    if (startTime) {
      body.start_time = startTime;
    }
    if (endTime) {
      body.end_time = endTime;
    }

    const json = await graphFetch(`act_${accountId}/adsets`, {
      method: "POST",
      body,
    });
    return String(json.id);
  }

  async function createAd(accountId, adsetId, ad, creativeId, options = {}) {
    const body = {
      name: ad.name,
      status: options.status || state.importStatus,
      adset_id: adsetId,
      creative: { creative_id: creativeId },
    };
    if (ad.conversion_domain) {
      body.conversion_domain = ad.conversion_domain;
    }
    const json = await graphFetch(`act_${accountId}/ads`, {
      method: "POST",
      body,
    });
    return String(json.id);
  }

  async function updateAdObjectStatus(objectId, status, label) {
    await graphFetch(objectId, {
      method: "POST",
      body: { status },
    });
    log("info", `${label} set to ${status}.`);
  }

  async function activateCreatedCampaignTree(campaignId, adsetIds, adIds) {
    for (const [index, adsetId] of adsetIds.entries()) {
      await updateAdObjectStatus(adsetId, "ACTIVE", `Adset ${index + 1}`);
    }
    for (const [index, adId] of adIds.entries()) {
      await updateAdObjectStatus(adId, "ACTIVE", `Ad ${index + 1}`);
    }
    await updateAdObjectStatus(campaignId, "ACTIVE", "Campaign");
  }

  async function discardCurrentDraft(accountId) {
    // First check if there's an existing draft with fragments
    try {
      const current = await graphFetch(`act_${accountId}/current_addrafts`, {
        query: { fields: "id" },
      });
      const draftId = current.data?.[0]?.id;
      if (draftId) {
        // Delete all fragments from the existing draft
        const frags = await graphFetch(`${draftId}/addraft_fragments`, {
          query: { fields: "ad_object_type,ad_object_id", limit: 200 },
        });
        if (frags.data?.length) {
          for (const frag of frags.data) {
            try {
              await graphFetch(frag.id, { method: "DELETE" });
            } catch (_) {}
          }
          log("info", `Deleted ${frags.data.length} draft fragments`);
        }
      }
    } catch (_) {}

    // Create a new draft, discarding the old one
    const result = await graphFetch(`act_${accountId}/addrafts`, {
      method: "POST",
      body: {
        name: "Clean draft",
        application_id: getDraftApplicationId(),
        ownership_type: "USER",
        use_active_draft_if_exists: false,
        discard_active_draft: true,
      },
    });
    log("info", `Old draft discarded. New: ${result.id}`);
    return result.id;
  }

  async function getCurrentDraftId(accountId) {
    const current = await graphFetch(`act_${accountId}/current_addrafts`, {
      query: { fields: "api_version" },
    });
    if (current.data?.[0]?.id) {
      return normalizeDraftId(current.data[0].id);
    }
    const created = await graphFetch(`act_${accountId}/addrafts`, {
      method: "POST",
      body: {
        name: "Imported draft",
        application_id: getDraftApplicationId(),
        ownership_type: "USER",
        use_active_draft_if_exists: true,
      },
    });
    return normalizeDraftId(created.id);
  }

  function draftItem(field, value) {
    return { field, new_value: String(value) };
  }

  function draftValueItem(field, value) {
    return { field, new_value: value };
  }

  function draftJsonItem(field, value) {
    return { field, new_value: deepClone(value) };
  }

  function formatGraphDraftTimestamp(date = new Date()) {
    const pad = (value) => String(value).padStart(2, "0");
    const offsetMinutes = -date.getTimezoneOffset();
    const sign = offsetMinutes >= 0 ? "+" : "-";
    const absOffset = Math.abs(offsetMinutes);
    const offsetHours = Math.floor(absOffset / 60);
    const offsetRemainder = absOffset % 60;
    return [
      `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
      `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`,
      `${sign}${pad(offsetHours)}${pad(offsetRemainder)}`,
    ].join("");
  }

  function getDraftValueEntry(values, field) {
    return (Array.isArray(values) ? values : []).find((item) => String(item?.field || "") === String(field || "")) || null;
  }

  function parseDraftStoredValue(value) {
    if (typeof value !== "string") {
      return value;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return value;
    }
    const first = trimmed[0];
    const looksJsonLike = first === "{"
      || first === "["
      || first === "\""
      || /^-?\d+(?:\.\d+)?$/.test(trimmed)
      || trimmed === "true"
      || trimmed === "false"
      || trimmed === "null";
    if (!looksJsonLike) {
      return value;
    }
    try {
      return JSON.parse(trimmed);
    } catch (_error) {
      return value;
    }
  }

  function getDraftValue(values, field) {
    return parseDraftStoredValue(getDraftValueEntry(values, field)?.new_value);
  }

  function setDraftValue(values, field, value) {
    const nextValues = Array.isArray(values) ? values.map((item) => deepClone(item)) : [];
    const existing = nextValues.find((item) => String(item?.field || "") === String(field || ""));
    if (existing) {
      existing.new_value = deepClone(value);
    } else {
      nextValues.push({ field, new_value: deepClone(value) });
    }
    return nextValues;
  }

  function ensureDraftCreativeDestinationSpec(creative, fallbackDestinationSpec = null) {
    if (!creative || typeof creative !== "object" || !creative.asset_feed_spec) {
      return false;
    }
    if (creative.destination_spec?.native_commerce_experience?.shop?.action_metadata) {
      return false;
    }
    if (fallbackDestinationSpec && typeof fallbackDestinationSpec === "object") {
      creative.destination_spec = deepClone(fallbackDestinationSpec);
      return true;
    }
    creative.destination_spec = {
      native_commerce_experience: {
        shop: {
          action_metadata: {
            type: "DEFAULT_OFF",
          },
        },
      },
    };
    return true;
  }

  function getAffectedDraftIdentityFragment(fragment, draftAdContext = null) {
    if (!fragment || String(fragment.ad_object_type || "") !== "ad") {
      return null;
    }
    const creative = deepClone(getDraftValue(fragment.values, "creative") || null);
    if (!creative || typeof creative !== "object") {
      return null;
    }
    const osp = creative.object_story_spec || {};
    const fragmentAdObjectId = String(fragment.ad_object_id || "");
    const fragmentAdName = String(getDraftValue(fragment.values, "name") || "").trim().toLowerCase();
    const fragmentTempId = String(getDraftValue(fragment.values, "tempID") || "");
    let context = null;
    if (draftAdContext instanceof Map) {
      const uniqueContexts = [...new Map(
        [...draftAdContext.values()].map((item) => [
          `${String(item?.adId || "")}|${String(item?.adName || "").trim().toLowerCase()}`,
          item,
        ]),
      ).values()];
      context = draftAdContext.get(`id:${fragmentAdObjectId}`)
        || draftAdContext.get(`name:${fragmentAdName}`)
        || draftAdContext.get(`temp:${fragmentTempId}`)
        || (uniqueContexts.length === 1 ? uniqueContexts[0] : null)
        || null;
    }
    const pageId = String(osp.page_id || context?.pageId || "");
    if (!pageId) {
      return null;
    }
    const needsActorId = !String(osp.instagram_actor_id || "");
    const needsDestinationSpec = Boolean(creative.asset_feed_spec) && !creative.destination_spec?.native_commerce_experience?.shop?.action_metadata;
    if (!needsActorId && !needsDestinationSpec) {
      return null;
    }
    return {
      fragmentId: String(fragment.id || ""),
      adId: String(fragment.ad_object_id || ""),
      adsetId: String(fragment.parent_ad_object_id || getDraftValue(fragment.values, "adset_id") || ""),
      campaignId: String(getDraftValue(fragment.values, "campaign_id") || ""),
      pageId,
      adName: String(getDraftValue(fragment.values, "name") || fragment.ad_object_id || fragment.id || "draft ad"),
      creative,
      needsActorId,
      needsDestinationSpec,
    };
  }

  async function fetchCurrentDraftDetails(accountId, draftId) {
    const normalizedDraftId = normalizeDraftId(draftId);
    const current = await graphFetch(`act_${accountId}/current_addrafts`, {
      query: {
        fields: [
          "id",
          "state",
          "publish_status{status,error_count,publish_error}",
          "addraft_fragments.limit(500){id,ad_object_type,ad_object_id,parent_ad_object_id,validation_status,active_errors,publish_error,values}",
        ].join(","),
      },
    });
    return (current.data || []).find((item) => normalizeDraftId(item.id) === normalizedDraftId) || null;
  }

  async function updateDraftIdentityFragment(accountId, draftId, fragment, values) {
    const normalizedDraftId = normalizeDraftId(draftId);
    const now = formatGraphDraftTimestamp(new Date());
    await graphFetch(String(fragment.id), {
      method: "POST",
      body: {
        action: "add",
        id: String(fragment.id),
        ad_draft_id: normalizedDraftId,
        account_id: accountId,
        ad_object_id: String(fragment.ad_object_id || ""),
        ad_object_type: String(fragment.ad_object_type || ""),
        parent_ad_object_id: String(fragment.parent_ad_object_id || getDraftValue(values, "parentAdObjectID") || ""),
        draft_version: 1,
        fragment_version: 1,
        source: "NONE",
        status: "EDITING",
        include_headers: false,
        suppress_http_code: 1,
        validate: false,
        time_created: now,
        time_updated: now,
        values,
      },
    });
  }

  async function ensureDraftInstagramIdentityParity(accountId, draftId, draftAdContext = null) {
    const summary = {
      draftId: normalizeDraftId(draftId),
      initialAffectedCount: 0,
      pageIdsNeedingHints: [],
      updatedCount: 0,
      unresolvedCount: 0,
    };
    const initialDraft = await fetchCurrentDraftDetails(accountId, draftId);
    if (!initialDraft) {
      state.lastDraftIdentityRepair = summary;
      return summary;
    }
    const collectAffected = (draft) => (draft?.addraft_fragments?.data || [])
      .map((fragment) => getAffectedDraftIdentityFragment(fragment, draftAdContext))
      .filter(Boolean);
    let workingDraft = initialDraft;
    let initialAffected = collectAffected(workingDraft);
    if (!initialAffected.length && draftAdContext instanceof Map && draftAdContext.size) {
      try {
        initialAffected = await waitForCondition(
          `Draft identity fragments for ${summary.draftId}`,
          async () => {
            const refreshedDraft = await fetchCurrentDraftDetails(accountId, draftId);
            const affected = collectAffected(refreshedDraft);
            if (affected.length) {
              workingDraft = refreshedDraft;
              return affected;
            }
            return false;
          },
          20000,
          1500,
        );
      } catch (_error) {
        initialAffected = [];
      }
    }
    summary.initialAffectedCount = initialAffected.length;
    if (!initialAffected.length) {
      state.lastDraftIdentityRepair = summary;
      return summary;
    }

    const pageIdsNeedingHints = [...new Set(initialAffected
      .filter((item) => item.needsActorId && !getPageIdentityHint(item.pageId)?.instagramActorId)
      .map((item) => item.pageId))];
    summary.pageIdsNeedingHints = [...pageIdsNeedingHints];

    for (const pageId of pageIdsNeedingHints) {
      try {
        await ensurePageIdentityProfiles(pageId, `draft ${summary.draftId}`, accountId);
      } catch (error) {
        log("warn", `Failed to ensure page-backed Instagram identity for page ${pageId}.`, String(error));
      }
    }

    const draft = await fetchCurrentDraftDetails(accountId, draftId);
    if (!draft) {
      state.lastDraftIdentityRepair = summary;
      return summary;
    }

    let updatedCount = 0;
    let unresolvedCount = 0;
    for (const fragment of (draft.addraft_fragments?.data || [])) {
      const affected = getAffectedDraftIdentityFragment(fragment, draftAdContext);
      if (!affected) {
        continue;
      }
      const creative = deepClone(affected.creative);
      const osp = creative.object_story_spec || {};
      const identity = await applyInstagramIdentity(osp, affected.pageId, affected.adName, accountId);
      creative.object_story_spec = osp;
      synchronizeCreativeIdentityFields(creative, osp);
      const savedHint = getPageIdentityHint(affected.pageId);
      const fallbackDestinationSpec = savedHint?.destinationSpec || null;
      const destinationChanged = ensureDraftCreativeDestinationSpec(creative, fallbackDestinationSpec);
      const actorResolved = Boolean(identity?.instagramActorId || creative.object_story_spec?.instagram_actor_id);
      const stillNeedsActorId = affected.needsActorId && !actorResolved;
      const stillNeedsDestinationSpec = affected.needsDestinationSpec && !creative.destination_spec?.native_commerce_experience?.shop?.action_metadata;
      if (stillNeedsActorId || stillNeedsDestinationSpec) {
        unresolvedCount += 1;
        continue;
      }
      const nextValues = setDraftValue(fragment.values, "creative", creative);
      await updateDraftIdentityFragment(accountId, draftId, fragment, nextValues);
      updatedCount += 1;
      if (destinationChanged || affected.needsActorId) {
        log("info", `Updated draft identity for ${affected.adName}.`);
      }
    }

    if (updatedCount) {
      await sleep(1500);
    }
    summary.updatedCount = updatedCount;
    summary.unresolvedCount = unresolvedCount;
    state.lastDraftIdentityRepair = summary;
    return summary;
  }

  async function logDraftValidation(accountId, draftId) {
    try {
      const normalizedDraftId = normalizeDraftId(draftId);
      const draft = await fetchCurrentDraftDetails(accountId, draftId);
      if (!draft) {
        log("warn", `Draft ${normalizedDraftId} not found in current_addrafts after import.`);
        return;
      }
      const fragments = draft.addraft_fragments?.data || [];
      const invalid = fragments
        .filter((fragment) =>
          fragment.validation_status === "HAS_ERRORS"
          || (Array.isArray(fragment.active_errors) && fragment.active_errors.length)
          || fragment.publish_error,
        )
        .map((fragment) => ({
          id: fragment.id,
          ad_object_type: fragment.ad_object_type,
          ad_object_id: fragment.ad_object_id,
          validation_status: fragment.validation_status,
          active_errors: fragment.active_errors || [],
          publish_error: fragment.publish_error || null,
        }));
      if (invalid.length) {
        log("warn", `Draft ${normalizedDraftId} has ${invalid.length} invalid fragments after creation.`, invalid);
      } else {
        log("info", `Draft ${normalizedDraftId} validated without fragment errors.`);
      }
    } catch (error) {
      log("warn", `Failed to inspect draft validation for ${draftId}.`, String(error));
    }
  }

  async function createCampaignDraft(accountId, draftId, campaign, options = {}) {
    const normalizedDraftId = normalizeDraftId(draftId);
    const objective = String(campaign.objective || "CONVERSIONS").toUpperCase();
    const isOutcomeLeads = objective === "OUTCOME_LEADS";
    const hasCampaignBudget = hasCampaignLevelBudget(campaign);
    const hasDayParting = Boolean(options.hasDayParting);
    const values = [
      draftItem("name", state.importCampaignName || campaign.name),
      draftItem("objective", objective),
      draftItem("status", state.importStatus),
      draftJsonItem("special_ad_categories", campaign.special_ad_categories || []),
      draftItem("special_ad_category", campaign.special_ad_category || "NONE"),
      draftItem("account_id", accountId),
    ];
    if (campaign.special_ad_category_country) {
      values.push(draftJsonItem("special_ad_category_country", campaign.special_ad_category_country));
    }
    if (hasPositiveBudget(campaign.daily_budget)) {
      values.push(draftItem("daily_budget", campaign.daily_budget));
    }
    if (hasPositiveBudget(campaign.lifetime_budget)) {
      values.push(draftItem("lifetime_budget", campaign.lifetime_budget));
    }
    if (campaign.bid_strategy) {
      values.push(draftItem("bid_strategy", campaign.bid_strategy));
    }
    if (campaign.buying_type) {
      values.push(draftItem("buying_type", campaign.buying_type));
    }
    const startTime = normalizeScheduleValue(campaign.start_time, 0, {
      preservePast: state.importPreserveSchedule,
    });
    values.push(startTime ? draftItem("start_time", startTime) : draftValueItem("start_time", null));
    const stopTime = normalizeScheduleValue(campaign.stop_time, campaign.stop_time ? 30 : 0, {
      preservePast: state.importPreserveSchedule,
    });
    values.push(stopTime ? draftItem("stop_time", stopTime) : draftValueItem("stop_time", null));
    if (isOutcomeLeads) {
      values.push(
        draftValueItem("adlabels", null),
        draftValueItem("lightweight_split_test", null),
        draftItem("campaign_group_creation_source", "click_quick_create"),
        draftValueItem("smart_promotion_type", null),
        draftValueItem("is_pca_unified", null),
        draftValueItem("mc_experience_config", null),
        draftValueItem("is_odax_campaign_group", true),
        draftValueItem("tempID", nextDraftTempId()),
        draftValueItem("boosted_component_product", null),
        draftValueItem("incremental_conversion_optimization_config", null),
        draftValueItem("topline_id", null),
        draftValueItem("is_full_funnel", null),
        draftValueItem("frequency_control_specs", null),
        draftValueItem("is_reels_trending_ads_enabled", null),
        draftItem("automation_unified_campaign_type", "UNIFIED_LEADS"),
        draftValueItem("agency_fee_config", null),
        draftValueItem("promoted_object", null),
        draftValueItem("source_recommendation_type", null),
        draftValueItem("is_message_campaign", null),
        draftValueItem("collaborative_ads_partner_info", null),
        draftValueItem("is_using_l3_schedule", null),
      );
      if (hasCampaignBudget) {
        values.push(
          draftValueItem("can_use_spend_cap", true),
          draftValueItem("budget_strategy", null),
          draftJsonItem("metrics_metadata", { budget_optimization: ["default_on"] }),
          draftValueItem("spend_cap", null),
          draftValueItem("is_autobid", !campaign.bid_strategy || campaign.bid_strategy === "LOWEST_COST_WITHOUT_CAP"),
          draftValueItem("budget_remaining", null),
          draftValueItem("is_average_price_pacing", false),
        );
        if (!hasDayParting) {
          values.push(draftJsonItem("pacing_type", ["standard"]));
        }
      }
    }
    const json = await graphFetch(`${draftId}/addraft_fragments`, {
      method: "POST",
      body: {
        action: "add",
        ad_object_type: "campaign",
        ad_draft_id: normalizedDraftId,
        account_id: accountId,
        values,
        application_id: getDraftApplicationId(),
        ownership_type: "USER",
        use_active_draft_if_exists: true,
      },
    });
    return String(json.ad_object_id);
  }

  async function createAdsetDraft(accountId, draftId, campaignDraftId, adset, pixelMap, options = {}) {
    const normalizedDraftId = normalizeDraftId(draftId);
    const promotedObject = deepClone(adset.promoted_object || {});
    const adsetTempId = nextDraftTempId();
    if (promotedObject.pixel_id) {
      promotedObject.pixel_id = pixelMap[String(promotedObject.pixel_id)] || promotedObject.pixel_id;
    }
    const values = [
      draftItem("name", adset.name),
      draftItem("parentAdObjectID", campaignDraftId),
      draftItem("campaign_id", campaignDraftId),
      draftItem("account_id", accountId),
      draftItem("status", state.importStatus),
      draftItem("optimization_goal", adset.optimization_goal),
      draftItem("billing_event", adset.billing_event),
      draftJsonItem("targeting", cleanTargeting(adset.targeting, adset.name)),
      draftJsonItem("promoted_object", promotedObject),
      draftValueItem("is_dynamic_creative", Boolean(adset.is_dynamic_creative)),
      draftValueItem("tempID", adsetTempId),
      draftItem("campaign_creation_source", "click_quick_create"),
    ];
    if (adset.destination_type) {
      values.push(draftItem("destination_type", adset.destination_type));
    }
    if (adset.asset_feed_id) {
      values.push(draftItem("asset_feed_id", adset.asset_feed_id));
    }
    for (const [field, value] of Object.entries({
      optimization_sub_event: adset.optimization_sub_event,
      multi_optimization_goal_weight: adset.multi_optimization_goal_weight,
      automatic_manual_state: adset.automatic_manual_state,
      campaign_attribution: adset.campaign_attribution,
      attribution_count_type: adset.attribution_count_type,
    })) {
      if (value !== undefined && value !== null && value !== "") {
        values.push(draftItem(field, value));
      }
    }
    for (const [field, value] of Object.entries({
      is_dynamic_creative_optimization: adset.is_dynamic_creative_optimization,
      is_dynamic_creative_asset_customization: adset.is_dynamic_creative_asset_customization,
      is_dynamic_creative_format_automation: adset.is_dynamic_creative_format_automation,
    })) {
      if (typeof value === "boolean") {
        values.push(draftValueItem(field, value));
      }
    }
    if (adset.targeting_as_signal !== undefined && adset.targeting_as_signal !== null && adset.targeting_as_signal !== "") {
      values.push(draftValueItem("targeting_as_signal", adset.targeting_as_signal));
    }
    if (typeof adset.use_new_app_click === "boolean") {
      values.push(draftValueItem("use_new_app_click", adset.use_new_app_click));
    }
    if (typeof adset.is_autobid === "boolean") {
      values.push(draftValueItem("is_autobid", adset.is_autobid));
    }
    if (shouldIncludeAdsetSchedule(adset, options)) {
      values.push(draftJsonItem("adset_schedule", adset.adset_schedule));
    }
    if (adset.pacing_type && !hasAdsetDayParting(adset)) {
      values.push(draftJsonItem("pacing_type", adset.pacing_type));
    }
    if (adset.creative_sequence !== undefined && adset.creative_sequence !== null && adset.creative_sequence !== "") {
      values.push(draftValueItem("creative_sequence", adset.creative_sequence));
    }
    if (adset.dynamic_ad_voice) {
      values.push(draftItem("dynamic_ad_voice", adset.dynamic_ad_voice));
    }
    if (hasPositiveBudget(adset.daily_budget)) {
      values.push(draftItem("daily_budget", adset.daily_budget));
    }
    if (hasPositiveBudget(adset.lifetime_budget)) {
      values.push(draftItem("lifetime_budget", adset.lifetime_budget));
    }
    if (adset.bid_strategy) {
      values.push(draftItem("bid_strategy", adset.bid_strategy));
    }
    if (adset.bid_amount) {
      values.push(draftItem("bid_amount", adset.bid_amount));
    } else {
      values.push(draftJsonItem("bid_constraints", []));
    }
    if (adset.attribution_spec) {
      values.push(draftJsonItem("attribution_spec", adset.attribution_spec));
    }
    if (adset.dsa_beneficiary) {
      values.push(draftItem("dsa_beneficiary", adset.dsa_beneficiary));
    }
    if (adset.dsa_payor) {
      values.push(draftItem("dsa_payor", adset.dsa_payor));
    }
    const startTime = normalizeScheduleValue(adset.start_time, 0, {
      preservePast: state.importPreserveSchedule,
    });
    values.push(startTime ? draftItem("start_time", startTime) : draftValueItem("start_time", null));
    const hasEndTime = Boolean(adset.end_time);
    const endTime = normalizeScheduleValue(adset.end_time, hasEndTime ? 30 : 0, {
      preservePast: state.importPreserveSchedule,
    });
    values.push(endTime ? draftItem("end_time", endTime) : draftValueItem("end_time", null));
    const json = await graphFetch(`${draftId}/addraft_fragments`, {
      method: "POST",
      body: {
        action: "add",
        ad_object_type: "ad_set",
        account_id: accountId,
        ad_draft_id: normalizedDraftId,
        parent_ad_object_id: campaignDraftId,
        values,
        application_id: getDraftApplicationId(),
        ownership_type: "USER",
        use_active_draft_if_exists: true,
      },
    });
    return String(json.ad_object_id);
  }

  async function createAdDraft(accountId, draftId, campaignDraftId, adsetDraftId, ad, creativeRaw) {
    const normalizedDraftId = normalizeDraftId(draftId);
    const adTempId = nextDraftTempId();
    const values = [
      draftItem("name", ad.name),
      draftItem("parentAdObjectID", adsetDraftId),
      draftItem("campaign_id", campaignDraftId),
      draftItem("adset_id", adsetDraftId),
      draftItem("account_id", accountId),
      draftValueItem("display_sequence", 0),
      draftItem("status", state.importStatus),
      draftJsonItem("creative", creativeRaw),
      draftValueItem("campaign_index", 0),
      draftItem("ad_creation_source", "click_quick_create"),
      draftValueItem("tempID", adTempId),
    ];
    if (ad.conversion_domain) {
      values.push(draftItem("conversion_domain", ad.conversion_domain));
    }
    const json = await graphFetch(`${draftId}/addraft_fragments`, {
      method: "POST",
      body: {
        action: "add",
        ad_object_type: "ad",
        account_id: accountId,
        ad_draft_id: normalizedDraftId,
        parent_ad_object_id: adsetDraftId,
        values,
        application_id: getDraftApplicationId(),
        ownership_type: "USER",
        use_active_draft_if_exists: true,
      },
    });
    return String(json.ad_object_id);
  }

  async function resolvePixelMap(accountId) {
    const mapping = {};
    for (const sourcePixel of getImportSourcePixels()) {
      const selected = state.importPixelMappings[sourcePixel.id]
        || (state.importAccountPixels.some((item) => item.id === sourcePixel.id) ? sourcePixel.id : "__create__");
      if (selected === "__create__") {
        mapping[sourcePixel.id] = await createPixel(
          accountId,
          sourcePixel.id,
          state.importPackage?.source?.campaignName || "",
        );
      } else {
        mapping[sourcePixel.id] = selected;
      }
    }
    return mapping;
  }

  function validateCatalogMappingsForImport(packageData, targetContext, catalogMappings, productSetMappings = {}, copiedCatalogIds = new Set()) {
    const sourceCatalogs = getSourceCatalogsFromPackage(packageData);
    if (!sourceCatalogs.length) {
      return;
    }
    const targetCatalogIds = new Set((targetContext?.catalogs || []).map((item) => String(item.id)));
    const productSets = getSourceProductSetsFromPackage(packageData);
    for (const catalog of sourceCatalogs) {
      const sourceId = String(catalog.id);
      const selectedId = String(catalogMappings?.[sourceId] || "");
      if (!selectedId) {
        throw new Error(`Catalog campaign requires catalog mapping for source catalog ${sourceId}. Select a target catalog first.`);
      }
      if (selectedId === "__copy__" && !targetContext?.business?.id) {
        throw new Error(
          `Catalog ${sourceId} cannot be copied into target BM for act_${state.importAccountId}: the target account has no visible Business Manager. ` +
          "Select an existing eligible target catalog instead.",
        );
      }
      if (!targetCatalogIds.has(selectedId) && !copiedCatalogIds.has(selectedId)) {
        throw new Error(`Target account act_${state.importAccountId} does not have visible access to catalog ${selectedId}.`);
      }
      if (
        selectedId !== sourceId
        && productSets.length
        && productSets.some((item) => !productSetMappings[String(item.id)])
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

  function pickDefinedFields(source, fields) {
    const body = {};
    for (const field of fields) {
      const value = source?.[field];
      if (value !== undefined && value !== null && value !== "") {
        body[field] = value;
      }
    }
    return body;
  }

  function getCatalogExportSnapshotFromPackage(packageData, catalogId) {
    const normalizedId = String(catalogId || "");
    return (packageData?.catalogExports || []).find((item) =>
      String(item?.catalog?.id || item?.id || "") === normalizedId) || null;
  }

  async function fetchCatalogCopySnapshot(catalogId, packageData = null) {
    const packageSnapshot = getCatalogExportSnapshotFromPackage(packageData, catalogId);
    if (packageSnapshot) {
      return {
        catalog: {
          ...(packageSnapshot.catalog || {}),
          id: String(packageSnapshot.catalog?.id || catalogId),
          name: packageSnapshot.catalog?.name || catalogId,
          vertical: packageSnapshot.catalog?.vertical || "commerce",
          productCount: packageSnapshot.catalog?.productCount ?? packageSnapshot.products?.length ?? 0,
        },
        productFeeds: (packageSnapshot.productFeeds || []).map((item) => deepClone(item)),
        products: (packageSnapshot.products || []).map((item) => ({ ...deepClone(item), id: String(item.id) })),
        productSets: (packageSnapshot.productSets || []).map((item) => ({ ...deepClone(item), id: String(item.id) })),
        exportMode: packageSnapshot.exportMode || ((packageSnapshot.productFeeds || []).length ? "feed" : "manual_products"),
      };
    }
    return fetchCatalogExportSnapshot({ id: catalogId });
  }

  async function createProductCatalogInBusiness(businessId, sourceCatalog) {
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
        const catalogId = response?.data?.xfb_create_catalog_commerce_manager?.catalog?.id;
        if (!catalogId) {
          throw new Error("Commerce Manager create catalog mutation did not return catalog.id.");
        }
        log("info", "Catalog shell created via Commerce Manager mutation.");
        return String(catalogId);
      } catch (error) {
        if (isCatalogCreateAdminPermissionError(error)) {
          throw new Error(
            `Cannot create a copied catalog in target business ${businessId}: Meta says this user is not a Business Manager admin. ` +
            "Use a target account that already has visible access to the source catalog, or ask a BM admin to share/create the catalog first.",
          );
        }
        log("warn", "Commerce Manager catalog create mutation failed; trying public Graph fallback.", String(error?.message || error));
      }
    }
    try {
      const created = await graphPageFetch(`${businessId}/owned_product_catalogs`, {
        method: "POST",
        body: {
          name,
          vertical: sourceCatalog.vertical || "commerce",
        },
      });
      return String(created.id);
    } catch (firstError) {
      if (isCatalogCreateAdminPermissionError(firstError) || isPermissionDeniedGraphError(firstError)) {
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
      log("warn", "Catalog create used product_catalogs fallback after owned_product_catalogs failed.", String(firstError));
      return String(created.id);
    }
  }

  async function ensureTargetCatalogForCopy(sourceCatalog, targetContext) {
    const marker = `AdReplica ${sourceCatalog.id}`;
    const existing = (targetContext.catalogs || []).find((item) =>
      String(item.name || "").includes(marker));
    if (existing?.id) {
      log("info", `Reusing copied catalog ${existing.name} (${existing.id}).`);
      return existing.id;
    }
    const exactExisting = (targetContext.catalogs || []).find((item) =>
      String(item.name || "") === buildDefaultCloneCatalogName(sourceCatalog));
    if (exactExisting?.id) {
      log("info", `Reusing existing cloned catalog ${exactExisting.name} (${exactExisting.id}).`);
      return exactExisting.id;
    }
    const catalogId = await createProductCatalogInBusiness(targetContext.business.id, sourceCatalog);
    log("info", `Copied catalog shell created: ${catalogId}.`);
    return catalogId;
  }

  function buildCatalogFeedPayload(feed) {
    const body = pickDefinedFields(feed, [
      "name",
      "file_name",
      "delimiter",
      "encoding",
      "quoted_fields",
      "default_currency",
    ]);
    body.name = body.name || feed?.raw?.name || feed?.file_name || "AdReplica feed";
    const schedule = feed?.schedule || feed?.raw?.schedule || null;
    if (schedule && typeof schedule === "object") {
      body.schedule = pickDefinedFields(schedule, [
        "url",
        "uri",
        "interval",
        "hour",
        "minute",
        "day_of_month",
        "day_of_week",
        "timezone",
      ]);
      if (!body.schedule.url && body.schedule.uri) {
        body.schedule.url = body.schedule.uri;
      }
      delete body.schedule.uri;
      if (
        body.schedule.url
        && body.schedule.interval
        && body.schedule.hour === undefined
        && schedule.next_scheduled_update_time
      ) {
        const timeParts = getTimePartsForTimezone(
          Number(schedule.next_scheduled_update_time) * 1000,
          body.schedule.timezone || "UTC",
        );
        if (timeParts) {
          body.schedule.hour = timeParts.hour;
          body.schedule.minute = timeParts.minute;
        }
      }
    }
    return body;
  }

  function getTimePartsForTimezone(timestampMs, timezone) {
    if (!Number.isFinite(timestampMs)) {
      return null;
    }
    try {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone || "UTC",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).formatToParts(new Date(timestampMs));
      const hour = Number(parts.find((part) => part.type === "hour")?.value);
      const minute = Number(parts.find((part) => part.type === "minute")?.value);
      return Number.isFinite(hour) && Number.isFinite(minute)
        ? { hour, minute }
        : null;
    } catch (_error) {
      return null;
    }
  }

  async function copyCatalogProductFeeds(sourceFeeds, targetCatalogId) {
    const feedIdMap = {};
    const existingFeeds = await fetchCatalogProductFeeds(targetCatalogId, { suppressEmptyLog: true }).catch(() => []);
    if (!existingFeeds.length) {
      log("info", `No reusable target catalog feeds found for ${targetCatalogId}; creating feeds from source export.`);
    }
    const existingFeedBySignature = new Map();
    for (const existing of existingFeeds) {
      const signature = getCatalogFeedSignature(existing);
      if (signature) {
        existingFeedBySignature.set(signature, existing);
      }
    }
    for (const feed of sourceFeeds || []) {
      const payload = buildCatalogFeedPayload(feed);
      if (!payload.schedule?.url) {
        log("warn", `Catalog feed skipped: ${payload.name} has no schedule.url in export.`);
        continue;
      }
      const signature = getCatalogFeedSignature(payload);
      const existing = signature ? existingFeedBySignature.get(signature) : null;
      if (existing?.id) {
        const targetFeedId = String(existing.id);
        if (feed.id) {
          feedIdMap[String(feed.id)] = targetFeedId;
        }
        log("info", `Reusing catalog feed: ${payload.name} (${targetFeedId}).`);
        await requestCatalogFeedUpdateNow(targetFeedId);
        continue;
      }
      try {
        const created = await graphFetch(`${targetCatalogId}/product_feeds`, {
          method: "POST",
          body: payload,
        });
        const targetFeedId = String(created.id || "");
        if (feed.id) {
          feedIdMap[String(feed.id)] = targetFeedId;
        }
        log("info", `Catalog feed copied: ${payload.name}`);
        if (targetFeedId) {
          await requestCatalogFeedUpdateNow(targetFeedId);
        }
      } catch (error) {
        log("warn", `Catalog feed copy failed: ${payload.name}.`, String(error));
      }
    }
    return feedIdMap;
  }

  function getCatalogFeedSignature(feed) {
    const name = String(feed?.name || feed?.raw?.name || "").trim().toLowerCase();
    const schedule = feed?.schedule || feed?.raw?.schedule || {};
    const url = String(schedule?.url || schedule?.uri || "").trim();
    return name && url ? `${name}\n${url}` : "";
  }

  async function requestCatalogFeedUpdateNow(productFeedId) {
    const normalizedFeedId = String(productFeedId || "");
    const actorId = String(getCurrentActorId() || "");
    if (!normalizedFeedId || !actorId) {
      return null;
    }
    try {
      const response = await businessGraphqlRequest(
        "24205943975656126",
        "CatalogFeedSchedulesSettingsContainerV2RequestUpdateMutation",
        {
          input: {
            actor_id: actorId,
            client_mutation_id: String(Date.now()),
            product_feed_id: normalizedFeedId,
            schedule_type: "REPLACE",
          },
        },
      );
      log("info", `Catalog feed update requested: ${normalizedFeedId}.`);
      return response;
    } catch (error) {
      log("warn", `Catalog feed update request failed for ${normalizedFeedId}.`, String(error));
      return null;
    }
  }

  function buildCatalogProductPayload(product) {
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

  function normalizeCatalogPriceForWrite(value) {
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

  async function copyCatalogProducts(sourceProducts, targetCatalogId) {
    const existingProducts = await graphGetAll(`${targetCatalogId}/products`, {
      fields: "id,retailer_id",
      limit: 200,
    }).catch(() => []);
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
        body: buildCatalogProductPayload({ ...product, retailer_id: retailerId }),
      });
      const targetId = String(created.id || created.product_id || "");
      productIdMap[String(product.id)] = targetId;
      targetByRetailer.set(retailerId, targetId);
      log("info", `Catalog product copied: ${retailerId}`);
    }
    return productIdMap;
  }

  async function fetchCatalogProductIdRows(catalogId) {
    return graphGetAll(`${catalogId}/products`, {
      fields: "id,retailer_id",
      limit: 200,
    }).catch((error) => {
      log("warn", `Catalog product ID map read failed for ${catalogId}.`, String(error));
      return [];
    });
  }

  async function waitForCatalogProducts(catalogId, expectedCount) {
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
      log("info", `Waiting for catalog products in ${catalogId}: ${rows.length}/${targetCount}.`);
      await sleep(5000);
    }
  }

  async function buildCatalogProductIdMapByRetailer(sourceCatalogId, targetCatalogId, expectedCount) {
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
      log("info", `Mapped ${Object.keys(productIdMap).length} catalog product IDs by retailer_id.`);
    }
    return productIdMap;
  }

  function remapProductSetFilter(filter, productIdMap) {
    if (!filter) {
      return "";
    }
    let parsed;
    try {
      parsed = typeof filter === "string" ? JSON.parse(filter) : deepClone(filter);
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

  async function copyCatalogProductSets(sourceProductSets, targetCatalogId, productIdMap) {
    const existingSets = await graphGetAll(`${targetCatalogId}/product_sets`, {
      fields: "id,name,filter",
      limit: 200,
    }).catch(() => []);
    const targetByName = new Map(existingSets.map((item) => [String(item.name || ""), item]));
    const productSetIdMap = {};
    for (const set of sourceProductSets) {
      const setName = String(set.name || "");
      if (targetByName.has(setName)) {
        const existing = targetByName.get(setName);
        const targetSetId = String(existing.id || "");
        productSetIdMap[String(set.id)] = targetSetId;
        const filter = remapProductSetFilter(set.filter, productIdMap);
        if (filter && targetSetId && String(existing.filter || "") !== String(filter)) {
          await graphFetch(targetSetId, {
            method: "POST",
            body: { filter },
          }).catch((error) => {
            log("warn", `Catalog product set update failed: ${setName}.`, String(error));
          });
        }
        continue;
      }
      const filter = remapProductSetFilter(set.filter, productIdMap);
      const body = { name: set.name || `Product set ${set.id}` };
      if (filter) {
        body.filter = filter;
      }
      const created = await graphFetch(`${targetCatalogId}/product_sets`, {
        method: "POST",
        body,
      });
      const targetSetId = String(created.id || "");
      productSetIdMap[String(set.id)] = targetSetId;
      log("info", `Catalog product set copied: ${body.name}`);
    }
    return productSetIdMap;
  }

  async function copyCatalogToTargetBusiness(sourceCatalogId, targetContext, packageData = null) {
    if (!targetContext?.business?.id) {
      throw new Error("Cannot copy catalog: target account has no visible Business Manager.");
    }
    const snapshot = await fetchCatalogCopySnapshot(sourceCatalogId, packageData);
    log("info", `Copying catalog ${snapshot.catalog.name} (${snapshot.productFeeds?.length || 0} feeds, ${snapshot.products.length} products, ${snapshot.productSets.length} sets).`);
    const targetCatalogId = await ensureTargetCatalogForCopy(snapshot.catalog, targetContext);
    const feedIdMap = await copyCatalogProductFeeds(snapshot.productFeeds || [], targetCatalogId);
    const productIdMap = snapshot.products.length
      ? await copyCatalogProducts(snapshot.products, targetCatalogId)
      : await buildCatalogProductIdMapByRetailer(snapshot.catalog.id, targetCatalogId, snapshot.catalog.productCount);
    const productSetIdMap = await copyCatalogProductSets(snapshot.productSets, targetCatalogId, productIdMap);
    return {
      sourceCatalogId: String(sourceCatalogId),
      targetCatalogId,
      feedIdMap,
      productIdMap,
      productSetIdMap,
    };
  }

  async function copyCatalogIntoExistingTarget(sourceCatalogId, targetCatalogId, packageData = null) {
    const snapshot = await fetchCatalogCopySnapshot(sourceCatalogId, packageData);
    log("info", `Copying catalog ${snapshot.catalog.name} into existing target catalog ${targetCatalogId}.`);
    const feedIdMap = await copyCatalogProductFeeds(snapshot.productFeeds || [], targetCatalogId);
    const productIdMap = snapshot.products.length
      ? await copyCatalogProducts(snapshot.products, targetCatalogId)
      : await buildCatalogProductIdMapByRetailer(snapshot.catalog.id, targetCatalogId, snapshot.catalog.productCount);
    const productSetIdMap = await copyCatalogProductSets(snapshot.productSets, targetCatalogId, productIdMap);
    return {
      sourceCatalogId: String(sourceCatalogId),
      targetCatalogId: String(targetCatalogId),
      feedIdMap,
      productIdMap,
      productSetIdMap,
    };
  }

  async function fetchTargetCatalogProductSets(catalogId) {
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
    }).then((items) => items.map((item) => ({ ...item, id: String(item.id) }))).catch((error) => {
      log("warn", `Target catalog product set lookup failed for catalog ${catalogId}.`, String(error));
      return [];
    });
  }

  function getPackageProductSetById(packageData, productSetId) {
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
      const found = (snapshot?.productSets || []).find((item) => String(item?.id || "") === normalizedId);
      if (found) {
        candidates.push(found);
      }
    }
    if (!candidates.length) {
      return null;
    }
    return candidates.reduce((best, current) => (
      rankProductSetMeta(current) > rankProductSetMeta(best) ? current : best
    ));
  }

  function resolveSourceProductSetCatalogId(packageData, productSetId) {
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
        String(raw.product_set_id || "") === normalizedId
        || (Array.isArray(raw.product_set_ids) && raw.product_set_ids.some((item) => String(item) === normalizedId));
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

  function pickFallbackTargetProductSet(sourceProductSet, targetProductSets) {
    const normalizedName = String(sourceProductSet?.name || "").trim().toLowerCase();
    const exactNameMatch = normalizedName
      ? targetProductSets.find((item) => String(item?.name || "").trim().toLowerCase() === normalizedName)
      : null;
    if (exactNameMatch?.id) {
      return exactNameMatch;
    }
    const cpasMatch = sourceProductSet?.cpas_category_product_set_id
      ? targetProductSets.find((item) =>
        String(item?.cpas_category_product_set_id || "") === String(sourceProductSet.cpas_category_product_set_id))
      : null;
    if (cpasMatch?.id) {
      return cpasMatch;
    }
    const allProductsMatch = targetProductSets.find((item) => /^all products$/i.test(String(item?.name || "").trim()));
    if (allProductsMatch?.id) {
      return allProductsMatch;
    }
    const autogenMatch = targetProductSets.find((item) => Boolean(item?.is_autogen_product_set));
    if (autogenMatch?.id) {
      return autogenMatch;
    }
    if (targetProductSets.length === 1 && targetProductSets[0]?.id) {
      return targetProductSets[0];
    }
    return null;
  }

  async function enrichFallbackProductSetMappings(packageData, catalogMappings, productSetMappings) {
    const nextProductSetMappings = { ...(productSetMappings || {}) };
    const sourceProductSets = getSourceProductSetsFromPackage(packageData);
    const sourceCatalogs = getSourceCatalogsFromPackage(packageData);
    const targetProductSetsByCatalog = new Map();
    for (const sourceProductSet of sourceProductSets) {
      const sourceProductSetId = String(sourceProductSet.id || "");
      if (!sourceProductSetId || nextProductSetMappings[sourceProductSetId]) {
        continue;
      }
      const sourceCatalogId = resolveSourceProductSetCatalogId(packageData, sourceProductSetId);
      if (!sourceCatalogId) {
        continue;
      }
      const targetCatalogId = String(catalogMappings?.[sourceCatalogId] || sourceCatalogId || "");
      if (!targetCatalogId) {
        continue;
      }
      if (targetCatalogId === sourceCatalogId) {
        continue;
      }
      if (!targetProductSetsByCatalog.has(targetCatalogId)) {
        targetProductSetsByCatalog.set(targetCatalogId, await fetchTargetCatalogProductSets(targetCatalogId));
      }
      const targetProductSets = targetProductSetsByCatalog.get(targetCatalogId) || [];
      if (!targetProductSets.length) {
        continue;
      }
      const sourceProductSetMeta = getPackageProductSetById(packageData, sourceProductSetId) || sourceProductSet;
      const targetProductSet = pickFallbackTargetProductSet(sourceProductSetMeta, targetProductSets);
      if (!targetProductSet?.id) {
        continue;
      }
      nextProductSetMappings[sourceProductSetId] = String(targetProductSet.id);
      const sourceCatalogCount = sourceCatalogs.length;
      const fallbackReason = sourceProductSetMeta?.product_catalog?.id || sourceProductSetMeta?.catalog_id
        ? "name/CPAS match"
        : (sourceCatalogCount === 1 ? "single-source-catalog fallback" : "target default set fallback");
      log("warn", `Fallback-mapped source product set ${sourceProductSetId} -> ${targetProductSet.id} (${targetProductSet.name || targetProductSet.id}) using ${fallbackReason}.`);
    }
    return nextProductSetMappings;
  }

  async function prepareCatalogMappingsForImport(packageData, targetContext, catalogMappings) {
    const sourceCatalogs = getSourceCatalogsFromPackage(packageData);
    const nextCatalogMappings = { ...(catalogMappings || {}) };
    let productSetMappings = {};
    const copiedCatalogIds = new Set();
    for (const catalog of sourceCatalogs) {
      const sourceId = String(catalog.id);
      if (nextCatalogMappings[sourceId] === "__copy__") {
        const copied = await copyCatalogToTargetBusiness(sourceId, targetContext, packageData);
        nextCatalogMappings[sourceId] = copied.targetCatalogId;
        copiedCatalogIds.add(String(copied.targetCatalogId));
        Object.assign(productSetMappings, copied.productSetIdMap);
        invalidateAccountContextCache(state.importAccountId);
        continue;
      }
      if (nextCatalogMappings[sourceId] && nextCatalogMappings[sourceId] !== sourceId) {
        const copied = await copyCatalogIntoExistingTarget(sourceId, nextCatalogMappings[sourceId], packageData);
        Object.assign(productSetMappings, copied.productSetIdMap);
      }
    }
    productSetMappings = await enrichFallbackProductSetMappings(
      packageData,
      nextCatalogMappings,
      productSetMappings,
    );
    validateCatalogMappingsForImport(packageData, targetContext, nextCatalogMappings, productSetMappings, copiedCatalogIds);
    return { catalogMappings: nextCatalogMappings, productSetMappings };
  }

  function normalizeImportOptions(options) {
    if (!options || typeof options !== "object" || typeof options.preventDefault === "function") {
      return {};
    }
    return options;
  }

  function buildAdsManagerAccountUrl(accountId) {
    const url = new URL(window.location.href);
    url.pathname = "/adsmanager/manage/campaigns";
    if (accountId) {
      url.searchParams.set("act", String(accountId));
    }
    return url.toString();
  }

  function parsePreviewPayloadFromUrl(url) {
    if (!url) {
      return null;
    }
    try {
      const parsed = new URL(url);
      const read = (key) => {
        const raw = parsed.searchParams.get(key);
        return raw ? JSON.parse(raw) : null;
      };
      return {
        creative: read("creative"),
        campaign: read("campaign"),
        campaignGroup: read("campaign_group"),
      };
    } catch (_error) {
      return null;
    }
  }

  function inspectDynamicCreativeEditorState(editorWindow) {
    try {
      const text = String(editorWindow?.document?.body?.innerText || "");
      const previewUrl = editorWindow?.performance
        ?.getEntriesByType("resource")
        ?.map((entry) => entry.name)
        ?.filter((url) => url.includes("/ads/ad_preview/render_props/"))
        ?.slice(-1)?.[0] || "";
      const preview = parsePreviewPayloadFromUrl(previewUrl);
      const creative = preview?.creative || null;
      return {
        text,
        previewUrl,
        hasDynamicEnabled: text.includes("Dynamic creative is enabled"),
        hasFormatSection: /(?:^|\n)Format(?:\s|\n)/.test(text),
        hasUseFacebookPage: text.includes("Use Facebook Page"),
        hasSelectInstagramAccount: text.includes("Select an Instagram account"),
        instagramActorId: String(creative?.object_story_spec?.instagram_actor_id || ""),
        instagramUserId: String(creative?.object_story_spec?.instagram_user_id || ""),
        hasDestinationSpec: Boolean(
          creative?.destination_spec?.native_commerce_experience?.shop?.action_metadata,
        ),
      };
    } catch (_error) {
      return {
        text: "",
        previewUrl: "",
        hasDynamicEnabled: false,
        hasFormatSection: false,
        hasUseFacebookPage: false,
        hasSelectInstagramAccount: false,
        instagramActorId: "",
        instagramUserId: "",
        hasDestinationSpec: false,
      };
    }
  }

  async function waitForCondition(label, predicate, timeoutMs = 120000, intervalMs = 1000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      try {
        const result = await predicate();
        if (result) {
          return result;
        }
      } catch (_error) {
        // noop
      }
      await sleep(intervalMs);
    }
    throw new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s.`);
  }

  function reloadAdsManagerResult(accountId) {
    const targetUrl = buildAdsManagerAccountUrl(accountId);
    if (window.location.href === targetUrl) {
      window.location.reload();
    } else {
      window.location.assign(targetUrl);
    }
  }

  function askToReloadResult(message, accountId) {
    if (state.reloadTimer) {
      clearTimeout(state.reloadTimer);
      state.reloadTimer = null;
    }
    const promptText = message || "Import finished. Reload Ads Manager to show the updated result?";
    let shouldReload = false;
    try {
      shouldReload = window.confirm(promptText);
    } catch (_error) {
      shouldReload = false;
    }
    if (!shouldReload) {
      log("info", "Result is ready. Reload skipped by user.");
      return;
    }
    log("info", "Reloading Ads Manager to show the updated result.");
    state.reloadTimer = window.setTimeout(() => {
      reloadAdsManagerResult(accountId);
    }, 1200);
  }

  async function importPackage(options) {
    const importOptions = normalizeImportOptions(options);
    const reloadOnSuccess = importOptions.reloadOnSuccess !== false;
    const originalImportPackage = state.importPackage;
    if (!state.importPackage) {
      log("warn", "Select a package JSON first.");
      return false;
    }
    if (!state.importAccountId) {
      log("warn", "Select an account for import first.");
      return false;
    }
    setBusy(true);
    try {
      await initializeSession();
      await refreshImportAccountContext();
      enforceImportModeConstraints();
      if (importOptions.pageMappings) {
        state.importPageMappings = {
          ...state.importPageMappings,
          ...importOptions.pageMappings,
        };
      }
      if (importOptions.pixelMappings) {
        state.importPixelMappings = {
          ...state.importPixelMappings,
          ...importOptions.pixelMappings,
        };
      }
      if (importOptions.catalogMappings) {
        state.importCatalogMappings = {
          ...state.importCatalogMappings,
          ...importOptions.catalogMappings,
        };
      }
      const importContext = await fetchAccountContext(state.importAccountId);
      const preparedCatalogs = await prepareCatalogMappingsForImport(
        originalImportPackage,
        importContext,
        state.importCatalogMappings,
      );
      state.importCatalogMappings = preparedCatalogs.catalogMappings;
      state.importPackage = shiftPackageScheduleForImport(
        materializePixelMappedPackage(
          materializeCatalogMappedPackage(
            materializePageMappedPackage(originalImportPackage, state.importPageMappings),
            state.importCatalogMappings,
            preparedCatalogs.productSetMappings,
          ),
          state.importPixelMappings,
        ),
      );

      // Derive special_ad_category_country from adset targeting if missing
      const campaign = state.importPackage.campaign;
      if (campaign.special_ad_categories?.length && !campaign.special_ad_category_country) {
        const countries = new Set();
        for (const adset of (state.importPackage.adsets || [])) {
          for (const c of (adset.targeting?.geo_locations?.countries || [])) {
            countries.add(c);
          }
        }
        if (countries.size) {
          campaign.special_ad_category_country = [...countries];
          log("info", `Detected countries for special ad category: ${campaign.special_ad_category_country.join(", ")}`);
        }
      }

      const pixelMap = await resolvePixelMap(state.importAccountId);
      const adsetMap = new Map();
      const creativeMap = new Map();
      const mediaCache = {
        images: new Map(),
        imageUrls: new Map(),
        videos: new Map(),
      };

      if (state.importAsDraft) {
        await discardCurrentDraft(state.importAccountId);
        const draftId = await getCurrentDraftId(state.importAccountId);
        log("info", `Using draft ${draftId}.`);
        const packageHasCampaignBudget = hasCampaignLevelBudget(state.importPackage.campaign);
        const effectiveHasDayParting = packageHasDayParting(state.importPackage) && !packageHasCampaignBudget;
        const draftCampaignId = await createCampaignDraft(
          state.importAccountId,
          draftId,
          state.importPackage.campaign,
          { hasDayParting: effectiveHasDayParting },
        );
        const draftAdContext = new Map();

        for (const adset of state.importPackage.adsets) {
          const newAdsetId = await createAdsetDraft(
            state.importAccountId,
            draftId,
            draftCampaignId,
            adset,
            pixelMap,
            { hasCampaignBudget: packageHasCampaignBudget },
          );
          adsetMap.set(String(adset.id), newAdsetId);
          log("info", `Draft adset created: ${adset.name}`);
        }

        for (const ad of state.importPackage.ads) {
          const creative = state.importPackage.creatives.find((item) => String(item.id) === String(ad?.creative?.id));
          if (!creative) {
            log("warn", `Ad ${ad.name} skipped: creative ${ad?.creative?.id} not found in package.`);
            continue;
          }
          if (!creativeMap.has(creative.id)) {
            const creativePayload = await resolveCreativeDraftPayload(
              state.importAccountId,
              creative,
              mediaCache,
            );
            if (!creativePayload) {
              creativeMap.set(creative.id, null);
            } else {
              creativeMap.set(creative.id, creativePayload);
            }
          }
          const draftCreative = creativeMap.get(creative.id);
          const adsetDraftId = adsetMap.get(String(ad?.adset?.id));
          if (!draftCreative || !adsetDraftId) {
            log("warn", `Ad ${ad.name} skipped: failed to build draft creative/adset.`);
            continue;
          }
          const sourcePageId = getSourcePageId(creative);
          const mappedPageId = state.importPageMappings[sourcePageId] || sourcePageId;
          const newDraftAdId = await createAdDraft(
            state.importAccountId,
            draftId,
            draftCampaignId,
            adsetDraftId,
            ad,
            draftCreative,
          );
          const context = {
            adId: String(newDraftAdId),
            adName: ad.name,
            pageId: String(mappedPageId || ""),
            creativeId: String(creative.id || ""),
            tempId: "",
          };
          draftAdContext.set(`id:${context.adId}`, context);
          draftAdContext.set(`name:${String(context.adName || "").trim().toLowerCase()}`, context);
          log("info", `Draft ad created: ${ad.name}`);
        }

        await ensureDraftInstagramIdentityParity(state.importAccountId, draftId, draftAdContext);
        await logDraftValidation(state.importAccountId, draftId);
        log("info", "Draft import complete. No publishing performed.");
      } else {
        const shouldActivateAfterCreate = state.importStatus === "ACTIVE";
        const creationStatus = shouldActivateAfterCreate ? "PAUSED" : state.importStatus;
        if (shouldActivateAfterCreate) {
          log("info", "Creating ACTIVE import as PAUSED first, then activating after adsets and ads exist.");
        }
        const newCampaignId = await createCampaign(state.importAccountId, state.importPackage.campaign, {
          status: creationStatus,
        });
        log("info", `Campaign created: ${newCampaignId}`);
        const packageHasCampaignBudget = hasCampaignLevelBudget(state.importPackage.campaign);
        const createdAdsetIds = [];
        const createdAdIds = [];

        for (const adset of state.importPackage.adsets) {
          const newAdsetId = await createAdset(
            state.importAccountId,
            newCampaignId,
            adset,
            pixelMap,
            { hasCampaignBudget: packageHasCampaignBudget, status: creationStatus },
          );
          adsetMap.set(String(adset.id), newAdsetId);
          createdAdsetIds.push(newAdsetId);
          log("info", `Adset created: ${adset.name}`);
        }

        for (const ad of state.importPackage.ads) {
          const creative = state.importPackage.creatives.find((item) => String(item.id) === String(ad?.creative?.id));
          if (!creative) {
            log("warn", `Ad ${ad.name} skipped: creative ${ad?.creative?.id} not found.`);
            continue;
          }
          if (!creativeMap.has(creative.id)) {
            const creativeId = await resolveCreativeImport(
              state.importAccountId,
              creative,
              mediaCache,
            );
            creativeMap.set(creative.id, creativeId || null);
          }
          const newCreativeId = creativeMap.get(creative.id);
          const newAdsetId = adsetMap.get(String(ad?.adset?.id));
          if (!newCreativeId || !newAdsetId) {
            log("warn", `Ad ${ad.name} skipped: creative/adset not prepared.`);
            continue;
          }
          const newAdId = await createAd(state.importAccountId, newAdsetId, ad, newCreativeId, {
            status: creationStatus,
          });
          createdAdIds.push(newAdId);
          log("info", `Ad created: ${ad.name}`);
        }

        if (shouldActivateAfterCreate) {
          await activateCreatedCampaignTree(newCampaignId, createdAdsetIds, createdAdIds);
        }
        log("info", "Import complete.");
      }
      if (reloadOnSuccess) {
        askToReloadResult(state.importAsDraft
          ? "Draft is ready. Reload Ads Manager to show the new draft?"
          : "Import is complete. Reload Ads Manager to show the new entities?",
        state.importAccountId);
      }
      return true;
    } catch (error) {
      log("error", "Import error.", String(error));
      return false;
    } finally {
      state.importPackage = originalImportPackage;
      setBusy(false);
    }
  }

  const services = createServiceRegistry({
    initializeSession,
    graphFetch,
    graphGetAll,
    graphPageFetch,
    graphPageGetAll,
    privateGraphqlRequest,
    businessGraphqlRequest,
    privateGraphqlMutation,
    fetchAccountContext,
    invalidateAccountContextCache,
    fetchCampaignExportPackage,
    exportSelectedCampaign,
    importPackage,
    cloneCampaignToAccount,
    ensureClonePackageLoaded,
    resolveCreativeImport,
    resolveCreativeDraftPayload,
    fetchCurrentDraftDetails,
    ensureDraftInstagramIdentityParity,
    logDraftValidation,
    fetchCatalogExportSnapshot,
    fetchCatalogExportsForPackage,
    copyCatalogToTargetBusiness,
    copyCatalogIntoExistingTarget,
    ensurePageIdentityProfiles,
    fetchAdsManagerInstagramObjectRecord,
    resolveInstagramIdentityForPage,
    uploadImage,
    uploadVideo,
    uploadImageAsset,
    getPreferredVideoThumbnail,
  });
  const panel = new AdReplicaPanel({ mount, destroy, renderUI });

  const publicApi = new AdReplicaApp({
    mount: () => panel.mount(),
    destroy: () => panel.destroy(),
    state,
    initSession: initializeSession,
    services,
    debug: {
      setState: (partialState = {}) => {
        if (!partialState || typeof partialState !== "object") {
          return state;
        }
        Object.assign(state, partialState);
        renderUI();
        return state;
      },
      renderUI: () => {
        renderUI();
        return state;
      },
      privateGraphqlMutation: (docId, friendlyName, variables) => privateGraphqlMutation(docId, friendlyName, variables),
      ensureClonePackageLoaded: () => ensureClonePackageLoaded(),
      runClone: (options = {}) => cloneCampaignToAccount(options),
      runImport: (options = {}) => importPackage(options),
      repairDraftIdentity: (accountId, draftId) => ensureDraftInstagramIdentityParity(accountId, draftId),
      repairDraftIdentityWithContext: (accountId, draftId, contexts = []) => {
        const map = new Map();
        for (const context of Array.isArray(contexts) ? contexts : []) {
          const normalized = {
            adId: String(context?.adId || ""),
            adName: String(context?.adName || ""),
            pageId: String(context?.pageId || ""),
            creativeId: String(context?.creativeId || ""),
            tempId: String(context?.tempId || ""),
          };
          if (normalized.adId) {
            map.set(`id:${normalized.adId}`, normalized);
          }
          if (normalized.adName) {
            map.set(`name:${normalized.adName.trim().toLowerCase()}`, normalized);
          }
          if (normalized.tempId) {
            map.set(`temp:${normalized.tempId}`, normalized);
          }
        }
        return ensureDraftInstagramIdentityParity(accountId, draftId, map);
      },
      scanDraftIdentity: async (accountId, draftId) => {
        const draft = await fetchCurrentDraftDetails(accountId, draftId);
        return (draft?.addraft_fragments?.data || []).map(getAffectedDraftIdentityFragment).filter(Boolean);
      },
      ensurePageIdentityProfiles: (pageId, itemName = "", accountId = "") => ensurePageIdentityProfiles(pageId, itemName, accountId),
      privateMutation: (docId, friendlyName, variables) => privateGraphqlMutation(docId, friendlyName, variables),
      inspectEditorState: () => inspectDynamicCreativeEditorState(window),
      fetchEntity: async (id, fields) => graphFetch(id, {
        query: {
          fields,
        },
      }),
      graphFetch: (pathOrUrl, options = {}) => graphFetch(pathOrUrl, options),
      graphGetAll: (path, query = {}) => graphGetAll(path, query),
      fetchExportPackage: (accountId, campaignId) => fetchCampaignExportPackage(accountId, campaignId),
      fetchCatalogExportSnapshot: (catalogId) => fetchCatalogExportSnapshot({ id: catalogId }),
      fetchCatalogExportsForPackage: (catalogs) => fetchCatalogExportsForPackage(catalogs),
      fetchAccountContext: (accountId) => fetchAccountContext(accountId),
      copyCatalogToTargetBusiness: (sourceCatalogId, targetAccountId) =>
        fetchAccountContext(targetAccountId).then((context) => copyCatalogToTargetBusiness(sourceCatalogId, context)),
      copyCatalogIntoExistingTarget: (sourceCatalogId, targetCatalogId) =>
        copyCatalogIntoExistingTarget(sourceCatalogId, targetCatalogId),
      fetchAdsManagerInstagramObjectRecord: (instagramObjectId, accountId = "") => fetchAdsManagerInstagramObjectRecord(instagramObjectId, accountId),
      inspectCurrentDraft: async (accountId) => graphFetch(`act_${accountId}/current_addrafts`, {
        query: {
          fields: [
            "id",
            "state",
            "publish_status{status,error_count,publish_error}",
            "addraft_fragments.limit(500){id,ad_object_type,ad_object_id,validation_status,active_errors,publish_error,values}",
          ].join(","),
        },
      }),
      inspectDynamicCreativeEditorState: (targetWindow = window) => inspectDynamicCreativeEditorState(targetWindow),
    },
  }).toPublicApi();

  window.AdReplica = publicApi;

  panel.mount();
})();
